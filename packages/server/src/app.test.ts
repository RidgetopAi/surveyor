import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadServerConfig, type ServerConfig } from './config.js';
import { createRuntime, type Runtime } from './app.js';
import type { ScanFn } from './scan-runner.js';
import type { ScanResult } from '@surveyor/core';
import { ScanStatus } from '@surveyor/core';

const TOKEN = 'test-secret-token';

function fakeResult(id: string): ScanResult {
  return {
    id,
    projectPath: `/tmp/${id}`,
    projectName: id,
    status: ScanStatus.Complete,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stats: {
      totalFiles: 4,
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

function testConfig(env: Record<string, string | undefined> = {}): ServerConfig {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-ws-'));
  return loadServerConfig({
    SURVEYOR_AUTH_TOKEN: TOKEN,
    SURVEYOR_WORKSPACE_DIR: workspaceRoot,
    SURVEYOR_STORE_SWEEP_INTERVAL_MS: '0',
    SURVEYOR_CORS_ORIGINS: '.ridgetopai.net',
    ...env,
  });
}

const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const waitFor = async (cond: () => boolean, timeoutMs = 5000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

let runtime: Runtime | undefined;
afterEach(() => {
  runtime?.stop();
  if (runtime) {
    try {
      fs.rmSync(runtime.config.workspaceRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
  runtime = undefined;
});

describe('auth', () => {
  it('health is reachable without a token', async () => {
    runtime = createRuntime(testConfig());
    const res = await runtime.app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('rejects /api/v1 without a token (401)', async () => {
    runtime = createRuntime(testConfig());
    const res = await runtime.app.request('/api/v1/scans', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token (401)', async () => {
    runtime = createRuntime(testConfig());
    const res = await runtime.app.request('/api/v1/scans', {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('accepts the correct token (200)', async () => {
    runtime = createRuntime(testConfig());
    const res = await runtime.app.request('/api/v1/scans', { method: 'GET', headers: auth });
    expect(res.status).toBe(200);
  });

  it('fails CLOSED with 503 when no token is configured', async () => {
    runtime = createRuntime(testConfig({ SURVEYOR_AUTH_TOKEN: '' }));
    const res = await runtime.app.request('/api/v1/scans', { method: 'GET', headers: auth });
    expect(res.status).toBe(503);
  });
});

describe('job lifecycle (fake scan)', () => {
  const scanFn: ScanFn = async (job, onProgress) => {
    onProgress({ phase: 'scanning', current: 1, total: 4 });
    return fakeResult(job.id);
  };

  it('create -> running -> done -> result, then evicts after retrieval', async () => {
    const cfg = testConfig();
    runtime = createRuntime(cfg, scanFn);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-repo-'));
    fs.writeFileSync(path.join(repo, 'index.ts'), 'export const x = 1;');

    const createRes = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: repo }),
    });
    expect(createRes.status).toBe(202);
    const { jobId, status } = await createRes.json();
    expect(status).toBe('queued');
    expect(jobId).toBeTruthy();

    await waitFor(() => runtime!.store.get(jobId)?.status === 'done');

    const statusRes = await runtime.app.request(`/api/v1/scans/${jobId}`, { headers: auth });
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).status).toBe('done');

    const resultRes = await runtime.app.request(`/api/v1/scans/${jobId}/result`, { headers: auth });
    expect(resultRes.status).toBe(200);
    const { result } = await resultRes.json();
    expect(result.id).toBe(jobId);
    expect(result.stats.totalFiles).toBe(4);

    // evict-after-retrieve: job + workspace are gone
    expect(runtime.store.get(jobId)).toBeUndefined();
    const after = await runtime.app.request(`/api/v1/scans/${jobId}`, { headers: auth });
    expect(after.status).toBe(404);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('result before done returns 409', async () => {
    const cfg = testConfig();
    // never-resolving scan to hold the job in running
    let release!: () => void;
    const holdScan: ScanFn = () =>
      new Promise<ScanResult>((resolve) => {
        release = () => resolve(fakeResult('x'));
      });
    runtime = createRuntime(cfg, holdScan);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-repo-'));
    fs.writeFileSync(path.join(repo, 'index.ts'), 'export const x = 1;');

    const createRes = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: repo }),
    });
    const { jobId } = await createRes.json();
    await waitFor(() => runtime!.store.get(jobId)?.status === 'running');

    const resultRes = await runtime.app.request(`/api/v1/scans/${jobId}/result`, { headers: auth });
    expect(resultRes.status).toBe(409);

    release();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('a scan that throws surfaces as an error job (result -> 500)', async () => {
    const failScan: ScanFn = async () => {
      throw new Error('scan exploded');
    };
    runtime = createRuntime(testConfig(), failScan);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-repo-'));
    fs.writeFileSync(path.join(repo, 'index.ts'), 'export const x = 1;');

    const createRes = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: repo }),
    });
    const { jobId } = await createRes.json();
    await waitFor(() => runtime!.store.get(jobId)?.status === 'error');

    const resultRes = await runtime.app.request(`/api/v1/scans/${jobId}/result`, { headers: auth });
    expect(resultRes.status).toBe(500);
    expect((await resultRes.json()).error).toBe('scan exploded');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('unknown job id returns 404', async () => {
    runtime = createRuntime(testConfig(), scanFn);
    const res = await runtime.app.request('/api/v1/scans/does-not-exist', { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('input + limit enforcement', () => {
  const scanFn: ScanFn = async (job) => fakeResult(job.id);

  it('rejects a missing projectPath (400)', async () => {
    runtime = createRuntime(testConfig(), scanFn);
    const res = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-existent path (400)', async () => {
    runtime = createRuntime(testConfig(), scanFn);
    const res = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: '/no/such/path/xyz' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversize repo (413) BEFORE scanning', async () => {
    runtime = createRuntime(testConfig({ SURVEYOR_MAX_REPO_BYTES: '10' }), scanFn);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-repo-'));
    fs.writeFileSync(path.join(repo, 'big.ts'), 'x'.repeat(1000));

    const res = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: repo }),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.reason).toBe('too_large');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('rejects a repo over the file-count limit (413)', async () => {
    runtime = createRuntime(testConfig({ SURVEYOR_MAX_FILE_COUNT: '2' }), scanFn);
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-repo-'));
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(repo, `f${i}.ts`), 'x');

    const res = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ projectPath: repo }),
    });
    expect(res.status).toBe(413);
    expect((await res.json()).reason).toBe('too_many_files');

    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('end-to-end real scan (no LLM)', () => {
  it('scans the detection-sample fixture through the full HTTP path', async () => {
    // default scanFn = real makeCoreScanFn()
    runtime = createRuntime(testConfig());
    const fixture = path.resolve(process.cwd(), '../../test-fixtures/detection-sample');
    expect(fs.existsSync(fixture)).toBe(true);

    const createRes = await runtime.app.request('/api/v1/scans', {
      method: 'POST',
      headers: auth,
      // detect:false keeps it a fast in-process structural scan; skipAnalysis: no LLM
      body: JSON.stringify({ projectPath: fixture, options: { skipAnalysis: true, detect: false } }),
    });
    expect(createRes.status).toBe(202);
    const { jobId } = await createRes.json();

    await waitFor(
      () => ['done', 'error'].includes(runtime!.store.get(jobId)?.status ?? ''),
      55_000,
    );
    const job = runtime.store.get(jobId)!;
    expect(job.status).toBe('done');

    const resultRes = await runtime.app.request(`/api/v1/scans/${jobId}/result`, { headers: auth });
    expect(resultRes.status).toBe(200);
    const { result } = await resultRes.json();
    expect(result.id).toBe(jobId);
    expect(result.stats.totalFiles).toBeGreaterThan(0);
    expect(Object.keys(result.nodes).length).toBeGreaterThan(0);

    // P0 fix: NOTHING was written into the scanned tree.
    expect(fs.existsSync(path.join(fixture, '.surveyor'))).toBe(false);
  });
});
