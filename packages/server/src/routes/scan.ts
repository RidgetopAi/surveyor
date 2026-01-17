/**
 * Scan API routes
 *
 * POST /api/v1/scans - Trigger new scan
 * GET /api/v1/scans - List scans
 * GET /api/v1/scans/:id - Get scan by ID
 * GET /api/v1/scans/:id/progress - SSE progress stream
 */

import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  scanProject,
  analyzeBehavior,
  createLLMClientFromEnv,
  type ScanResult,
  type ScanProgress,
} from '@surveyor/core';

// Store active scans for progress tracking
const activeScans = new Map<string, {
  progress: ScanProgress;
  result?: ScanResult;
  outputPath?: string;
}>();

export const scanRoutes = new Hono();

/**
 * POST / - Trigger a new scan (returns immediately, runs in background)
 */
scanRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    projectPath: string;
    options?: {
      skipAnalysis?: boolean;
      outputDir?: string;
    };
  }>();

  const { projectPath, options = {} } = body;

  // Validate path exists
  const absolutePath = path.resolve(projectPath);
  if (!fs.existsSync(absolutePath)) {
    return c.json({ error: `Path does not exist: ${absolutePath}` }, 400);
  }

  if (!fs.statSync(absolutePath).isDirectory()) {
    return c.json({ error: `Path is not a directory: ${absolutePath}` }, 400);
  }

  // Generate scanId upfront so we can return immediately
  const scanId = uuidv4();

  // Initialize progress tracking
  activeScans.set(scanId, {
    progress: { phase: 'scanning', current: 0, total: 0 },
  });

  console.log(`[scan] Starting scan ${scanId} of ${absolutePath}`);

  // Run scan in background
  setImmediate(async () => {
    try {
      // Run the scan with progress callback
      let result = await scanProject(absolutePath, {
        verbose: false,
        onProgress: (progress) => {
          activeScans.set(scanId, { progress });
          if (progress.current % 10 === 0 || progress.current === progress.total) {
            console.log(`[scan] ${progress.current}/${progress.total}: ${progress.filePath}`);
          }
        },
      });

      // Override the generated ID with our pre-assigned scanId
      result = { ...result, id: scanId };

      console.log(`[scan] Parsed ${result.stats.totalFiles} files, ${result.stats.totalFunctions} functions`);

      // Run behavioral analysis if not skipped and API key available
      const skipAnalysis = options.skipAnalysis ?? !process.env.SURVEYOR_LLM_API_KEY;

      if (!skipAnalysis && process.env.SURVEYOR_LLM_API_KEY) {
        try {
          activeScans.set(scanId, {
            progress: { phase: 'analyzing', current: 0, total: result.stats.totalFunctions },
          });

          const client = createLLMClientFromEnv();
          const outputDir = options.outputDir || path.join(absolutePath, '.surveyor');

          const concurrency = parseInt(process.env.SURVEYOR_LLM_CONCURRENCY || '10', 10);
          console.log(`[analyze] Starting with concurrency=${concurrency}`);

          result = await analyzeBehavior(result, client, {
            onProgress: (analysisProgress) => {
              activeScans.set(scanId, {
                progress: {
                  phase: 'analyzing',
                  current: analysisProgress.current,
                  total: analysisProgress.total,
                  functionName: analysisProgress.functionName,
                  filePath: analysisProgress.filePath,
                  fromCache: analysisProgress.fromCache,
                },
              });
              console.log(`[analyze] ${analysisProgress.current}/${analysisProgress.total}: ${analysisProgress.functionName}`);
            },
            cacheDir: outputDir,
            model: process.env.SURVEYOR_LLM_MODEL || 'grok-4-1-fast-reasoning',
            concurrency,
          });
        } catch (analyzeErr) {
          const msg = analyzeErr instanceof Error ? analyzeErr.message : String(analyzeErr);
          console.error(`Analysis failed: ${msg}`);
          // Continue with scan results only
        }
      }

      // Save scan result
      const outputDir = options.outputDir || path.join(absolutePath, '.surveyor');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `scan-${scanId}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

      // Mark complete with result available
      activeScans.set(scanId, {
        progress: { phase: 'complete', current: result.stats.totalFiles, total: result.stats.totalFiles },
        result,
        outputPath,
      });
      console.log(`[scan] Complete! Saved to ${outputPath}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[scan] Failed: ${error}`);
      activeScans.set(scanId, {
        progress: { phase: 'error', current: 0, total: 0, error },
      });
    }
  });

  // Return immediately with scanId
  return c.json({
    scanId,
    status: 'IN_PROGRESS',
  });
});

/**
 * GET / - List available scans
 */
scanRoutes.get('/', async (c) => {
  const projectPath = c.req.query('projectPath');
  const limit = parseInt(c.req.query('limit') || '10', 10);

  // Default to current directory's .surveyor folder
  const searchPath = projectPath
    ? path.join(path.resolve(projectPath), '.surveyor')
    : path.join(process.cwd(), '.surveyor');

  if (!fs.existsSync(searchPath)) {
    return c.json({ scans: [], total: 0 });
  }

  try {
    const files = fs.readdirSync(searchPath)
      .filter(f => f.startsWith('scan-') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(searchPath, f);
        const stat = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, limit);

    const scans = files.map(f => {
      const content = fs.readFileSync(f.path, 'utf-8');
      const scan = JSON.parse(content) as ScanResult;
      return {
        id: scan.id,
        projectName: scan.projectName,
        projectPath: scan.projectPath,
        status: scan.status,
        createdAt: scan.createdAt,
        stats: scan.stats,
      };
    });

    return c.json({ scans, total: scans.length });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to list scans: ${error}` }, 500);
  }
});

