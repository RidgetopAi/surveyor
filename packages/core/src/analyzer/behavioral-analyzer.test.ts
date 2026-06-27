/**
 * behavioral-analyzer integration test (no network).
 *
 * Proves the concurrency worker pool is RETAINED and routed through the new
 * LLMProvider seam: every function is dispatched to the provider, results are
 * written back, failures are isolated (don't abort the batch), and the cache is
 * written keyed on provider+model (so a swap re-analyzes).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeBehavior } from './behavioral-analyzer.js';
import { FakeProvider } from '../llm/fake-provider.testkit.js';
import { NodeType } from '../types/node.types.js';
import { ScanStatus, type ScanResult } from '../types/scan.types.js';
import type { FunctionNode } from '../types/node.types.js';

let dir: string;
let srcFile: string;

const FUNCS = [
  { name: 'readUser', body: 'function readUser(id) { return db.findOne(id); }' },
  { name: 'writeUser', body: 'function writeUser(u) { return db.save(u); }' },
  { name: 'callApi', body: 'function callApi() { return fetch("/x"); }' },
  { name: 'pureAdd', body: 'function pureAdd(a, b) { return a + b; }' },
];

function makeScanResult(): ScanResult {
  const lines: string[] = [];
  const nodes: Record<string, FunctionNode> = {};
  let line = 1;
  for (let i = 0; i < FUNCS.length; i++) {
    const f = FUNCS[i]!;
    const startLine = line;
    lines.push(f.body);
    const endLine = line;
    line++;
    nodes[`fn-${i}`] = {
      id: `fn-${i}`,
      type: NodeType.Function,
      name: f.name,
      filePath: srcFile,
      line: startLine,
      endLine,
      parentFileId: 'file-0',
      parentClassId: null,
      params: [],
      returnType: null,
      isExported: false,
      isAsync: false,
      behavioral: null,
      references: [],
    };
  }
  writeFileSync(srcFile, lines.join('\n'));

  return {
    id: 'scan-1',
    projectPath: dir,
    projectName: 'fixture',
    status: ScanStatus.Complete,
    createdAt: new Date().toISOString(),
    completedAt: null,
    stats: {
      totalFiles: 1,
      totalFunctions: FUNCS.length,
      totalClasses: 0,
      totalConnections: 0,
      totalWarnings: 0,
      warningsByLevel: {} as ScanResult['stats']['warningsByLevel'],
      nodesByType: {},
      analyzedCount: 0,
      pendingAnalysis: FUNCS.length,
    },
    nodes: nodes as ScanResult['nodes'],
    connections: [],
    warnings: [],
    clusters: [],
    errors: [],
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'surveyor-bx-'));
  srcFile = join(dir, 'src.ts');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('analyzeBehavior through the LLMProvider seam', () => {
  it('dispatches every function to the provider and writes results back', async () => {
    const provider = new FakeProvider();
    const scan = makeScanResult();

    const out = await analyzeBehavior(scan, provider, { concurrency: 3 });

    expect(provider.calls).toBe(FUNCS.length);
    expect(out.stats.analyzedCount).toBe(FUNCS.length);

    const readUser = out.nodes['fn-0'] as FunctionNode;
    expect(readUser.behavioral?.source).toBe('ai');
    expect(readUser.behavioral?.flags.databaseRead).toBe(true);

    const callApi = out.nodes['fn-2'] as FunctionNode;
    expect(callApi.behavioral?.flags.httpCall).toBe(true);

    const pureAdd = out.nodes['fn-3'] as FunctionNode;
    expect(pureAdd.behavioral?.flags.hasSideEffects).toBe(false);
  });

  it('isolates a single function failure without aborting the batch', async () => {
    const provider = new FakeProvider({ failOn: ['writeUser'] });
    const scan = makeScanResult();

    const out = await analyzeBehavior(scan, provider, { concurrency: 4 });

    // 3 of 4 succeed; the failing one is left unanalyzed.
    expect(out.stats.analyzedCount).toBe(FUNCS.length - 1);
    expect((out.nodes['fn-1'] as FunctionNode).behavioral).toBeNull();
    expect((out.nodes['fn-0'] as FunctionNode).behavioral).not.toBeNull();
  });

  it('writes a cache; a second run with the SAME provider+model hits it (no new calls)', async () => {
    const provider1 = new FakeProvider();
    const scan1 = makeScanResult();
    await analyzeBehavior(scan1, provider1, { cacheDir: dir, concurrency: 2 });
    expect(provider1.calls).toBe(FUNCS.length);
    expect(existsSync(join(dir, 'analysis-cache.json'))).toBe(true);

    // Fresh scan (behavioral reset), same provider/model → all served from cache.
    const provider2 = new FakeProvider();
    const scan2 = makeScanResult();
    await analyzeBehavior(scan2, provider2, { cacheDir: dir, concurrency: 2 });
    expect(provider2.calls).toBe(0);
  });

  it('a model swap INVALIDATES the cache → re-analyzes', async () => {
    const provider1 = new FakeProvider({ model: 'model-A' });
    await analyzeBehavior(makeScanResult(), provider1, { cacheDir: dir, concurrency: 2 });

    const provider2 = new FakeProvider({ model: 'model-B' });
    await analyzeBehavior(makeScanResult(), provider2, { cacheDir: dir, concurrency: 2 });

    // Different model → cache miss → every function re-dispatched.
    expect(provider2.calls).toBe(FUNCS.length);
  });
});
