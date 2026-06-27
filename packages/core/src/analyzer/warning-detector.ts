/**
 * Warning detector - Surveyor's in-process detectors.
 *
 * As of Phase 1 (trustworthy analysis) only `large_file` runs by default; the
 * circular / orphaned / unused-export detectors here are RETIRED from the default
 * path (DEFAULT_WARNING_OPTIONS turns them off) in favour of knip +
 * dependency-cruiser (see src/detection). They remain available behind explicit
 * options for the characterization tests and FP comparison.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ScanResult, NodeMap, FileNode, FunctionNode } from '../types/index.js';
import type { Warning } from '../types/warning.types.js';
import { WarningLevel, WarningCategory, WarningSource } from '../types/warning.types.js';
import { DEFAULT_DETECTION_CONFIG } from '../detection/detection-config.js';

/**
 * Confidence/dismissibility for the RETIRED, opt-in legacy detectors. These are
 * not in the product default path; the low confidence reflects their measured
 * unreliability on real code. Kept as named config, not inline magic numbers.
 */
const LEGACY_DETECTOR = {
  fileCircular: { confidence: 0.7, dismissible: true },
  functionCircular: { confidence: 0.6, dismissible: true },
  orphaned: { confidence: 0.3, dismissible: true },
  unusedExport: { confidence: 0.4, dismissible: true },
} as const;
import { NodeType } from '../types/node.types.js';
import type { Connection } from '../types/connection.types.js';
import { ConnectionType } from '../types/connection.types.js';
import type { WarningDetectorOptions, PathAliases } from '../types/analyzer.types.js';
import { DEFAULT_WARNING_OPTIONS } from '../types/analyzer.types.js';
import { scanNonTsImports, mergeImportMaps } from './scan-non-ts-imports.js';
import { scanTestFileImports } from './scan-test-imports.js';
import {
  resolvePathAlias,
  normalizeImportSource,
  normalizeFilePath,
  getNormalizedPaths,
} from '../resolver/import-resolver.js';

/**
 * Next.js framework conventions - exports that are used by the framework
 * Maps export name -> file patterns where they're valid
 */
const NEXTJS_CONVENTIONS: Record<string, RegExp[]> = {
  // Route segment config
  dynamic: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  revalidate: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  fetchCache: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  runtime: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  preferredRegion: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  maxDuration: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],

  // Metadata
  metadata: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/],
  generateMetadata: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/],
  viewport: [/layout\.(tsx?|jsx?)$/],
  generateViewport: [/layout\.(tsx?|jsx?)$/],

  // Static generation
  generateStaticParams: [/page\.(tsx?|jsx?)$/],

  // API routes
  GET: [/route\.(tsx?|jsx?)$/],
  POST: [/route\.(tsx?|jsx?)$/],
  PUT: [/route\.(tsx?|jsx?)$/],
  DELETE: [/route\.(tsx?|jsx?)$/],
  PATCH: [/route\.(tsx?|jsx?)$/],
  HEAD: [/route\.(tsx?|jsx?)$/],
  OPTIONS: [/route\.(tsx?|jsx?)$/],

  // Middleware
  middleware: [/middleware\.(tsx?|jsx?)$/],
  config: [/middleware\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],

  // Special files
  manifest: [/manifest\.(tsx?|jsx?)$/],

  // Error/Loading boundaries and special files (default exports)
  default: [
    /error\.(tsx?|jsx?)$/,
    /loading\.(tsx?|jsx?)$/,
    /not-found\.(tsx?|jsx?)$/,
    /layout\.(tsx?|jsx?)$/,
    /page\.(tsx?|jsx?)$/,
    /template\.(tsx?|jsx?)$/,
    /manifest\.(tsx?|jsx?)$/,
  ],
};

/**
 * Config file patterns - exports from these are used by build tools
 */
const CONFIG_FILE_PATTERNS = [
  /^next\.config\.(ts|js|mjs)$/,
  /^vitest\.config\.(ts|js|mjs)$/,
  /^vite\.config\.(ts|js|mjs)$/,
  /^jest\.config\.(ts|js|mjs)$/,
  /^tailwind\.config\.(ts|js|mjs)$/,
  /^postcss\.config\.(ts|js|mjs)$/,
  /^eslint\.config\.(ts|js|mjs)$/,
  /^tsconfig\..*\.json$/,
];

/**
 * Check if an export is a framework convention
 */
