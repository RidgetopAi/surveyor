/**
 * Tests for the pure mapping layer: detection-engine JSON → Warning[].
 *
 * The JSON shapes below are trimmed from REAL captured tool output (knip
 * --reporter json, dependency-cruiser --output-type json on ra-mandrel), so the
 * mapper is exercised against the actual contract, not an invented one.
 */

import { describe, it, expect } from 'vitest';
import {
  mapKnipReport,
  mapDepCruiseReport,
  buildNodeResolver,
  type NodeResolver,
} from './warning-mapper.js';
import { resolveDetectionConfig } from './detection-config.js';
import { WarningCategory, WarningLevel, WarningSource } from '../types/warning.types.js';
import { NodeType } from '../types/node.types.js';
import type { NodeMap } from '../types/node.types.js';
import type { KnipJsonReport, DepCruiseJsonReport } from './engine-output.types.js';

const DETECTED_AT = '2026-06-27T00:00:00.000Z';

// ── knip sample (trimmed real shape) ────────────────────────────────
const KNIP_SAMPLE: KnipJsonReport = {
  issues: [
    {
      file: 'src/orphan.ts',
      files: [{ name: 'src/orphan.ts' }],
      exports: [],
      types: [],
    },
    {
      file: 'src/hasUnusedExport.ts',
      files: [],
      exports: [{ name: 'deadExport', line: 5, col: 17, pos: 120 }],
      types: [{ name: 'DeadType', line: 9, col: 13, pos: 200 }],
      nsExports: [{ name: 'nsThing', line: 1, col: 1, pos: 1 }],
    },
  ],
};

describe('mapKnipReport', () => {
  const config = resolveDetectionConfig();

  it('maps an unused FILE to an orphaned_code warning from knip', () => {
    const ws = mapKnipReport(KNIP_SAMPLE, config, undefined, DETECTED_AT);
    const fileW = ws.find((w) => w.category === WarningCategory.OrphanedCode);
    expect(fileW).toBeDefined();
    expect(fileW!.source).toBe(WarningSource.Knip);
    expect(fileW!.title).toBe('Unused file: src/orphan.ts');
    expect(fileW!.confidence).toBe(config.confidence.knipFile);
    expect(fileW!.dismissible).toBe(config.dismissible.knipFile);
    expect(fileW!.level).toBe(WarningLevel.Info);
    expect(fileW!.detectedAt).toBe(DETECTED_AT);
  });

  it('maps an unused EXPORT to an unused_export warning', () => {
    const ws = mapKnipReport(KNIP_SAMPLE, config, undefined, DETECTED_AT);
    const exp = ws.find((w) => w.title === 'Unused export: deadExport');
    expect(exp).toBeDefined();
    expect(exp!.category).toBe(WarningCategory.UnusedExport);
    expect(exp!.source).toBe(WarningSource.Knip);
    expect(exp!.confidence).toBe(config.confidence.knipExport);
    expect(exp!.affectedNodes).toEqual(['src/hasUnusedExport.ts']);
  });

  it('maps an unused TYPE export to an unused_export warning with the type title', () => {
    const ws = mapKnipReport(KNIP_SAMPLE, config, undefined, DETECTED_AT);
    const typ = ws.find((w) => w.title === 'Unused type export: DeadType');
    expect(typ).toBeDefined();
    expect(typ!.category).toBe(WarningCategory.UnusedExport);
    expect(typ!.confidence).toBe(config.confidence.knipType);
  });

  it('honours config.knip.issueTypes — library mode emits only files', () => {
    const libCfg = resolveDetectionConfig({ mode: 'library' });
    const ws = mapKnipReport(KNIP_SAMPLE, libCfg, undefined, DETECTED_AT);
    expect(ws.every((w) => w.category === WarningCategory.OrphanedCode)).toBe(true);
    expect(ws).toHaveLength(1);
  });

  it('emits nsExports only when that issue type is enabled', () => {
    const withNs = resolveDetectionConfig({ knip: { issueTypes: ['nsExports'] } });
    const ws = mapKnipReport(KNIP_SAMPLE, withNs, undefined, DETECTED_AT);
    expect(ws).toHaveLength(1);
    expect(ws[0].title).toBe('Unused export: nsThing');
  });

  it('resolves affectedNodes to scan node ids when a resolver is provided', () => {
    const nodes: NodeMap = {
      'node-1': {
        id: 'node-1',
        type: NodeType.File,
        name: 'orphan.ts',
        filePath: 'src/orphan.ts',
        line: 1,
        endLine: 3,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        topLevelReferences: [],
      },
    };
    const resolve = buildNodeResolver(nodes);
    const ws = mapKnipReport(KNIP_SAMPLE, config, resolve, DETECTED_AT);
    const fileW = ws.find((w) => w.category === WarningCategory.OrphanedCode);
    expect(fileW!.affectedNodes).toEqual(['node-1']);
  });

  it('every mapped warning carries source, numeric confidence and a dismissible flag', () => {
    const ws = mapKnipReport(KNIP_SAMPLE, config, undefined, DETECTED_AT);
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      expect(w.source).toBe(WarningSource.Knip);
      expect(typeof w.confidence).toBe('number');
      expect(w.confidence).toBeGreaterThan(0);
      expect(w.confidence).toBeLessThanOrEqual(1);
      expect(typeof w.dismissible).toBe('boolean');
      expect(w.id).toBeTruthy();
    }
  });
});

