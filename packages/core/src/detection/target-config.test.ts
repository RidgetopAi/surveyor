import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  discoverWorkspaces,
  deriveKnipConfig,
  deriveDepCruiseTargets,
  findTsConfig,
} from './target-config.js';
import { resolveDetectionConfig } from './detection-config.js';

const SAMPLE = path.join(__dirname, '../../../../test-fixtures/detection-sample');
const MULTI = path.join(__dirname, '../../../..'); // surveyor repo root (multi-package)

describe('discoverWorkspaces', () => {
  it('finds the single package in a single-package repo as "."', () => {
    const ws = discoverWorkspaces(SAMPLE);
    expect(ws).toContain('.');
  });

  it('finds every package.json dir in a multi-package repo (POSIX, sorted)', () => {
    const ws = discoverWorkspaces(MULTI);
    expect(ws).toContain('.');
    expect(ws).toContain('packages/core');
    expect(ws).toContain('packages/ui');
    expect(ws).toContain('packages/server');
    // never descends into node_modules
    expect(ws.some((w) => w.includes('node_modules'))).toBe(false);
    expect([...ws]).toEqual([...ws].sort());
  });
});

describe('deriveKnipConfig', () => {
  const config = resolveDetectionConfig();

  it('does NOT declare a workspaces map for a single-package repo', () => {
    const cfg = deriveKnipConfig(SAMPLE, config);
    expect(cfg.workspaces).toBeUndefined();
    expect(cfg.includeEntryExports).toBe(false);
    expect(Array.isArray(cfg.ignore)).toBe(true);
  });

  it('puts the extended entry set TOP-LEVEL for a single-package repo', () => {
    // The top-level config IS the root-workspace config in knip when there is no
    // workspaces map, so `entry` (defaults + extras) must live top-level there.
    const cfg = deriveKnipConfig(SAMPLE, config);
    const entry = cfg.entry as string[];
    expect(entry).toEqual([...config.knip.defaultEntry, ...config.knip.extraEntry]);
  });

  it('declares a per-workspace entry map for a multi-package repo', () => {
    const cfg = deriveKnipConfig(MULTI, config);
    const wsMap = cfg.workspaces as Record<string, { entry: string[] }>;
    expect(wsMap).toBeDefined();
    const expectedEntry = [...config.knip.defaultEntry, ...config.knip.extraEntry];
    // Every workspace (incl. the root '.') carries the extended entry set.
    expect(wsMap['.'].entry).toEqual(expectedEntry);
    expect(wsMap['packages/core'].entry).toEqual(expectedEntry);
    expect(wsMap['packages/ui'].entry).toEqual(expectedEntry);
  });

  it('PRESERVES knip default entry when extending (no replace-regression)', () => {
    // Regression guard: knip REPLACES a workspace `entry`, so the index/main
    // defaults must always be present or knip flags the whole tree as unused.
    const cfg = deriveKnipConfig(MULTI, config);
    const wsMap = cfg.workspaces as Record<string, { entry: string[] }>;
    for (const def of config.knip.defaultEntry) {
      expect(wsMap['packages/core'].entry).toContain(def);
    }
    // and the script/config extras are appended, not substituted
    expect(wsMap['packages/core'].entry).toContain(
      '**/scripts/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'
    );
  });

  it('FORCE-ENABLES test-runner plugins at the top level (CRA/react-scripts gap)', () => {
    // knip only auto-enables jest/vitest when the runner is a DIRECT dep; a
    // truthy top-level plugin key force-enables it for every workspace so test
    // files become entries (and their imports count as usage).
    const cfg = deriveKnipConfig(MULTI, config);
    for (const plugin of config.knip.forceEnablePlugins) {
      expect(cfg[plugin]).toEqual({});
    }
    expect(cfg.jest).toEqual({});
    expect(cfg.vitest).toEqual({});
  });

  it('honours a custom forceEnablePlugins / extraEntry override', () => {
    const cfg = resolveDetectionConfig({
      knip: { forceEnablePlugins: ['mocha'], extraEntry: ['tools/**/*.ts'] },
    });
    const out = deriveKnipConfig(MULTI, cfg);
    expect(out.mocha).toEqual({});
    expect(out.jest).toBeUndefined();
    const wsMap = out.workspaces as Record<string, { entry: string[] }>;
    expect(wsMap['packages/core'].entry).toContain('tools/**/*.ts');
  });

  it('merges shared + knip-specific ignore globs', () => {
    const cfg = resolveDetectionConfig({ knip: { ignore: ['custom/**'] } });
    const out = deriveKnipConfig(SAMPLE, cfg);
    const ignore = out.ignore as string[];
    expect(ignore).toContain('custom/**');
    expect(ignore).toContain('**/generated/**');
  });
});

describe('deriveDepCruiseTargets', () => {
  it('prefers conventional source roots (src) when present', () => {
    const targets = deriveDepCruiseTargets(SAMPLE);
    expect(targets).toContain('src');
  });

  it('collects per-workspace src dirs in a multi-package repo', () => {
    const targets = deriveDepCruiseTargets(MULTI);
    expect(targets).toContain('packages/core/src');
    expect(targets).toContain('packages/ui/src');
  });
});

describe('findTsConfig', () => {
  it('returns the root tsconfig.json when present', () => {
    expect(findTsConfig(SAMPLE)).toBe('tsconfig.json');
  });

  it('returns undefined when there is no ROOT tsconfig (avoids breaking dep-cruiser)', () => {
    // surveyor repo root has tsconfig.base.json but no tsconfig.json
    expect(findTsConfig(MULTI)).toBeUndefined();
  });
});