function isFrameworkConvention(exportName: string, filePath: string): boolean {
  // Check if it's a config file
  const fileName = filePath.split('/').pop() || '';
  if (CONFIG_FILE_PATTERNS.some(p => p.test(fileName))) {
    return true;
  }

  // Check Next.js conventions
  const patterns = NEXTJS_CONVENTIONS[exportName];
  if (patterns) {
    return patterns.some(p => p.test(filePath));
  }

  return false;
}

/**
 * Detect all warnings in a scan result
 */
export async function detectWarnings(
  scanResult: ScanResult,
  options: WarningDetectorOptions = {}
): Promise<Warning[]> {
  const opts = { ...DEFAULT_WARNING_OPTIONS, ...options };
  const warnings: Warning[] = [];
  const now = new Date().toISOString();

  // Circular dependencies (file level)
  if (opts.detectFileCircular) {
    warnings.push(...detectFileCircularDependencies(scanResult.nodes, scanResult.connections, now));
  }

  // Circular dependencies (function level) - more expensive
  if (opts.detectFunctionCircular) {
    warnings.push(...detectFunctionCircularDependencies(scanResult.nodes, scanResult.connections, now));
  }

  // Orphaned code
  if (opts.detectOrphaned) {
    warnings.push(...detectOrphanedCode(scanResult.nodes, scanResult.connections, opts, now));
  }

  // Unused exports - scan non-TS files for imports too
  if (opts.detectUnusedExports) {
    warnings.push(...await detectUnusedExports(scanResult.nodes, scanResult.projectPath, opts, now));
  }

  // Large files
  if (opts.detectLargeFiles) {
    warnings.push(...detectLargeFiles(scanResult.nodes, opts.largeFileThreshold, now));
  }

  return warnings;
}

/**
 * Detect circular dependencies at file level (import cycles)
 * Uses pre-built Import connections from the connection graph
 */
function detectFileCircularDependencies(
  nodes: NodeMap,
  connections: Connection[],
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  // Build adjacency list from Import connections (already resolved)
  const graph = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (conn.type !== ConnectionType.Import) continue;
    if (!graph.has(conn.sourceId)) {
      graph.set(conn.sourceId, new Set());
    }
    graph.get(conn.sourceId)!.add(conn.targetId);
  }

  // Find cycles using DFS
  const cycles = findCycles(graph);

  for (const cycle of cycles) {
    const fileNames = cycle.map((id) => {
      const node = nodes[id];
      return node ? node.name : id;
    });

    warnings.push({
      id: uuidv4(),
      category: WarningCategory.CircularDependency,
      level: WarningLevel.Warning,
      title: `Circular import: ${fileNames.join(' → ')} → ${fileNames[0]}`,
      description: `These files form a circular dependency chain. This can cause issues with module initialization order and makes the codebase harder to understand.`,
      affectedNodes: cycle,
      suggestion: {
        summary: 'Break the cycle by extracting shared code into a separate module',
        reasoning: 'Circular dependencies can cause runtime issues and make refactoring difficult. Extract the shared functionality into a new file that both modules can import.',
        codeExample: null,
        autoFixable: false,
      },
      detectedAt,
      source: WarningSource.Surveyor,
      confidence: LEGACY_DETECTOR.fileCircular.confidence,
      dismissible: LEGACY_DETECTOR.fileCircular.dismissible,
    });
  }

  return warnings;
}

/**
 * Detect circular dependencies at function level (call cycles)
 * Uses pre-built FunctionCall connections from the connection graph
 */
function detectFunctionCircularDependencies(
  nodes: NodeMap,
  connections: Connection[],
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  // Build adjacency list from FunctionCall connections
  const graph = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (conn.type !== ConnectionType.FunctionCall) continue;
    if (!graph.has(conn.sourceId)) {
      graph.set(conn.sourceId, new Set());
    }
    graph.get(conn.sourceId)!.add(conn.targetId);
  }

  // Skip if no function call connections
  if (graph.size === 0) return warnings;

  // Find cycles using DFS
  const cycles = findCycles(graph);

  for (const cycle of cycles) {
    const funcNames = cycle.map((id) => {
      const node = nodes[id];
      return node ? node.name : id;
    });

    warnings.push({
      id: uuidv4(),
      category: WarningCategory.CircularDependency,
      level: WarningLevel.Warning,
      title: `Circular call chain: ${funcNames.join(' → ')} → ${funcNames[0]}`,
      description: `These functions form a circular call chain. This can lead to infinite recursion if not handled carefully.`,
      affectedNodes: cycle,
      suggestion: {
        summary: 'Review the call chain for potential infinite recursion',
        reasoning: 'Circular function calls can cause stack overflows. Ensure there is a proper base case or termination condition.',
        codeExample: null,
        autoFixable: false,
      },
      detectedAt,
      source: WarningSource.Surveyor,
      confidence: LEGACY_DETECTOR.functionCircular.confidence,
      dismissible: LEGACY_DETECTOR.functionCircular.dismissible,
    });
  }

  return warnings;
}

