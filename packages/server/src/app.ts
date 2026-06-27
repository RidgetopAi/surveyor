/**
 * App + runtime composition.
 *
 * `buildApp` wires the Hono app from explicit dependencies (config, store,
 * runner) so tests can inject a fake scan runner / fake-clock store. `createRuntime`
 * builds the production wiring (in-memory bounded store + real core scan fn) and
 * is what `index.ts` serves.
 */

import * as fs from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ServerConfig } from './config.js';
import { isOriginAllowed } from './cors-origin.js';
import { bearerAuth } from './middleware/auth.js';
import {
  InMemoryJobStore,
  type Job,
  type JobStore,
} from './store/job-store.js';
import { ScanRunner, type ScanFn } from './scan-runner.js';
import { createScanRoutes } from './routes/scans.js';
import { makeCoreScanFn } from './core-scan.js';

export interface AppDeps {
  config: ServerConfig;
  store: JobStore;
  runner: ScanRunner;
  /** Remove a job + clean its workspace (used by evict-after-retrieve). */
  evict: (jobId: string) => void;
}

export function buildApp(deps: AppDeps): Hono {
  const { config } = deps;
  const app = new Hono();

  app.use('*', logger());

  app.use(
    '*',
    cors({
      origin: (origin) => (isOriginAllowed(origin, config.cors.allowlist) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Health — unauthenticated, shallow liveness.
  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      jobs: deps.store.size(),
    }),
  );

  // Everything under /api/v1 requires the bearer token.
  app.use('/api/v1/*', bearerAuth(config.auth));

  app.route(
    '/api/v1/scans',
    createScanRoutes({
      config,
      store: deps.store,
      runner: deps.runner,
      evict: deps.evict,
    }),
  );

  return app;
}

export interface Runtime {
  app: Hono;
  store: JobStore;
  runner: ScanRunner;
  config: ServerConfig;
  /** Stop background timers (store sweeper). */
  stop: () => void;
}

/** Clean up a job's per-job workspace directory. Best-effort. */
function cleanupWorkspace(job: Job): void {
  try {
    fs.rmSync(job.workspaceDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Production wiring. `scanFn` is injectable so an end-to-end test can drive the
 * full HTTP → queue → store path with a deterministic fake instead of the real
 * (slow, parser-heavy) core scan.
 */
export function createRuntime(config: ServerConfig, scanFn?: ScanFn): Runtime {
  const store = new InMemoryJobStore({
    ttlMs: config.store.ttlMs,
    maxJobs: config.store.maxJobs,
    sweepIntervalMs: config.store.sweepIntervalMs,
    onEvict: cleanupWorkspace,
  });

  const runner = new ScanRunner(
    store,
    {
      maxConcurrentJobs: config.limits.maxConcurrentJobs,
      scanTimeoutMs: config.limits.scanTimeoutMs,
    },
    scanFn ?? makeCoreScanFn(),
  );

  const evict = (jobId: string): void => {
    store.delete(jobId); // onEvict cleans the workspace
  };

  const app = buildApp({ config, store, runner, evict });

  return {
    app,
    store,
    runner,
    config,
    stop: () => store.stop(),
  };
}
