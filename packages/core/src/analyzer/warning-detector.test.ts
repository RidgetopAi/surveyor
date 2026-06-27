/**
 * Characterization tests for the warning detector's non-connection detectors.
 *
 * The existing warning-detector-connections.test.ts covers the connection-graph
 * paths (orphaned code + circular dependency consistency with FunctionCall/Import
 * connections). This file LOCKS the CURRENT behavior of the other detectors so
 * later phases can change them deliberately:
 *
 *   - large-file detection (threshold boundary + severity tiers)
 *   - unused-export detection (incl. barrel/star re-export crediting, namespace
 *     imports, framework-convention skips, type-only skips, index-file skip)
 *   - file-level circular-dependency detection
 *
 * These tests run scanProject(..., { skipWarnings: true }) to get the node/
 * connection graph, then call detectWarnings directly with each detector
 * isolated, so a scenario is never polluted by an unrelated detector.
 *
 * NOTE: these assert what the detector CURRENTLY does (including quirks), not
 * what it ideally should do. If a later phase intentionally changes behavior,
 * update these together with the change.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { scanProject } from '../parser/typescript-parser.js';
import { detectWarnings } from './warning-detector.js';
import { WarningCategory, WarningLevel } from '../types/warning.types.js';
import type { WarningDetectorOptions } from '../types/analyzer.types.js';

const FIXTURES = path.join(__dirname, '../../../../test-fixtures/warning-detector');

/** Scan a fixture (no warnings) then run only the requested detector(s). */
async function detect(fixture: string, opts: WarningDetectorOptions) {
  const dir = path.join(FIXTURES, fixture);
  const scan = await scanProject(dir, { skipWarnings: true });
  // Isolate: start with everything off, caller turns on what it tests.
  const isolated: WarningDetectorOptions = {
    detectFileCircular: false,
    detectFunctionCircular: false,
    detectOrphaned: false,
    detectUnusedExports: false,
    detectLargeFiles: false,
    ...opts,
  };
  const warnings = await detectWarnings(scan, isolated);
  return { scan, warnings };
}

describe('warning detector — large-file detection', () => {
  it('does NOT flag a file whose line count equals the threshold (strict >)', async () => {
    // Read the fixture's reported endLine so the boundary test is robust to edits.
    const { scan } = await detect('large-file', { detectLargeFiles: true });
    const big = Object.values(scan.nodes).find((n) => n.type === 'file' && n.name === 'big.ts');
    expect(big).toBeDefined();
    const lines = (big as { endLine: number }).endLine;

    const { warnings } = await detect('large-file', {
      detectLargeFiles: true,
      largeFileThreshold: lines, // threshold == line count
    });
    const large = warnings.filter((w) => w.category === WarningCategory.LargeFile);
    expect(large).toHaveLength(0);
  });

  it('flags a file one line over the threshold, at Info level', async () => {
    const { scan } = await detect('large-file', { detectLargeFiles: true });
    const big = Object.values(scan.nodes).find((n) => n.type === 'file' && n.name === 'big.ts');
    const lines = (big as { endLine: number }).endLine;

    const { warnings } = await detect('large-file', {
      detectLargeFiles: true,
      largeFileThreshold: lines - 1, // just over -> warns, but not > 2x -> Info
    });
    const large = warnings.filter((w) => w.category === WarningCategory.LargeFile);
    expect(large).toHaveLength(1);
    expect(large[0].level).toBe(WarningLevel.Info);
    expect(large[0].title).toContain(`${lines} lines`);
  });

  it('escalates to Warning level when line count exceeds twice the threshold', async () => {
    const { scan } = await detect('large-file', { detectLargeFiles: true });
    const big = Object.values(scan.nodes).find((n) => n.type === 'file' && n.name === 'big.ts');
    const lines = (big as { endLine: number }).endLine;

    // Pick a threshold well below half so lines > threshold * 2.
    const threshold = Math.floor(lines / 3);
    expect(lines).toBeGreaterThan(threshold * 2); // sanity: we're in the Warning tier

    const { warnings } = await detect('large-file', {
      detectLargeFiles: true,
      largeFileThreshold: threshold,
    });
    const large = warnings.filter((w) => w.category === WarningCategory.LargeFile);
    expect(large).toHaveLength(1);
    expect(large[0].level).toBe(WarningLevel.Warning);
  });
});

