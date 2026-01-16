/**
 * Scan API routes
 *
 * POST /api/v1/scans - Trigger new scan
 * GET /api/v1/scans - List scans
 * GET /api/v1/scans/:id - Get scan by ID
 * GET /api/v1/scans/:id/progress - SSE progress stream
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  scanProject,
  analyzeBehavior,
  createLLMClientFromEnv,
  type ScanResult,
  type AnalysisProgress,
} from '@surveyor/core';

// Store active scans for progress tracking
const activeScans = new Map<string, {
  progress: AnalysisProgress | null;
  phase: 'scanning' | 'analyzing' | 'complete' | 'error';
  error?: string;
}>();

export const scanRoutes = new Hono();

/**
 * POST / - Trigger a new scan
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

  try {
    console.log(`[scan] Starting scan of ${absolutePath}`);

    // Run the scan
    let result = await scanProject(absolutePath, { verbose: false });
    console.log(`[scan] Parsed ${result.stats.totalFiles} files, ${result.stats.totalFunctions} functions`);

    // Store initial progress
    activeScans.set(result.id, { progress: null, phase: 'scanning' });

    // Run behavioral analysis if not skipped and API key available
    const skipAnalysis = options.skipAnalysis ?? !process.env.SURVEYOR_LLM_API_KEY;

    if (!skipAnalysis && process.env.SURVEYOR_LLM_API_KEY) {
      try {
        activeScans.set(result.id, { progress: null, phase: 'analyzing' });

        const client = createLLMClientFromEnv();
        const outputDir = options.outputDir || path.join(absolutePath, '.surveyor');

        const onProgress = (progress: AnalysisProgress) => {
          activeScans.set(result.id, { progress, phase: 'analyzing' });
          console.log(`[analyze] ${progress.current}/${progress.total}: ${progress.functionName}`);
        };

        const concurrency = parseInt(process.env.SURVEYOR_LLM_CONCURRENCY || '10', 10);
        console.log(`[analyze] Starting with concurrency=${concurrency}`);

        result = await analyzeBehavior(result, client, {
          onProgress,
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

    const outputPath = path.join(outputDir, `scan-${result.id}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    activeScans.set(result.id, { progress: null, phase: 'complete' });
    console.log(`[scan] Complete! Saved to ${outputPath}`);

    return c.json({
      scanId: result.id,
      status: result.status,
      outputPath,
      result,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Scan failed: ${error}` }, 500);
  }
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
scanRoutes.get('/:id/progress', (c) => {
  const id = c.req.param('id');

  return streamSSE(c, async (stream) => {
    // Poll for progress updates
    const interval = setInterval(async () => {
      const scanState = activeScans.get(id);

      if (!scanState) {
        await stream.writeSSE({ data: JSON.stringify({ phase: 'not_found' }), event: 'error' });
        clearInterval(interval);
        return;
      }

      // Send phase updates
      await stream.writeSSE({
        data: JSON.stringify({
          phase: scanState.phase,
          progress: scanState.progress,
        }),
        event: 'progress',
      });

      // Check if complete or error
      if (scanState.phase === 'complete' || scanState.phase === 'error') {
        clearInterval(interval);
        await stream.close();
      }
    }, 500);

    // Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(interval);
    });
  });
});