/**
 * Detect orphaned code (functions not called by anything)
 *
 * Uses the pre-built connection graph for accurate scope-aware detection:
 * - Checks for incoming FunctionCall connections (both local and cross-file)
 * - Checks top-level references (callbacks, object literals)
 * - Eliminates false positives from cross-file name collisions
 */
function detectOrphanedCode(
  nodes: NodeMap,
  connections: Connection[],
  opts: Required<WarningDetectorOptions>,
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  const functionNodes = Object.values(nodes).filter(
    (n): n is FunctionNode => n.type === NodeType.Function
  );

  // Build set of function IDs that have incoming FunctionCall connections
  const calledFunctionIds = new Set<string>();
  for (const conn of connections) {
    if (conn.type === ConnectionType.FunctionCall) {
      calledFunctionIds.add(conn.targetId);
    }
  }

  const entryPointPatterns = [
    /^main$/i,
    /^index$/i,
    /^app$/i,
    /^init/i,
    /^setup/i,
    /^bootstrap/i,
    /^handler$/i,
    /^middleware$/i,
    /^router$/i,
  ];

  for (const func of functionNodes) {
    // Skip if exported (used externally or as public API)
    if (func.isExported) continue;

    // Skip if it's a class method (called via instance)
    if (func.parentClassId) continue;

    // Skip if it matches entry point patterns
    if (entryPointPatterns.some((p) => p.test(func.name))) continue;

    // Skip common utility patterns
    if (func.name.startsWith('_')) continue;

    // Skip framework conventions
    if (opts.frameworkConventions && isFrameworkConvention(func.name, func.filePath)) {
      continue;
    }

    // Check if any FunctionCall connection targets this function
    if (calledFunctionIds.has(func.id)) continue;

    // Check top-level references (callbacks, event handlers, object literals)
    const parentFile = nodes[func.parentFileId] as FileNode | undefined;
    if (parentFile?.topLevelReferences?.includes(func.name)) {
      continue;
    }

    // This function has no incoming calls and isn't referenced at top level
    warnings.push({
      id: uuidv4(),
      category: WarningCategory.OrphanedCode,
      level: WarningLevel.Info,
      title: `Potentially unused function: ${func.name}`,
      description: `The function "${func.name}" in ${func.filePath} is not exported and has no incoming calls. Consider removing it if unused, or export it if needed elsewhere.`,
      affectedNodes: [func.id],
      suggestion: {
        summary: 'Remove if unused, or export if needed',
        reasoning: 'Dead code increases maintenance burden and can confuse developers. If the function is needed, consider exporting it.',
        codeExample: `export function ${func.name}(...) { ... }`,
        autoFixable: false,
      },
      detectedAt,
      source: WarningSource.Surveyor,
      confidence: LEGACY_DETECTOR.orphaned.confidence,
      dismissible: LEGACY_DETECTOR.orphaned.dismissible,
    });
  }

  return warnings;
}

/**
 * Re-export info: tracks both the exported name (what consumers import) and original name (what source exports)
 */
interface ReexportInfo {
  source: string;        // Normalized source path
  originalName: string;  // Name in the source file (e.g., 'default', 'Foo')
}

/**
 * Build a map of re-exports from barrel files
 * Returns: Map<barrelFilePath, Map<exportedName, ReexportInfo>>
 * For index files, maps both 'src/foo/index' and 'src/foo' to the same exports
 *
 * Handles:
 * - Named re-exports: export { Foo } from './Foo' -> maps 'Foo' to {source:'./Foo', originalName:'Foo'}
 * - Aliased re-exports: export { Foo as Bar } from './Foo' -> maps 'Bar' to {source:'./Foo', originalName:'Foo'}
 * - Default re-exports: export { default as X } from './Y' -> maps 'X' to {source:'./Y', originalName:'default'}
 */
