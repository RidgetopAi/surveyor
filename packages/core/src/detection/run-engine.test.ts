import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolvePackageBinary, runJsonTool } from './run-engine.js';

describe('resolvePackageBinary', () => {
  it('resolves knip\'s bin (package with a CJS-friendly exports map)', () => {
    const bin = resolvePackageBinary('knip', 'bin/knip.js');
    expect(fs.existsSync(bin)).toBe(true);
    expect(bin.endsWith('bin/knip.js')).toBe(true);
  });

  it('resolves dependency-cruiser\'s bin (ESM-only exports map — the require.resolve trap)', () => {
    const bin = resolvePackageBinary('dependency-cruiser', 'bin/dependency-cruise.mjs');
    expect(fs.existsSync(bin)).toBe(true);
  });

  it('throws a clear error for a package that is not installed', () => {
    expect(() => resolvePackageBinary('definitely-not-a-real-package-xyz', 'bin/x.js')).toThrow(
      /Could not locate node_modules/
    );
  });
});

describe('runJsonTool', () => {
  let dir: string;
  const script = (name: string, body: string): string => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, body);
    return p;
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-runengine-test-'));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const base = { cwd: process.cwd(), timeoutMs: 10_000, label: 'test-tool', args: [] as string[] };

  it('parses JSON from a tool that exits 0', async () => {
    const bin = script('ok.mjs', 'process.stdout.write(JSON.stringify({ ok: true, n: 3 }));');
    const out = await runJsonTool<{ ok: boolean; n: number }>({ ...base, binPath: bin });
    expect(out).toEqual({ ok: true, n: 3 });
  });

  it('parses JSON even when the tool exits NON-ZERO (findings => exit 1)', async () => {
    const bin = script('nonzero.mjs', 'process.stdout.write(JSON.stringify({ issues: 5 }));process.exit(1);');
    const out = await runJsonTool<{ issues: number }>({ ...base, binPath: bin });
    expect(out.issues).toBe(5);
  });

  it('rejects when stdout is not valid JSON', async () => {
    const bin = script('garbage.mjs', 'process.stdout.write("not json at all");');
    await expect(runJsonTool({ ...base, binPath: bin })).rejects.toThrow(/not valid JSON/);
  });

  it('rejects when the tool produces no output', async () => {
    const bin = script('silent.mjs', 'process.stderr.write("boom");process.exit(2);');
    await expect(runJsonTool({ ...base, binPath: bin })).rejects.toThrow(/no output/);
  });

  it('rejects on timeout and kills the child', async () => {
    const bin = script('hang.mjs', 'setTimeout(() => {}, 60000);');
    await expect(
      runJsonTool({ ...base, binPath: bin, timeoutMs: 300 })
    ).rejects.toThrow(/timed out/);
  });
});
