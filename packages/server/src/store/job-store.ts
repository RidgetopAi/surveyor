/**
 * Bounded job store.
 *
 * This store is explicitly NOT the system-of-record: in the locked architecture
 * Mandrel persists scan results durably into each tenant's Postgres (Phase 4b).
 * Here we only need a bounded, leak-proof place to hold in-flight + just-finished
 * jobs long enough for Mandrel to read the result. Hence: TTL eviction, a hard
 * max-jobs cap, and evict-after-result-retrieved.
 *
 * It is an INTERFACE (`JobStore`) so it can be swapped (e.g. for a Redis-backed
 * store) and unit-tested with a fake clock.
 */

import type { ScanProgress, ScanResult } from '@surveyor/core';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface ScanRunOptions {
  skipAnalysis?: boolean;
  detect?: boolean;
  mode?: 'app' | 'library';
}

export interface Job {
  id: string;
  status: JobStatus;
  /** Latest progress from the scanner, or null before it starts. */
  progress: ScanProgress | null;
  /** Populated only when status === 'done'. */
  result?: ScanResult;
  /** Populated only when status === 'error'. */
  error?: string;
  /** Absolute path of the repo being scanned (input). */
  projectPath: string;
  /** Per-job scratch dir for outputs + AI cache (NEVER inside projectPath). */
  workspaceDir: string;
  options: ScanRunOptions;
  createdAt: number;
  updatedAt: number;
}

export type JobPatch = Partial<
  Pick<Job, 'status' | 'progress' | 'result' | 'error'>
>;

export interface NewJob {
  id: string;
  projectPath: string;
  workspaceDir: string;
  options: ScanRunOptions;
}

/** A public, store-safe view of a job (no large result payload). */
export interface JobSummary {
  id: string;
  status: JobStatus;
  progress: ScanProgress | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JobStore {
  create(job: NewJob): Job;
  get(id: string): Job | undefined;
  update(id: string, patch: JobPatch): Job | undefined;
  /** Remove a job; returns the removed job (for workspace cleanup) or undefined. */
  delete(id: string): Job | undefined;
  list(): JobSummary[];
  size(): number;
  /** Evict every job whose age exceeds the TTL; returns the evicted jobs. */
  sweep(): Job[];
  /** Stop any internal timers. Idempotent. */
  stop(): void;
}

export interface InMemoryJobStoreOptions {
  ttlMs: number;
  maxJobs: number;
  sweepIntervalMs: number;
  /** Injected clock (ms epoch) for deterministic tests. Default: Date.now. */
  now?: () => number;
  /** Called when a job is evicted/deleted so callers can clean its workspace. */
  onEvict?: (job: Job) => void;
  /** Start the background sweep timer. Default true; tests pass false. */
  startSweeper?: boolean;
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly ttlMs: number;
  private readonly maxJobs: number;
  private readonly now: () => number;
  private readonly onEvict?: (job: Job) => void;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: InMemoryJobStoreOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxJobs = Math.max(1, opts.maxJobs);
    this.now = opts.now ?? Date.now;
    this.onEvict = opts.onEvict;

    if (opts.startSweeper !== false && opts.sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), opts.sweepIntervalMs);
      // Never keep the process alive solely for the sweeper.
      this.sweepTimer.unref?.();
    }
  }

  create(input: NewJob): Job {
    // Enforce the hard cap. Evict the oldest non-running job first; if everything
    // is running we still refuse to exceed the ceiling (fail-closed on RAM).
    if (this.jobs.size >= this.maxJobs) {
      this.evictOldestEvictable();
    }
    if (this.jobs.size >= this.maxJobs) {
      throw new JobStoreFullError(this.maxJobs);
    }

    const t = this.now();
    const job: Job = {
      id: input.id,
      status: 'queued',
      progress: null,
      projectPath: input.projectPath,
      workspaceDir: input.workspaceDir,
      options: input.options,
      createdAt: t,
      updatedAt: t,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: JobPatch): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const next: Job = { ...job, ...patch, updatedAt: this.now() };
    this.jobs.set(id, next);
    return next;
  }

  delete(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    this.jobs.delete(id);
    this.onEvict?.(job);
    return job;
  }

  list(): JobSummary[] {
    return [...this.jobs.values()].map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      ...(j.error !== undefined ? { error: j.error } : {}),
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));
  }

  size(): number {
    return this.jobs.size;
  }

  sweep(): Job[] {
    const cutoff = this.now() - this.ttlMs;
    const evicted: Job[] = [];
    for (const job of [...this.jobs.values()]) {
      if (job.createdAt <= cutoff) {
        this.jobs.delete(job.id);
        this.onEvict?.(job);
        evicted.push(job);
      }
    }
    return evicted;
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Evict the oldest job that is not currently running (queued/done/error). */
  private evictOldestEvictable(): void {
    let oldest: Job | undefined;
    for (const job of this.jobs.values()) {
      if (job.status === 'running') continue;
      if (!oldest || job.createdAt < oldest.createdAt) oldest = job;
    }
    if (oldest) {
      this.jobs.delete(oldest.id);
      this.onEvict?.(oldest);
    }
  }
}

export class JobStoreFullError extends Error {
  constructor(public readonly maxJobs: number) {
    super(`Job store is full (max ${maxJobs} jobs)`);
    this.name = 'JobStoreFullError';
  }
}
