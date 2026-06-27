/**
 * Pre-scan resource-limit enforcement.
 *
 * The box is RAM-limited, so we REJECT an oversize repo BEFORE the scanner ever
 * loads it (ts-morph holds the source graph in memory). We walk the tree once,
 * skipping the configured ignore dirs, and short-circuit the moment either the
 * byte budget or the file-count budget is exceeded — we never walk a giant tree
 * to completion just to reject it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RepoMeasureLimits {
  maxRepoBytes: number;
  maxFileCount: number;
  ignoreDirs: string[];
}

export type RepoMeasure =
  | { ok: true; bytes: number; fileCount: number }
  | { ok: false; reason: 'too_many_files' | 'too_large'; bytes: number; fileCount: number; limit: number };

/**
 * Walk `rootDir` and verify it fits within the limits. Returns `ok:false` with a
 * reason as soon as a budget is blown (partial counts included for the message).
 */
export function measureRepo(rootDir: string, limits: RepoMeasureLimits): RepoMeasure {
  const ignore = new Set(limits.ignoreDirs);
  let bytes = 0;
  let fileCount = 0;

  // Iterative DFS to avoid recursion depth issues on deep trees.
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Unreadable dir → skip it rather than abort the whole measure.
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        // Do not follow symlinks (cycle / escape safety); count nothing.
        continue;
      }

      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        stack.push(full);
        continue;
      }

      if (entry.isFile()) {
        fileCount++;
        if (fileCount > limits.maxFileCount) {
          return { ok: false, reason: 'too_many_files', bytes, fileCount, limit: limits.maxFileCount };
        }
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          size = 0;
        }
        bytes += size;
        if (bytes > limits.maxRepoBytes) {
          return { ok: false, reason: 'too_large', bytes, fileCount, limit: limits.maxRepoBytes };
        }
      }
    }
  }

  return { ok: true, bytes, fileCount };
}