function buildReexportMap(
  fileNodes: FileNode[],
  pathAliases: PathAliases
): Map<string, Map<string, ReexportInfo>> {
  const reexportMap = new Map<string, Map<string, ReexportInfo>>();

  for (const file of fileNodes) {
    // Look for re-export entries that have a source path
    const reexports: Array<{ exportedName: string; info: ReexportInfo }> = [];

    for (const exp of file.exports) {
      if (exp.kind === 'reexport' && exp.source && exp.name !== '*') {
        // Resolve and normalize the original source
        const resolvedSource = resolvePathAlias(exp.source, pathAliases);
        const originalSource = normalizeImportSource(resolvedSource, file.filePath);

        // exportedName is what consumers import (alias if present, otherwise original name)
        // originalName is what the source file exports
        const exportedName = exp.alias || exp.name;
        const originalName = exp.name;

        reexports.push({
          exportedName,
          info: { source: originalSource, originalName }
        });
      }
    }

    if (reexports.length > 0) {
      const [normalizedFile, directoryPath] = getNormalizedPaths(file.filePath);

      // Add under the full path
      if (!reexportMap.has(normalizedFile)) {
        reexportMap.set(normalizedFile, new Map());
      }
      for (const { exportedName, info } of reexports) {
        reexportMap.get(normalizedFile)!.set(exportedName, info);
      }

      // Also add under the directory path for index files
      if (directoryPath) {
        if (!reexportMap.has(directoryPath)) {
          reexportMap.set(directoryPath, new Map());
        }
        for (const { exportedName, info } of reexports) {
          reexportMap.get(directoryPath)!.set(exportedName, info);
        }
      }
    }
  }

  return reexportMap;
}

/**
 * Build a map of star re-exports: barrel file path -> list of source paths
 * Used to handle "export * from './utils'" patterns
 */
function buildStarReexportMap(
  fileNodes: FileNode[],
  pathAliases: PathAliases
): Map<string, string[]> {
  const starReexportMap = new Map<string, string[]>();

  for (const file of fileNodes) {
    const starSources: string[] = [];

    for (const exp of file.exports) {
      // Star re-exports have name === '*'
      if (exp.kind === 'reexport' && exp.name === '*' && exp.source) {
        const resolvedSource = resolvePathAlias(exp.source, pathAliases);
        const originalSource = normalizeImportSource(resolvedSource, file.filePath);
        starSources.push(originalSource);
      }
    }

    if (starSources.length > 0) {
      const [normalizedFile, directoryPath] = getNormalizedPaths(file.filePath);

      starReexportMap.set(normalizedFile, starSources);
      if (directoryPath) {
        starReexportMap.set(directoryPath, starSources);
      }
    }
  }

  return starReexportMap;
}

/**
 * Detect exports that aren't imported anywhere in the project
 * Scans both TypeScript files and non-TS files (.svelte, .vue, .astro, etc.)
 */
