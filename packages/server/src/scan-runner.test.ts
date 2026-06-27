import { describe, it, expect, vi } from 'vitest';
import { InMemoryJobStore, type Job } from './store/job-store.js';
import { ScanRunner, type ScanFn } from './scan-runner.js';
import type { ScanResult } from '@surveyor/core';
import { ScanStatus } from '@surveyor/core';

function fakeResult(id: string, totalFiles = 3): ScanResult {
  return {
    id,
    projectPath: `/tmp/${id}`,
    projectName: id,
    status: ScanStatus.Complete,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stats: {
      totalFiles,
      totalFunctions: 0,
      totalClasses: 0,
      totalConnections: 0,
      totalWarnings: 0,
      warningsByLevel: {} as never,
      nodesByType: {},
      analyzedCount: 0,
      pendingAnalysis: 0,
    },
    nodes: {},
    connections: [],
    warnings: [],
    clusters: [],
    errors: [],
  };
}

function makeStore() {
  return new InMemoryJobStore({ ttlMs: 60_000, maxJobs: 100, sweepIntervalMs: 0, startSweeper: false });
}

function createJob(store: InMemoryJobStore, id: string): Job {
  return store.create({ id, projectPath: `/tmp/${id}`, workspaceDir: `/tmp/ws/${id}`, options: {} });
}

// A tiny deferred helper for controlling scan completion in tests.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const waitFor = async (cond: () => boolean, timeoutMs = 1000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('ScanRunner', () => {
  it('runs a job to done and stores the result', async () => {
    const store = makeStore();
    const scanFn: ScanFn = async (job, onProgress) => {
      onProgress({ phase: 'scanning', current: 1, total: 2 });
      return fakeResult(job.id, 7);
    };
    const runner = new ScanRunner(store, { maxConcurrentJobs: 2, scanTimeoutMs: 5000 }, scanFn);

    createJob(store, 'a');
    runner.enqueue('a');

    await waitFor(() => store.get('a')?.status === 'done');
    const job = store.get('a')!;
    expect(job.result?.stats.totalFiles).toBe(7);
    expect(job.progress?.phase).toBe('complete');
  });

  it('captures a thrown scan as an error job', async () => {
    const store = makeStore();
    const scanFn: ScanFn = async () => {
      throw new Error('boom');
    };
    const runner = new ScanRunner(store, { maxConcurrentJobs: 1, scanTimeoutMs: 5000 }, scanFn);

    createJob(store, 'a');
    runner.enqueue('a');

    await waitFor(() => store.get('a')?.status === 'error');
    const job = store.get('a')!;
    expect(job.error).toBe('boom');
    expect(job.progress?.phase).toBe('error');
  });

  it('fails a job that exceeds the per-scan timeout', async () => {
    const store = makeStore();
    const never = deferred<ScanResult>();
    const scanFn: ScanFn = () => never.promise;
    const runner = new ScanRunner(store, { maxConcurrentJobs: 1, scanTimeoutMs: 30 }, scanFn);

    createJob(store, 'a');
    runner.enqueue('a');

    await waitFor(() => store.get('a')?.status === 'error');
    expect(store.get('a')?.error).toMatch(/timeout/i);
    never.resolve(fakeResult('a')); // let the dangling promise settle
  });

  it('respects the concurrency cap and queues the overflow', async () => {
    const store = makeStore();
    const gates = [deferred<ScanResult>(), deferred<ScanResult>(), deferred<ScanResult>()];
    let started = 0;
    const scanFn: ScanFn = (job) => {
      started++;
      return gates[Number(job.id)]!.promise;
    };
    const runner = new ScanRunner(store, { maxConcurrentJobs: 2, scanTimeoutMs: 5000 }, scanFn);

    for (const id of ['0', '1', '2']) {
      createJob(store, id);
      runner.enqueue(id);
    }

    // Only 2 may run at once; job '2' must wait.
    await waitFor(() => started === 2);
    expect(started).toBe(2);
    expect(runner.activeCount).toBe(2);
    expect(runner.queueDepth).toBe(1);
    expect(store.get('2')?.status).toBe('queued');

    // Finish job '0' → job '2' starts.
    gates[0]!.resolve(fakeResult('0'));
    await waitFor(() => started === 3);
    expect(store.get('2')?.status).toBe('running');

    gates[1]!.resolve(fakeResult('1'));
    gates[2]!.resolve(fakeResult('2'));
    await waitFor(() => store.get('2')?.status === 'done');
  });

  it('skips an enqueued job that was evicted before it ran', async () => {
    const store = makeStore();
    const scanFn = vi.fn<ScanFn>(async (job) => fakeResult(job.id));
    const runner = new ScanRunner(store, { maxConcurrentJobs: 1, scanTimeoutMs: 5000 }, scanFn);

    createJob(store, 'a');
    store.delete('a'); // evicted before enqueue pumps
    runner.enqueue('a');

    await new Promise((r) => setTimeout(r, 20));
    expect(scanFn).not.toHaveBeenCalled();
  });
});
