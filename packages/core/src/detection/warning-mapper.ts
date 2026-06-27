/**
 * Pure mapping layer: detection-engine JSON → Surveyor `Warning[]`.
 *
 * Kept free of IO so it is exhaustively unit-testable against captured real tool
 * output. Category mapping (per the locked plan):
 *   - knip unused FILE            → orphaned_code      (genuinely unreachable file)
 *   - knip unused EXPORT / TYPE   → unused_export
 *   - dependency-cruiser CYCLE    → circular_dependency
 *
 * `source`, `confidence`, and `dismissible` come from the resolved DetectionConfig
 * so the UI can rank and soft-present findings.
 */

import { v4 as uuidv4 } from 'uuid';
import type { NodeMap } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import type { Warning } from '../types/warning.types.js';
import { WarningCategory, WarningLevel, WarningSource } from '../types/warning.types.js';
import type { DetectionConfig, KnipIssueType } from './detection-config.js';
import type {
  KnipJsonReport,
  KnipSymbolIssue,
  DepCruiseJsonReport,
} from './engine-output.types.js';

/** Resolves a project-relative file path to a scan node id, or null if absent. */
export type NodeResolver = (relativeFilePath: string) => string | null;

/**
 * Build a resolver from a scan's NodeMap. Engine paths are project-relative
 * (matching FileNode.filePath), so this is a direct lookup.
 */
export function buildNodeResolver(nodes: NodeMap): NodeResolver {
  const byPath = new Map<string, string>();
  for (const node of Object.values(nodes)) {
    if (node.type === NodeType.File) {
      byPath.set(node.filePath, node.id);
    }
  }
  return (relativeFilePath: string) => byPath.get(relativeFilePath) ?? null;
}

/** Identity resolver — keeps the raw path as the affected node when unresolved. */
const identityResolver: NodeResolver = () => null;

function affected(resolve: NodeResolver, relPath: string): string[] {
  // Prefer the scan node id (so the UI can highlight on the map); fall back to
  // the raw path so the finding still carries a location.
  return [resolve(relPath) ?? relPath];
}

/** knip symbol-issue groups that map to an unused EXPORT warning. */
const EXPORT_LIKE: ReadonlySet<KnipIssueType> = new Set<KnipIssueType>([
  'exports',
  'nsExports',
]);
/** knip symbol-issue groups that map to an unused TYPE warning. */
const TYPE_LIKE: ReadonlySet<KnipIssueType> = new Set<KnipIssueType>(['types', 'nsTypes']);

/**
 * Map a knip JSON report to warnings, honouring `config.knip.issueTypes`
 * (already mode-adjusted by resolveDetectionConfig — e.g. library mode drops
 * export/type groups).
 */
export function mapKnipReport(
  report: KnipJsonReport,
  config: DetectionConfig,
  resolve: NodeResolver = identityResolver,
  detectedAt: string = new Date().toISOString()
): Warning[] {
  const warnings: Warning[] = [];
  const enabled = new Set(config.knip.issueTypes);

  for (const entry of report.issues) {
    // Unused FILES → orphaned_code
    if (enabled.has('files')) {
      for (const fileIssue of entry.files ?? []) {
        warnings.push({
          id: uuidv4(),
          category: WarningCategory.OrphanedCode,
          level: WarningLevel.Info,
          title: `Unused file: ${fileIssue.name}`,
          description:
            `"${fileIssue.name}" is not reachable from any entry point and is not imported ` +
            `anywhere in the project. It is likely dead code left over from a refactor. ` +
            `Verify it is not an undeclared entry point (e.g. a manually-run script) before removing.`,
          affectedNodes: affected(resolve, fileIssue.name),
          suggestion: {
            summary: 'Remove the file if it is genuinely unused',
            reasoning:
              'knip walked the import graph from the detected entry points and never reached this file. ' +
              'If it is an entry point (a script run directly, a tool config), add it to the scan entry config.',
            codeExample: null,
            autoFixable: false,
          },
          detectedAt,
          source: WarningSource.Knip,
          confidence: config.confidence.knipFile,
          dismissible: config.dismissible.knipFile,
        });
      }
    }

    // Unused EXPORTS → unused_export
    for (const group of EXPORT_LIKE) {
      if (!enabled.has(group)) continue;
      for (const sym of (entry[group] as KnipSymbolIssue[] | undefined) ?? []) {
        warnings.push(
          symbolWarning(entry.file, sym, {
            title: `Unused export: ${sym.name}`,
            description:
              `The export "${sym.name}" in ${entry.file} is not imported anywhere in the project. ` +
              `It may be dead code, or it may be used only internally (the \`export\` keyword is then ` +
              `redundant) — review before removing.`,
            confidence: config.confidence.knipExport,
            dismissible: config.dismissible.knipExport,
            detectedAt,
            resolve,
          })
        );
      }
    }

    // Unused TYPE exports → unused_export
    for (const group of TYPE_LIKE) {
      if (!enabled.has(group)) continue;
      for (const sym of (entry[group] as KnipSymbolIssue[] | undefined) ?? []) {
        warnings.push(
          symbolWarning(entry.file, sym, {
            title: `Unused type export: ${sym.name}`,
            description:
              `The exported type "${sym.name}" in ${entry.file} is not imported anywhere in the project.`,
            confidence: config.confidence.knipType,
            dismissible: config.dismissible.knipType,
            detectedAt,
            resolve,
          })
        );
      }
    }
  }

  return warnings;
}

