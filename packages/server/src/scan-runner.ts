/**
 * Scan runner + concurrency queue.
 *
 * Decouples scan execution from any HTTP connection (the old server only started
 * a scan when an SSE client connected — fragile and single-purpose). Here, POST
 * enqueues a job; the runner pumps the queue, running at most
 * `maxConcurrentJobs` scans concurrently, queueing the rest. Each scan is bounded
 * by `scanTimeoutMs`.
 *
 * The actual scan work is injected as a `ScanFn`, so the queue / timeout / status
 * transitions are unit-testable with a fake (no real parser, no LLM) and the real
 * implementation (`makeCoreScanFn`) is wired in production.
 */

import type { ScanProgress, ScanResult } from '@surveyor/core';
import type { Job, JobStore } from './store/job-store.js';

export type ProgressFn = (progress: ScanProgress) => void;

/** Executes one scan. Must resolve with the ScanResult or reject on failure. */
export type ScanFn = (job: Job, onProgress: ProgressFn, signal: AbortSignal) => Promise<ScanResult>;

export interface ScanRunnerConfig {
  maxConcurrentJobs: number;
  scanTimeoutMs: number;
}

export class ScanTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Scan exceeded timeout of ${timeoutMs}ms`);
    this.name = 'ScanTimeoutError';
  }
}

export class ScanRunner {
  private readonly queue: string[] = [];
  private running = 0;

  constructor(
    private readonly store: JobStore,
    private readonly config: ScanRunnerConfig,
    private readonly scanFn: ScanFn,
  ) {}

  /** How many jobs are waiting to start (not yet running). */
  get queueDepth(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.running;
  }

  /** Enqueue an already-created (status: 'queued') job and kick the pump. */
  enqueue(jobId: string): void {
    this.queue.push(jobId);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.config.maxConcurrentJobs && this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.store.get(jobId);
      // Job may have been evicted (TTL/cap) before it ran — just skip it.
      if (!job) continue;
      this.running++;
      void this.runOne(job).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async runOne(job: Job): Promise<void> {
    this.store.update(job.id, {
      status: 'running',
      progress: { phase: 'scanning', current: 0, total: 0 },
    });

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ScanTimeoutError(this.config.scanTimeoutMs));
      }, this.config.scanTimeoutMs);
      timer.unref?.();
    });

    const onProgress: ProgressFn = (progress) => {
      // Job may have been evicted while running; update is a no-op if so.
      this.store.update(job.id, { progress });
    };

    try {
      const current = this.store.get(job.id) ?? job;
      const result = await Promise.race([this.scanFn(current, onProgress, controller.signal), timeout]);
      this.store.update(job.id, {
        status: 'done',
        result,
        progress: {
          phase: 'complete',
          current: result.stats.totalFiles,
          total: result.stats.totalFiles,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.store.update(job.id, {
        status: 'error',
        error: message,
        progress: { phase: 'error', current: 0, total: 0, error: message },
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
