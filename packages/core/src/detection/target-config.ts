/**
 * Auto-configure the detection engines for an ARBITRARY target repo.
 *
 * We scan codebases we don't control, so we cannot rely on a checked-in knip /
 * dependency-cruiser config. Instead we derive one from the target:
 *
 *   - WORKSPACES: every directory containing a package.json (minus ignored dirs)
 *     is treated as a knip workspace. This is the critical lever — a non-Docker
 *     "monorepo" with no `workspaces` field (e.g. ra-mandrel) otherwise collapses
 *     to one project and knip reports ~every file as unused. Declaring the
 *     workspaces lets knip apply its per-workspace entry-point detection and
 *     framework plugins, which is where its accuracy comes from.
 *
 *   - ENTRIES: intentionally left to knip's own detection (package.json
 *     main/bin/exports + scripts + framework plugins + test runners). Hand-rolling
 *     entry globs was measurably WORSE — it overrode knip's smart defaults and
 *     re-introduced false positives (test files flagged as unused).
 *
 *   - DEP-CRUISER TARGETS: the concrete source directories to cruise, derived from
 *     each workspace's conventional source roots.
 *
 * Residual accuracy limits are documented in detection/README.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectionConfig } from './detection-config.js';

/** Directory names never worth descending into when discovering workspaces. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'vendor',
]);

/** Conventional source roots, in priority order, checked per workspace. */
const SOURCE_ROOTS = ['src', 'lib', 'app', 'source'];

/** How deep to walk looking for nested package.json files. */
const MAX_WORKSPACE_DEPTH = 4;

/**
 * Discover workspace directories (those containing a package.json), relative to
 * `projectPath` and POSIX-normalised. The root (`.`) is included when it has a
 * package.json. Results are sorted and de-duplicated.
 */
export function discoverWorkspaces(projectPath: string): string[] {
  const root = path.resolve(projectPath);
  const found = new Set<string>();

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_WORKSPACE_DEPTH) return;

    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const rel = path.relative(root, dir);
      found.add(rel === '' ? '.' : toPosix(rel));
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };

  walk(root, 0);
  return [...found].sort();
}

/**
 * Build a knip config object tailored to the target. Returned as a plain object
 * the caller serialises to a temp `knip.json` and passes via `--config`.
 */
export function deriveKnipConfig(
  projectPath: string,
  config: DetectionConfig
): Record<string, unknown> {
  const workspaces = discoverWorkspaces(projectPath);
  const ignore = [...config.sharedIgnore, ...config.knip.ignore];

  const knipConfig: Record<string, unknown> = {
    // Surface entry-file exports as used (framework conventions) unless overridden.
    includeEntryExports: config.knip.includeEntryExports,
    ignore,
  };

  // Only declare a workspaces map for a genuine multi-package layout. For a
  // single-package repo, knip's default single-project handling is correct and
  // declaring `{ ".": {} }` would suppress its root auto-detection.
  const nonRoot = workspaces.filter((w) => w !== '.');
  if (nonRoot.length > 0) {
    const wsMap: Record<string, Record<string, unknown>> = {};
    for (const ws of workspaces) {
      // Empty per-workspace config => let knip apply its full default entry +
      // plugin detection for that workspace (proven most accurate).
      wsMap[ws] = {};
    }
    knipConfig.workspaces = wsMap;
  }

  return knipConfig;
}

/**
 * Derive the concrete source directories for dependency-cruiser to cruise.
 * Prefers each workspace's conventional source root(s); falls back to the repo
 * root when none are found (dependency-cruiser's exclude/doNotFollow keeps it out
 * of node_modules/build output).
 *
 * Returned paths are relative to `projectPath` (dependency-cruiser is run with
 * cwd === projectPath).
 */
export function deriveDepCruiseTargets(projectPath: string): string[] {
  const root = path.resolve(projectPath);
  const workspaces = discoverWorkspaces(projectPath);
  const targets = new Set<string>();

  for (const ws of workspaces) {
    const wsAbs = ws === '.' ? root : path.join(root, ws);
    for (const srcRoot of SOURCE_ROOTS) {
      const candidate = path.join(wsAbs, srcRoot);
      if (isDir(candidate)) {
        targets.add(toPosix(path.relative(root, candidate)));
      }
    }
  }

  if (targets.size === 0) {
    return ['.'];
  }
  return [...targets].sort();
}

/**
 * Resolve the tsconfig dependency-cruiser should use for path-alias resolution.
 *
 * Returns ONLY a repo-root `tsconfig.json` (relative). We deliberately do NOT
 * fall back to a sub-workspace tsconfig: when dependency-cruiser runs with
 * cwd === repo-root, a sub-workspace tsconfig's relative `extends`/`include`
 * resolve against the wrong base and break the run entirely ("No inputs were
 * found"). When there is no root tsconfig (multi-workspace repos with per-package
 * tsconfigs, e.g. ra-mandrel), we run WITHOUT one: dependency-cruiser's default
 * resolver still detects relative-import cycles reliably. Residual limit:
 * path-aliased (`@/...`) import cycles in such repos may be missed — documented
 * in detection/README.md.
 */
export function findTsConfig(projectPath: string): string | undefined {
  const root = path.resolve(projectPath);
  const rootTs = path.join(root, 'tsconfig.json');
  if (fs.existsSync(rootTs)) return 'tsconfig.json';
  return undefined;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
