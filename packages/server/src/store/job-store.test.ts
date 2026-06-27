import { describe, it, expect, vi } from 'vitest';
import { InMemoryJobStore, JobStoreFullError, type NewJob } from './job-store.js';

function newJob(id: string): NewJob {
  return { id, projectPath: `/tmp/${id}`, workspaceDir: `/tmp/ws/${id}`, options: {} };
}

function makeStore(over: Partial<ConstructorParameters<typeof InMemoryJobStore>[0]> = {}) {
  return new InMemoryJobStore({
    ttlMs: 1000,
    maxJobs: 3,
    sweepIntervalMs: 0,
    startSweeper: false,
    ...over,
  });
}

describe('InMemoryJobStore', () => {
  it('creates a job in queued state', () => {
    const store = makeStore();
    const job = store.create(newJob('a'));
    expect(job.status).toBe('queued');
    expect(job.progress).toBeNull();
    expect(store.size()).toBe(1);
    expect(store.get('a')?.id).toBe('a');
  });

  it('updates status/progress/result and bumps updatedAt', () => {
    let t = 100;
    const store = makeStore({ now: () => t });
    store.create(newJob('a'));
    t = 200;
    const updated = store.update('a', { status: 'running' });
    expect(updated?.status).toBe('running');
    expect(updated?.updatedAt).toBe(200);
  });

  it('update on a missing job returns undefined (no-op)', () => {
    const store = makeStore();
    expect(store.update('missing', { status: 'done' })).toBeUndefined();
  });

  it('delete returns the job and fires onEvict', () => {
    const onEvict = vi.fn();
    const store = makeStore({ onEvict });
    store.create(newJob('a'));
    const removed = store.delete('a');
    expect(removed?.id).toBe('a');
    expect(store.size()).toBe(0);
    expect(onEvict).toHaveBeenCalledOnce();
  });

  it('TTL sweep evicts jobs older than ttl and cleans their workspace', () => {
    let t = 0;
    const onEvict = vi.fn();
    const store = makeStore({ ttlMs: 1000, now: () => t, onEvict });
    store.create(newJob('old'));
    t = 500;
    store.create(newJob('young'));

    t = 1100; // 'old' (created at 0) is now > ttl; 'young' (created at 500) is not
    const evicted = store.sweep();

    expect(evicted.map((j) => j.id)).toEqual(['old']);
    expect(store.get('old')).toBeUndefined();
    expect(store.get('young')).toBeDefined();
    expect(onEvict).toHaveBeenCalledOnce();
  });

  it('enforces max-jobs cap by evicting the oldest evictable job', () => {
    let t = 0;
    const store = makeStore({ maxJobs: 2, now: () => ++t });
    store.create(newJob('a')); // t=1
    store.create(newJob('b')); // t=2
    store.create(newJob('c')); // t=3 -> evicts oldest evictable ('a')
    expect(store.size()).toBe(2);
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBeDefined();
    expect(store.get('c')).toBeDefined();
  });

  it('does NOT evict a running job to make room; throws JobStoreFullError if all running', () => {
    const store = makeStore({ maxJobs: 2 });
    store.create(newJob('a'));
    store.create(newJob('b'));
    store.update('a', { status: 'running' });
    store.update('b', { status: 'running' });
    expect(() => store.create(newJob('c'))).toThrow(JobStoreFullError);
    expect(store.size()).toBe(2);
  });

  it('list returns summaries without the heavy result payload', () => {
    const store = makeStore();
    store.create(newJob('a'));
    store.update('a', {
      status: 'done',
      // a stand-in result; list() must not surface it
      result: { id: 'a' } as never,
    });
    const summaries = store.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: 'a', status: 'done' });
    expect('result' in summaries[0]!).toBe(false);
  });
});