async function detectUnusedExports(
  nodes: NodeMap,
  projectPath: string,
  opts: Required<WarningDetectorOptions>,
  detectedAt: string
): Promise<Warning[]> {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Build re-export maps to track barrel file re-exports
  const reexportMap = buildReexportMap(fileNodes, opts.pathAliases);
  const starReexportMap = buildStarReexportMap(fileNodes, opts.pathAliases);

  // Collect all imports across the project
  // Maps normalized file path -> set of imported names
  const allImportedNames = new Map<string, Set<string>>();

  // Scan non-TS files for imports (.svelte, .vue, .astro, etc.)
  const nonTsImports = await scanNonTsImports(projectPath, opts.pathAliases);
  mergeImportMaps(allImportedNames, nonTsImports);

  // Scan test files for imports (two-pass scanning)
  // Test files are excluded from structural analysis but we need their imports
  // to avoid false "unused export" warnings for exports used only by tests
  if (opts.includeTestImports) {
    const testImports = await scanTestFileImports(projectPath, opts.pathAliases);
    mergeImportMaps(allImportedNames, testImports);
  }

  for (const file of fileNodes) {
    for (const imp of file.imports) {
      // Resolve path alias first, then normalize
      const resolvedSource = resolvePathAlias(imp.source, opts.pathAliases);
      const normalizedSource = normalizeImportSource(resolvedSource, file.filePath);

      if (!allImportedNames.has(normalizedSource)) {
        allImportedNames.set(normalizedSource, new Set());
      }
      const names = allImportedNames.get(normalizedSource)!;

      for (const item of imp.items) {
        if (item.isNamespace) {
          // Namespace import uses everything
          names.add('*');
        } else if (item.isDefault) {
          names.add('default');
        } else {
          names.add(item.name);

          // If this import is from a barrel file with named re-exports, credit the original source
          const barrelReexports = reexportMap.get(normalizedSource);
          if (barrelReexports) {
            const reexportInfo = barrelReexports.get(item.name);
            if (reexportInfo) {
              if (!allImportedNames.has(reexportInfo.source)) {
                allImportedNames.set(reexportInfo.source, new Set());
              }
              // Credit with the ORIGINAL name (what the source file exports), not the alias
              allImportedNames.get(reexportInfo.source)!.add(reexportInfo.originalName);
            }
          }

          // If this import is from a barrel file with star re-exports, credit those sources too
          const starSources = starReexportMap.get(normalizedSource);
          if (starSources) {
            for (const starSource of starSources) {
              if (!allImportedNames.has(starSource)) {
                allImportedNames.set(starSource, new Set());
              }
              // Credit this name to the star-exported source
              allImportedNames.get(starSource)!.add(item.name);
            }
          }
        }
      }
    }
  }

  // Check each file's exports
  for (const file of fileNodes) {
    // Skip index files - they're often re-export hubs
    if (file.name === 'index.ts' || file.name === 'index.js') continue;

    // Get what's imported from this file
    const normalizedPath = normalizeFilePath(file.filePath);
    const importedFromThisFile = allImportedNames.get(normalizedPath) || new Set();

    // If namespace import, all exports are used
    if (importedFromThisFile.has('*')) continue;

    for (const exp of file.exports) {
      // Skip re-exports
      if (exp.kind === 'reexport') continue;

      // Skip type exports - they're often imported as types elsewhere
      if (exp.isTypeOnly || exp.kind === 'type' || exp.kind === 'interface') continue;

      const exportName = exp.isDefault ? 'default' : exp.name;

      // Skip framework conventions (check both the export name and 'default' for default exports)
      if (opts.frameworkConventions) {
        if (isFrameworkConvention(exportName, file.filePath)) {
          continue;
        }
      }

      if (!importedFromThisFile.has(exportName)) {
        warnings.push({
          id: uuidv4(),
          category: WarningCategory.UnusedExport,
          level: WarningLevel.Info,
          title: `Unused export: ${exp.name}`,
          description: `The export "${exp.name}" in ${file.filePath} is not imported anywhere in the project. It may be dead code or intended for external use.`,
          affectedNodes: [file.id],
          suggestion: {
            summary: 'Remove export if unused, or document if public API',
            reasoning: 'Unused exports can indicate dead code. If this is part of a public API, consider documenting it.',
            codeExample: null,
            autoFixable: false,
          },
          detectedAt,
          source: WarningSource.Surveyor,
          confidence: LEGACY_DETECTOR.unusedExport.confidence,
          dismissible: LEGACY_DETECTOR.unusedExport.dismissible,
        });
      }
    }
  }

  return warnings;
}

/**
 * Detect files that exceed the line threshold
 */
function detectLargeFiles(
  nodes: NodeMap,
  threshold: number,
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  for (const file of fileNodes) {
    const lineCount = file.endLine;

    if (lineCount > threshold) {
      const severity = lineCount > threshold * 2
        ? WarningLevel.Warning
        : WarningLevel.Info;

      warnings.push({
        id: uuidv4(),
        category: WarningCategory.LargeFile,
        level: severity,
        title: `Large file: ${file.name} (${lineCount} lines)`,
        description: `The file ${file.filePath} has ${lineCount} lines, exceeding the threshold of ${threshold}. Large files are harder to maintain and understand.`,
        affectedNodes: [file.id],
        suggestion: {
          summary: 'Consider splitting into smaller, focused modules',
          reasoning: 'Smaller files are easier to understand, test, and maintain. Look for logical groupings of functionality that could be extracted.',
          codeExample: null,
          autoFixable: false,
        },
        detectedAt,
        source: WarningSource.Surveyor,
        confidence: DEFAULT_DETECTION_CONFIG.confidence.largeFile,
        dismissible: DEFAULT_DETECTION_CONFIG.dismissible.largeFile,
      });
    }
  }

  return warnings;
}

/**
 * Find all cycles in a directed graph using DFS
 */
function findCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract it from path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          // Only add if we haven't seen this cycle before
          const cycleKey = [...cycle].sort().join(',');
          const existingKeys = cycles.map((c) => [...c].sort().join(','));
          if (!existingKeys.includes(cycleKey)) {
            cycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Update scan result stats with warning counts
 */
export function updateWarningStats(scanResult: ScanResult): void {
  const warnings = scanResult.warnings;

  scanResult.stats.totalWarnings = warnings.length;
  scanResult.stats.warningsByLevel = {
    [WarningLevel.Info]: warnings.filter((w) => w.level === WarningLevel.Info).length,
    [WarningLevel.Warning]: warnings.filter((w) => w.level === WarningLevel.Warning).length,
    [WarningLevel.Error]: warnings.filter((w) => w.level === WarningLevel.Error).length,
  };
}
