/**
 * Surveyor server configuration (configs-not-hardcoded)
 *
 * Every tunable lives here as a NAMED config, loaded from env with explicit
 * defaults. Nothing in the server reads `process.env` directly — it reads this
 * resolved `ServerConfig`. This keeps the deployable shared service auditable:
 * one place to see every port, token, limit, TTL, and CORS rule.
 */

import * as os from 'node:os';
import * as path from 'node:path';

type Env = Record<string, string | undefined>;

/** Defaults for every tunable. Conservative — the box is RAM-limited. */
export const SERVER_CONFIG_DEFAULTS = {
  port: 4000,

  /** Bounded job store. */
  jobTtlMs: 30 * 60 * 1000, // 30 min — a queued/finished job lives at most this long
  maxJobs: 100, // hard ceiling on jobs tracked in memory
  evictAfterResultRetrieved: true, // Mandrel persists in P4b → drop ours once handed over
  storeSweepIntervalMs: 60 * 1000, // background TTL sweep cadence

  /** Resource limits (RAM-ceiling safety). */
  maxConcurrentJobs: 2, // scans run at most this many at once; rest queue
  maxQueuedJobs: 50, // reject new jobs beyond this backlog
  scanTimeoutMs: 10 * 60 * 1000, // 10 min per scan, then the job is failed
  maxRepoBytes: 512 * 1024 * 1024, // 512 MB of scannable source → reject before scanning
  maxFileCount: 50_000, // file-count ceiling → reject before scanning

  /** Directories ignored when measuring repo size AND not scanned. */
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', '.surveyor', 'coverage', '.next'] as string[],

  /** Per-job workspace root (scan outputs + AI cache live HERE, never in the scanned tree). */
  workspaceRoot: path.join(os.tmpdir(), 'surveyor-jobs'),
} as const;

export interface AuthConfig {
  /** Bearer token required on protected routes. Empty => fail-closed (503). */
  token: string;
}

export interface StoreConfig {
  ttlMs: number;
  maxJobs: number;
  evictAfterResultRetrieved: boolean;
  sweepIntervalMs: number;
}

export interface LimitsConfig {
  maxConcurrentJobs: number;
  maxQueuedJobs: number;
  scanTimeoutMs: number;
  maxRepoBytes: number;
  maxFileCount: number;
  ignoreDirs: string[];
}

export interface CorsConfig {
  /**
   * Exact origins (e.g. `https://app.ridgetopai.net`) and suffix rules (an entry
   * beginning with `.`, e.g. `.ridgetopai.net`, matches any subdomain by endsWith).
   * NO substring matching. Empty list => only same-origin / non-browser callers.
   */
  allowlist: string[];
}

export interface ServerConfig {
  port: number;
  auth: AuthConfig;
  store: StoreConfig;
  limits: LimitsConfig;
  cors: CorsConfig;
  workspaceRoot: string;
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseListEnv(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined || value.trim() === '') return fallback;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : fallback;
}

/**
 * Resolve the full server config from the environment. Pure function of `env`
 * (defaults to `process.env`) so tests can build any config without globals.
 */
export function loadServerConfig(env: Env = process.env): ServerConfig {
  const d = SERVER_CONFIG_DEFAULTS;
  return {
    port: parseIntEnv(env.SURVEYOR_PORT, d.port),
    auth: {
      token: (env.SURVEYOR_AUTH_TOKEN ?? '').trim(),
    },
    store: {
      ttlMs: parseIntEnv(env.SURVEYOR_JOB_TTL_MS, d.jobTtlMs),
      maxJobs: parseIntEnv(env.SURVEYOR_MAX_JOBS, d.maxJobs),
      evictAfterResultRetrieved: parseBoolEnv(
        env.SURVEYOR_EVICT_AFTER_RESULT,
        d.evictAfterResultRetrieved,
      ),
      sweepIntervalMs: parseIntEnv(env.SURVEYOR_STORE_SWEEP_INTERVAL_MS, d.storeSweepIntervalMs),
    },
    limits: {
      maxConcurrentJobs: Math.max(1, parseIntEnv(env.SURVEYOR_MAX_CONCURRENT_JOBS, d.maxConcurrentJobs)),
      maxQueuedJobs: parseIntEnv(env.SURVEYOR_MAX_QUEUED_JOBS, d.maxQueuedJobs),
      scanTimeoutMs: parseIntEnv(env.SURVEYOR_SCAN_TIMEOUT_MS, d.scanTimeoutMs),
      maxRepoBytes: parseIntEnv(env.SURVEYOR_MAX_REPO_BYTES, d.maxRepoBytes),
      maxFileCount: parseIntEnv(env.SURVEYOR_MAX_FILE_COUNT, d.maxFileCount),
      ignoreDirs: parseListEnv(env.SURVEYOR_IGNORE_DIRS, d.ignoreDirs),
    },
    cors: {
      allowlist: parseListEnv(env.SURVEYOR_CORS_ORIGINS, []),
    },
    workspaceRoot: (env.SURVEYOR_WORKSPACE_DIR ?? '').trim() || d.workspaceRoot,
  };
}