function symbolWarning(
  file: string,
  _sym: KnipSymbolIssue,
  opts: {
    title: string;
    description: string;
    confidence: number;
    dismissible: boolean;
    detectedAt: string;
    resolve: NodeResolver;
  }
): Warning {
  return {
    id: uuidv4(),
    category: WarningCategory.UnusedExport,
    level: WarningLevel.Info,
    title: opts.title,
    description: opts.description,
    affectedNodes: affected(opts.resolve, file),
    suggestion: {
      summary: 'Remove the export if unused, or drop the `export` keyword if only used internally',
      reasoning:
        'knip resolves usage through the TypeScript compiler, so dynamic / lazy imports and ' +
        'property access are accounted for. If this is intentional public API, switch the scan to ' +
        'library mode or dismiss the finding.',
      codeExample: null,
      autoFixable: false,
    },
    detectedAt: opts.detectedAt,
    source: WarningSource.Knip,
    confidence: opts.confidence,
    dismissible: opts.dismissible,
  };
}

/**
 * Map dependency-cruiser violations to circular-dependency warnings. Cycles are
 * de-duplicated by their member SET (dependency-cruiser reports the same cycle
 * once per starting edge). A cycle with any type-only edge is runtime-harmless
 * (type imports are erased on compile) → lower confidence + Info level.
 */
export function mapDepCruiseReport(
  report: DepCruiseJsonReport,
  config: DetectionConfig,
  resolve: NodeResolver = identityResolver,
  detectedAt: string = new Date().toISOString()
): Warning[] {
  const warnings: Warning[] = [];
  const seen = new Set<string>();

  for (const v of report.summary.violations) {
    if (v.rule?.name !== 'no-circular' && v.type !== 'cycle') continue;

    const members = (v.cycle && v.cycle.length > 0
      ? v.cycle.map((h) => h.name)
      : [v.from, v.to]).filter(Boolean);
    if (members.length === 0) continue;

    const key = [...members].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const typeOnly = isRuntimeHarmless(v);
    const names = members.map((m) => m.split('/').pop() ?? m);

    warnings.push({
      id: uuidv4(),
      category: WarningCategory.CircularDependency,
      level: typeOnly ? WarningLevel.Info : WarningLevel.Warning,
      title: `Circular dependency: ${names.join(' → ')} → ${names[0]}`,
      description: typeOnly
        ? `These modules form an import cycle, but at least one edge is type-only and is erased at ` +
          `compile time, so it does not cause a runtime initialization-order problem. Still a sign of ` +
          `tangled module boundaries worth untangling.`
        : `These modules form a runtime import cycle (${members.join(' → ')} → ${members[0]}). This can ` +
          `cause module initialization-order bugs and makes the code harder to reason about.`,
      affectedNodes: members.map((m) => resolve(m) ?? m),
      suggestion: {
        summary: 'Break the cycle by extracting the shared code into a separate module',
        reasoning:
          'Cycles couple modules bidirectionally. Move the shared types/values both files need into a ' +
          'third module that each imports one-way.',
        codeExample: null,
        autoFixable: false,
      },
      detectedAt,
      source: WarningSource.DependencyCruiser,
      confidence: typeOnly ? config.confidence.cycleTypeOnly : config.confidence.cycle,
      dismissible: config.dismissible.cycle,
    });
  }

  return warnings;
}

/** A cycle is runtime-harmless when any edge in it is type-only (erased on compile). */
function isRuntimeHarmless(v: DepCruiseJsonReport['summary']['violations'][number]): boolean {
  if (v.cycle && v.cycle.length > 0) {
    return v.cycle.some((h) => h.dependencyTypes?.includes('type-only'));
  }
  return v.dependencyTypes?.includes('type-only') ?? false;
}
