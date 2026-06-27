/**
 * End-to-end integration: runExternalDetection against a real fixture repo,
 * actually spawning knip + dependency-cruiser. Proves the adapters, auto-config,
 * subprocess plumbing and mapper all wire together and produce the planted
 * findings. Not mocked — if the engines or our config break, this goes red.
 *
 * The fixture (test-fixtures/detection-sample) plants exactly one of each:
 *   - an unused file        (src/orphan.ts)
 *   - an unused export      (deadExport in src/hasUnusedExport.ts)
 *   - a runtime import cycle (src/cycleA.ts <-> src/cycleB.ts)
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runExternalDetection } from './index.js';
import { WarningCategory, WarningSource, WarningLevel } from '../types/warning.types.js';

const FIXTURE = path.join(__dirname, '../../../../test-fixtures/detection-sample');

describe('runExternalDetection (e2e, real engines)', () => {
  it('detects the planted orphan file, unused export and runtime cycle (app mode)', async () => {
    const res = await runExternalDetection(FIXTURE, {}, { mode: 'app' });

    expect(res.engineErrors).toEqual([]);

    const orphan = res.warnings.filter((w) => w.category === WarningCategory.OrphanedCode);
    expect(orphan.map((w) => w.title)).toContain('Unused file: src/orphan.ts');
    expect(orphan[0].source).toBe(WarningSource.Knip);

    const unused = res.warnings.filter((w) => w.category === WarningCategory.UnusedExport);
    expect(unused.map((w) => w.title)).toContain('Unused export: deadExport');

    const cycles = res.warnings.filter((w) => w.category === WarningCategory.CircularDependency);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].source).toBe(WarningSource.DependencyCruiser);
    expect(cycles[0].level).toBe(WarningLevel.Warning); // runtime (value) cycle
    expect(cycles[0].title).toMatch(/cycleA\.ts/);
    expect(cycles[0].title).toMatch(/cycleB\.ts/);
  }, 120_000);

  it('library mode suppresses unused-export findings but keeps files + cycles', async () => {
    const res = await runExternalDetection(FIXTURE, {}, { mode: 'library' });

    expect(res.engineErrors).toEqual([]);
    expect(res.warnings.some((w) => w.category === WarningCategory.UnusedExport)).toBe(false);
    expect(res.warnings.some((w) => w.category === WarningCategory.OrphanedCode)).toBe(true);
    expect(res.warnings.some((w) => w.category === WarningCategory.CircularDependency)).toBe(true);
  }, 120_000);

  it('honours disabled engines via config override', async () => {
    const res = await runExternalDetection(FIXTURE, {}, {
      dependencyCruiser: { enabled: false },
    });
    expect(res.warnings.some((w) => w.category === WarningCategory.CircularDependency)).toBe(false);
    expect(res.warnings.some((w) => w.category === WarningCategory.OrphanedCode)).toBe(true);
  }, 120_000);
});
