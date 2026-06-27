import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { measureRepo } from './repo-limits.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-limits-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const baseLimits = {
  maxRepoBytes: 1_000_000,
  maxFileCount: 1000,
  ignoreDirs: ['node_modules', '.git'],
};

describe('measureRepo', () => {
  it('measures bytes and file count for an in-limit repo', () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'a'.repeat(100));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), 'b'.repeat(50));

    const r = measureRepo(dir, baseLimits);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fileCount).toBe(2);
      expect(r.bytes).toBe(150);
    }
  });

  it('ignores configured directories (node_modules) when measuring', () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'a'.repeat(10));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'huge.js'), 'x'.repeat(999_999));

    const r = measureRepo(dir, baseLimits);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fileCount).toBe(1);
      expect(r.bytes).toBe(10);
    }
  });

  it('rejects a repo over the byte limit', () => {
    fs.writeFileSync(path.join(dir, 'big.ts'), 'x'.repeat(500));
    const r = measureRepo(dir, { ...baseLimits, maxRepoBytes: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('too_large');
      expect(r.limit).toBe(100);
    }
  });

  it('rejects a repo over the file-count limit', () => {
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(dir, `f${i}.ts`), 'x');
    const r = measureRepo(dir, { ...baseLimits, maxFileCount: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('too_many_files');
      expect(r.limit).toBe(3);
    }
  });

  it('does not follow symlinks', () => {
    fs.writeFileSync(path.join(dir, 'real.ts'), 'x'.repeat(10));
    try {
      fs.symlinkSync('/etc', path.join(dir, 'link'));
    } catch {
      return; // symlink not permitted in this env — skip assertion
    }
    const r = measureRepo(dir, baseLimits);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileCount).toBe(1);
  });
});
