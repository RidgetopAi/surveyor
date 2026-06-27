/**
 * Job-based scan API (the clean contract Mandrel calls).
 *
 *   POST /api/v1/scans            -> { jobId, status: 'queued' }   (starts async)
 *   GET  /api/v1/scans            -> { jobs: JobSummary[] }
 *   GET  /api/v1/scans/:jobId     -> { jobId, status, progress, error? }
 *   GET  /api/v1/scans/:jobId/result   -> full ScanResult (200) when done
 *   GET  /api/v1/scans/:jobId/progress -> SSE progress stream (does NOT start a scan)
 *
 * The scan is started by the runner at POST time — NOT by the SSE connection.
 */

import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { ServerConfig } from '../config.js';
import type { JobStore, ScanRunOptions } from '../store/job-store.js';
import { JobStoreFullError } from '../store/job-store.js';
import type { ScanRunner } from '../scan-runner.js';
import { measureRepo } from '../repo-limits.js';

export interface ScanRoutesDeps {
  config: ServerConfig;
  store: JobStore;
  runner: ScanRunner;
  /** Remove a job and clean up its workspace (evict-after-retrieve). */
  evict: (jobId: string) => void;
}

interface CreateScanBody {
  projectPath?: string;
  options?: ScanRunOptions;
}

export function createScanRoutes(deps: ScanRoutesDeps): Hono {
  const { config, store, runner, evict } = deps;
  const routes = new Hono();

  // POST / — create + start a scan job.
  routes.post('/', async (c) => {
    let body: CreateScanBody;
    try {
      body = await c.req.json<CreateScanBody>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const rawPath = body.projectPath;
    if (!rawPath || typeof rawPath !== 'string') {
      return c.json({ error: 'projectPath is required' }, 400);
    }

    const projectPath = path.resolve(rawPath);
    if (!fs.existsSync(projectPath)) {
      return c.json({ error: `Path does not exist: ${projectPath}` }, 400);
    }
    if (!fs.statSync(projectPath).isDirectory()) {
      return c.json({ error: `Path is not a directory: ${projectPath}` }, 400);
    }

    // Resource limit: reject an oversize repo BEFORE scanning it.
    const measure = measureRepo(projectPath, config.limits);
    if (!measure.ok) {
      return c.json(
        {
          error:
            measure.reason === 'too_many_files'
              ? `Repo exceeds file-count limit (${measure.fileCount} > ${measure.limit})`
              : `Repo exceeds size limit (${measure.bytes} bytes > ${measure.limit})`,
          reason: measure.reason,
          fileCount: measure.fileCount,
          bytes: measure.bytes,
          limit: measure.limit,
        },
        413,
      );
    }

    // Backpressure: refuse new work beyond the queue ceiling.
    if (runner.queueDepth >= config.limits.maxQueuedJobs) {
      return c.json(
        { error: `Queue full (${runner.queueDepth} waiting); retry later` },
        503,
      );
    }

    const jobId = uuidv4();
    const workspaceDir = path.join(config.workspaceRoot, jobId);

    try {
      store.create({
        id: jobId,
        projectPath,
        workspaceDir,
        options: body.options ?? {},
      });
    } catch (err) {
      if (err instanceof JobStoreFullError) {
        return c.json({ error: err.message }, 503);
      }
      throw err;
    }

    runner.enqueue(jobId);

    return c.json({ jobId, status: 'queued' as const }, 202);
  });

  // GET / — list job summaries (store-backed, not disk-backed).
  routes.get('/', (c) => {
    return c.json({ jobs: store.list() });
  });

  // GET /:jobId — status + progress.
  routes.get('/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    const job = store.get(jobId);
    if (!job) return c.json({ error: `Job not found: ${jobId}` }, 404);
    return c.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      ...(job.error !== undefined ? { error: job.error } : {}),
    });
  });

  // GET /:jobId/result — the full ScanResult once done.
  routes.get('/:jobId/result', (c) => {
    const jobId = c.req.param('jobId');
    const job = store.get(jobId);
    if (!job) return c.json({ error: `Job not found: ${jobId}` }, 404);

    if (job.status === 'error') {
      return c.json({ error: job.error ?? 'Scan failed', status: 'error' }, 500);
    }
    if (job.status !== 'done' || !job.result) {
      return c.json({ status: job.status, error: 'Result not ready' }, 409);
    }

    const result = job.result;

    // Evict-after-result-retrieved: Mandrel has the durable copy now (P4b), so we
    // drop ours and clean the workspace. Capture the body first.
    if (config.store.evictAfterResultRetrieved) {
      evict(jobId);
    }

    return c.json({ result });
  });

  // GET /:jobId/progress — SSE stream. Reports current store state; does NOT
  // start a scan. Closes once the job reaches a terminal state.
  routes.get('/:jobId/progress', (c) => {
    const jobId = c.req.param('jobId');

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        let interval: ReturnType<typeof setInterval> | null = null;

        const send = (data: object) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
            if (interval) clearInterval(interval);
          }
        };

        const tick = (): boolean => {
          const job = store.get(jobId);
          if (!job) {
            send({ status: 'not_found' });
            return false;
          }
          send({
            status: job.status,
            progress: job.progress,
            ...(job.error !== undefined ? { error: job.error } : {}),
          });
          return job.status !== 'done' && job.status !== 'error';
        };

        if (!tick()) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }

        interval = setInterval(() => {
          if (closed) {
            if (interval) clearInterval(interval);
            return;
          }
          if (!tick()) {
            if (interval) clearInterval(interval);
            interval = null;
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }, 200);
        interval.unref?.();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });

  return routes;
}