// ── dependency-cruiser sample (trimmed real shape) ──────────────────
const runtimeCycle = {
  type: 'cycle',
  from: 'src/cycleA.ts',
  to: 'src/cycleB.ts',
  dependencyTypes: ['local', 'import'],
  rule: { severity: 'warn', name: 'no-circular' },
  cycle: [
    { name: 'src/cycleB.ts', dependencyTypes: ['local', 'import'] },
    { name: 'src/cycleA.ts', dependencyTypes: ['local', 'import'] },
  ],
};

// Same cycle reported from the other starting edge — must be de-duplicated.
const runtimeCycleDup = {
  ...runtimeCycle,
  from: 'src/cycleB.ts',
  to: 'src/cycleA.ts',
  cycle: [
    { name: 'src/cycleA.ts', dependencyTypes: ['local', 'import'] },
    { name: 'src/cycleB.ts', dependencyTypes: ['local', 'import'] },
  ],
};

const typeOnlyCycle = {
  type: 'cycle',
  from: 'src/routes/context.routes.ts',
  to: 'src/routes/index.ts',
  dependencyTypes: ['local', 'type-only', 'import'],
  rule: { severity: 'warn', name: 'no-circular' },
  cycle: [
    { name: 'src/routes/index.ts', dependencyTypes: ['local', 'import'] },
    { name: 'src/routes/context.routes.ts', dependencyTypes: ['local', 'type-only', 'import'] },
  ],
};

const DC_SAMPLE: DepCruiseJsonReport = {
  summary: {
    violations: [runtimeCycle, runtimeCycleDup, typeOnlyCycle],
    error: 0,
    totalCruised: 10,
  },
};

describe('mapDepCruiseReport', () => {
  const config = resolveDetectionConfig();

  it('maps a runtime cycle to a circular_dependency Warning at Warning level', () => {
    const ws = mapDepCruiseReport(DC_SAMPLE, config, undefined, DETECTED_AT);
    const runtime = ws.find((w) => w.title.includes('cycleA'));
    expect(runtime).toBeDefined();
    expect(runtime!.category).toBe(WarningCategory.CircularDependency);
    expect(runtime!.source).toBe(WarningSource.DependencyCruiser);
    expect(runtime!.level).toBe(WarningLevel.Warning);
    expect(runtime!.confidence).toBe(config.confidence.cycle);
  });

  it('de-duplicates the same cycle reported from different starting edges', () => {
    const ws = mapDepCruiseReport(DC_SAMPLE, config, undefined, DETECTED_AT);
    const cycleAB = ws.filter((w) => w.title.includes('cycleA') && w.title.includes('cycleB'));
    expect(cycleAB).toHaveLength(1);
  });

  it('flags a type-only cycle as runtime-harmless (Info + lower confidence)', () => {
    const ws = mapDepCruiseReport(DC_SAMPLE, config, undefined, DETECTED_AT);
    const typeOnly = ws.find((w) => w.title.includes('context.routes'));
    expect(typeOnly).toBeDefined();
    expect(typeOnly!.level).toBe(WarningLevel.Info);
    expect(typeOnly!.confidence).toBe(config.confidence.cycleTypeOnly);
    expect(typeOnly!.description).toMatch(/type-only|erased/i);
  });

  it('resolves cycle members to scan node ids', () => {
    const nodes: NodeMap = {
      a: mkFile('a', 'src/cycleA.ts'),
      b: mkFile('b', 'src/cycleB.ts'),
    };
    const resolve = buildNodeResolver(nodes);
    const ws = mapDepCruiseReport(DC_SAMPLE, config, resolve, DETECTED_AT);
    const runtime = ws.find((w) => w.title.includes('cycleA'))!;
    expect(runtime.affectedNodes.sort()).toEqual(['a', 'b']);
  });

  it('ignores non-circular violations', () => {
    const report: DepCruiseJsonReport = {
      summary: {
        violations: [
          { type: 'dependency', from: 'a', to: 'b', rule: { name: 'no-orphans', severity: 'warn' } },
        ],
      },
    };
    expect(mapDepCruiseReport(report, config, undefined, DETECTED_AT)).toHaveLength(0);
  });

  it('returns nothing for an empty violations list', () => {
    expect(
      mapDepCruiseReport({ summary: { violations: [] } }, config, undefined, DETECTED_AT)
    ).toEqual([]);
  });
});

function mkFile(id: string, filePath: string): NodeMap[string] {
  return {
    id,
    type: NodeType.File,
    name: filePath.split('/').pop()!,
    filePath,
    line: 1,
    endLine: 10,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    topLevelReferences: [],
  };
}

const _typeCheckResolver: NodeResolver = () => null;
void _typeCheckResolver;
