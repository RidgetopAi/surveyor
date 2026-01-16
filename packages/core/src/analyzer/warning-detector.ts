/**
 * Warning detector - analyzes scan results for potential issues
 *
 * Detects:
 * - Circular dependencies (file and function level)
 * - Orphaned code (unreferenced functions)
 * - Unused exports
 * - Large files
 */

import { v4 as uuidv4 } from 'uuid';
import type { ScanResult, NodeMap, FileNode, FunctionNode } from '../types/index.js';
import type { Warning } from '../types/warning.types.js';
import { WarningLevel, WarningCategory } from '../types/warning.types.js';
import { NodeType } from '../types/node.types.js';
import type { WarningDetectorOptions } from '../types/analyzer.types.js';
import { DEFAULT_WARNING_OPTIONS } from '../types/analyzer.types.js';

/**
 * Detect all warnings in a scan result
 */
export function detectWarnings(
  scanResult: ScanResult,
  options: WarningDetectorOptions = {}
): Warning[] {
  const opts = { ...DEFAULT_WARNING_OPTIONS, ...options };
  const warnings: Warning[] = [];
  const now = new Date().toISOString();

  // Circular dependencies (file level)
  if (opts.detectFileCircular) {
    warnings.push(...detectFileCircularDependencies(scanResult.nodes, now));
  }

  // Circular dependencies (function level) - more expensive
  if (opts.detectFunctionCircular) {
    warnings.push(...detectFunctionCircularDependencies(scanResult.nodes, now));
  }

  // Orphaned code
  if (opts.detectOrphaned) {
    warnings.push(...detectOrphanedCode(scanResult.nodes, now));
  }

  // Unused exports
  if (opts.detectUnusedExports) {
    warnings.push(...detectUnusedExports(scanResult.nodes, now));
  }

  // Large files
  if (opts.detectLargeFiles) {
    warnings.push(...detectLargeFiles(scanResult.nodes, opts.largeFileThreshold, now));
  }

  return warnings;
}

/**
 * Detect circular dependencies at file level (import cycles)
 */
function detectFileCircularDependencies(nodes: NodeMap, detectedAt: string): Warning[] {
  const warnings: Warning[] = [];
  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Build adjacency list from imports
  const graph = new Map<string, Set<string>>();

  for (const file of fileNodes) {
    const deps = new Set<string>();
    for (const imp of file.imports) {
      // Resolve import source to file ID
      const targetId = resolveImportToFileId(imp.source, file.filePath, nodes);
      if (targetId) {
        deps.add(targetId);
      }
    }
    graph.set(file.id, deps);
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
    });
  }

  return warnings;
}

/**
 * Detect circular dependencies at function level (call cycles)
 */
function detectFunctionCircularDependencies(_nodes: NodeMap, _detectedAt: string): Warning[] {
  // This is a placeholder - function-level circular detection requires
  // analyzing function call graphs which we don't have yet
  // Would need to parse function bodies for call expressions

  // For now, return empty - this can be implemented when we have call graph data
  return [];
}

/**
 * Detect orphaned code (functions not called by anything)
 */
function detectOrphanedCode(nodes: NodeMap, detectedAt: string): Warning[] {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );
  const functionNodes = Object.values(nodes).filter(
    (n): n is FunctionNode => n.type === NodeType.Function
  );

  // Build set of all exported function names
  const exportedNames = new Set<string>();
  for (const file of fileNodes) {
    for (const exp of file.exports) {
      exportedNames.add(exp.name);
    }
  }

  // Build set of all imported names
  const importedNames = new Set<string>();
  for (const file of fileNodes) {
    for (const imp of file.imports) {
      for (const item of imp.items) {
        importedNames.add(item.name);
        if (item.alias) {
          importedNames.add(item.alias);
        }
      }
    }
  }

  // Find functions that are not exported and not commonly named entry points
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
    // Skip if exported
    if (func.isExported) continue;

    // Skip if it's a class method
    if (func.parentClassId) continue;

    // Skip if it matches entry point patterns
    const isEntryPoint = entryPointPatterns.some((p) => p.test(func.name));
    if (isEntryPoint) continue;

    // Skip common utility patterns
    if (func.name.startsWith('_')) continue; // Private by convention

    // Check if this function name is used anywhere (crude heuristic)
    // A proper implementation would trace actual call sites
    const isLikelyUsed = importedNames.has(func.name) || exportedNames.has(func.name);
    if (isLikelyUsed) continue;

    // This function might be orphaned
    warnings.push({
      id: uuidv4(),
      category: WarningCategory.OrphanedCode,
      level: WarningLevel.Info,
      title: `Potentially unused function: ${func.name}`,
      description: `The function "${func.name}" in ${func.filePath} is not exported and may not be called from anywhere. Consider removing it if unused, or export it if needed elsewhere.`,
      affectedNodes: [func.id],
      suggestion: {
        summary: 'Remove if unused, or export if needed',
        reasoning: 'Dead code increases maintenance burden and can confuse developers. If the function is needed, consider exporting it.',
        codeExample: `export function ${func.name}(...) { ... }`,
        autoFixable: false,
      },
      detectedAt,
    });
  }

  return warnings;
}

/**
 * Detect exports that aren't imported anywhere in the project
 */
function detectUnusedExports(nodes: NodeMap, detectedAt: string): Warning[] {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Collect all imports across the project
  const allImportedNames = new Map<string, Set<string>>(); // source -> imported names

  for (const file of fileNodes) {
    for (const imp of file.imports) {
      // Normalize import source
      const source = normalizeImportSource(imp.source, file.filePath);
      if (!allImportedNames.has(source)) {
        allImportedNames.set(source, new Set());
      }
      const names = allImportedNames.get(source)!;
      for (const item of imp.items) {
        if (item.isNamespace) {
          // Namespace import uses everything
          names.add('*');
        } else if (item.isDefault) {
          names.add('default');
        } else {
          names.add(item.name);
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
 * Resolve an import source to a file ID
 */
function resolveImportToFileId(
  source: string,
  currentFilePath: string,
  nodes: NodeMap
): string | null {
  // Skip external packages
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return null;
  }

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Normalize the import path
  const normalizedSource = normalizeImportSource(source, currentFilePath);

  // Try to find matching file
  for (const file of fileNodes) {
    const normalizedFile = normalizeFilePath(file.filePath);
    if (normalizedFile === normalizedSource) {
      return file.id;
    }
  }

  return null;
}

/**
 * Normalize an import source relative to the importing file
 */
function normalizeImportSource(source: string, importingFilePath: string): string {
  if (!source.startsWith('.')) {
    return source;
  }

  // Get directory of importing file
  const dir = importingFilePath.includes('/')
    ? importingFilePath.substring(0, importingFilePath.lastIndexOf('/'))
    : '';

  // Resolve relative path
  const parts = (dir ? dir + '/' + source : source).split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

/**
 * Normalize a file path for comparison
 */
function normalizeFilePath(filePath: string): string {
  // Remove extension
  return filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
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
