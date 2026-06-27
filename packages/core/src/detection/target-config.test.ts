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

  it('declares an (empty-config) workspaces map for a multi-package repo', () => {
    const cfg = deriveKnipConfig(MULTI, config);
    const wsMap = cfg.workspaces as Record<string, unknown>;
    expect(wsMap).toBeDefined();
    expect(wsMap['packages/core']).toEqual({});
    expect(wsMap['packages/ui']).toEqual({});
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