describe('warning detector — unused-export detection', () => {
  // Helper: names of exports flagged as unused for this fixture.
  async function unusedExportTitles() {
    const { warnings } = await detect('unused-exports', {
      detectUnusedExports: true,
      frameworkConventions: true,
    });
    return warnings
      .filter((w) => w.category === WarningCategory.UnusedExport)
      .map((w) => w.title);
  }

  it('flags a plain export that is never imported anywhere', async () => {
    const titles = await unusedExportTitles();
    expect(titles).toContain('Unused export: unusedFn');
  });

  it('does NOT flag an export that is imported directly', async () => {
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: usedDirect');
  });

  it('does NOT flag an export consumed through a named barrel re-export', async () => {
    // source.ts: export reExported -> barrel.ts: export { reExported } from './source'
    // -> consumer imports reExported from './barrel'. The source must be credited.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: reExported');
  });

  it('does NOT flag an export consumed through a star (export *) re-export', async () => {
    // star-source.ts: export starFn -> barrel.ts: export * from './star-source'
    // -> consumer imports starFn from './barrel'.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: starFn');
  });

  it('does NOT flag ANY export of a module pulled in via a namespace import', async () => {
    // consumer: `import * as ns from './namespace-target'` marks the whole module
    // used, so nsB is not flagged even though it is never referenced by name.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: nsA');
    expect(titles).not.toContain('Unused export: nsB');
  });

  it('does NOT flag type-only exports (type alias / interface)', async () => {
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: UnusedType');
    expect(titles).not.toContain('Unused export: UnusedIface');
  });

  it('skips exports from build-tool config files (framework convention)', async () => {
    // vite.config.ts default export is never imported but is a config convention.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: default');
  });

  it('skips Next.js convention exports per-file but still flags non-convention exports', async () => {
    // page.tsx: `metadata` + default are conventions on page.* -> not flagged;
    // `pageHelper` is not a convention and is unused -> flagged.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: metadata');
    expect(titles).toContain('Unused export: pageHelper');
  });

  it('skips files named index.ts wholesale', async () => {
    // index.ts exports indexOnlyExport that nothing imports, yet it is not flagged.
    const titles = await unusedExportTitles();
    expect(titles).not.toContain('Unused export: indexOnlyExport');
  });

  it('flags exactly the expected set (no over-reporting)', async () => {
    // Locks the full surface: only unusedFn and pageHelper are unused exports.
    const titles = (await unusedExportTitles()).sort();
    expect(titles).toEqual(['Unused export: pageHelper', 'Unused export: unusedFn']);
  });
});

describe('warning detector — file-level circular dependency', () => {
  it('detects a two-file import cycle (a -> b -> a)', async () => {
    const { scan, warnings } = await detect('circular', { detectFileCircular: true });
    const circular = warnings.filter((w) => w.category === WarningCategory.CircularDependency);

    expect(circular).toHaveLength(1);
    expect(circular[0].level).toBe(WarningLevel.Warning);
    // Both files are in the cycle.
    expect(circular[0].affectedNodes).toHaveLength(2);
    const cycleNames = circular[0].affectedNodes
      .map((id) => scan.nodes[id]?.name)
      .filter(Boolean)
      .sort();
    expect(cycleNames).toEqual(['a.ts', 'b.ts']);
    expect(circular[0].title).toContain('Circular import');
  });

  it('produces no circular warning when that detector is disabled', async () => {
    const { warnings } = await detect('circular', { detectFileCircular: false });
    const circular = warnings.filter((w) => w.category === WarningCategory.CircularDependency);
    expect(circular).toHaveLength(0);
  });
});