/**
 * GET /:id - Get scan by ID
 */
scanRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const projectPath = c.req.query('projectPath');

  // Search for scan file
  const searchPath = projectPath
    ? path.join(path.resolve(projectPath), '.surveyor')
    : path.join(process.cwd(), '.surveyor');

  const scanFile = path.join(searchPath, `scan-${id}.json`);

  if (!fs.existsSync(scanFile)) {
    return c.json({ error: `Scan not found: ${id}` }, 404);
  }

  try {
    const content = fs.readFileSync(scanFile, 'utf-8');
    const scan = JSON.parse(content) as ScanResult;
    return c.json({ scan });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to read scan: ${error}` }, 500);
  }
});

/**
 * GET /:id/progress - SSE stream for scan progress
 */
scanRoutes.get('/:id/progress', async (c) => {
  const id = c.req.param('id');

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('Access-Control-Allow-Origin', '*');

  let interval: NodeJS.Timeout | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: object) => {
        if (closed) return;
        try {
          const message = `event: progress\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Controller already closed
          closed = true;
          if (interval) clearInterval(interval);
        }
      };

      const sendProgress = () => {
        if (closed) return false;

        const scanState = activeScans.get(id);

        if (!scanState) {
          sendEvent({ phase: 'not_found' });
          return false;
        }

        const { progress, result, outputPath } = scanState;

        sendEvent({
          phase: progress.phase,
          progress,
          ...(progress.phase === 'complete' && result ? {
            result: {
              id: result.id,
              stats: result.stats,
              status: result.status,
            },
            outputPath,
          } : {}),
        });

        return progress.phase !== 'complete' && progress.phase !== 'error';
      };

      // Send immediate first update
      console.log(`[SSE ${id}] Sending first update`);
      sendProgress();

      // Poll for progress updates every 200ms
      console.log(`[SSE ${id}] Starting poll interval`);
      interval = setInterval(() => {
        if (closed) {
          if (interval) clearInterval(interval);
          return;
        }
        console.log(`[SSE ${id}] Poll tick`);
        sendProgress();
      }, 200);
    },
    cancel() {
      console.log(`[SSE ${id}] Client disconnected`);
      closed = true;
      if (interval) clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
