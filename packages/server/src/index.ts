#!/usr/bin/env node
/**
 * Surveyor API Server — deployable shared service.
 *
 * In the locked architecture, this is ONE hardened Surveyor service that Mandrel
 * calls; scan results are persisted by Mandrel into each tenant's Postgres (P4b).
 * This service is NOT the system-of-record — it runs scans and returns results.
 *
 * Job-based contract (see routes/scans.ts):
 *   POST /api/v1/scans            -> { jobId, status: 'queued' }   (starts async)
 *   GET  /api/v1/scans/:jobId     -> status + progress
 *   GET  /api/v1/scans/:jobId/result   -> full ScanResult when done
 *   GET  /api/v1/scans/:jobId/progress -> SSE progress (does NOT start the scan)
 *   GET  /api/health              -> liveness (unauthenticated)
 *
 * Hardening: bearer-token auth, bounded in-memory job store (TTL + cap +
 * evict-after-retrieve), pre-scan resource limits, per-job workspace (no writes
 * into the scanned tree), exact-allowlist CORS. All tunables in config.ts.
 */

import { config as loadDotenv } from 'dotenv';
import { serve } from '@hono/node-server';
import { loadServerConfig } from './config.js';
import { createRuntime } from './app.js';

// Load environment (.env in cwd / repo root) before resolving config.
loadDotenv();
loadDotenv({ path: '../.env' });
loadDotenv({ path: '../../.env' });

const config = loadServerConfig();
const runtime = createRuntime(config);

if (!config.auth.token) {
  console.warn(
    '[surveyor] WARNING: SURVEYOR_AUTH_TOKEN is not set — all /api/v1 routes will ' +
      'fail closed with 503 until a token is configured.',
  );
}

console.log(`[surveyor] Serving on http://localhost:${config.port}`);
console.log(
  `[surveyor] limits: maxConcurrent=${config.limits.maxConcurrentJobs} ` +
    `queueCap=${config.limits.maxQueuedJobs} scanTimeout=${config.limits.scanTimeoutMs}ms ` +
    `maxRepoBytes=${config.limits.maxRepoBytes} maxFiles=${config.limits.maxFileCount}`,
);
console.log(`[surveyor] workspace root: ${config.workspaceRoot}`);

serve({
  fetch: runtime.app.fetch,
  port: config.port,
});

export { runtime };
