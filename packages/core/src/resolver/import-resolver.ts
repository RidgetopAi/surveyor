/**
 * Shared import resolution utilities
 *
 * Canonical module for path alias resolution, import path normalization,
 * and file ID lookup. Used by warning detector, connection builder,
 * non-TS scanner, and test scanner.
 *
 * Previously duplicated across 3 files — consolidated here.
 */

import type { NodeMap, FileNode } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import type { PathAliases } from '../types/analyzer.types.js';

/**
 * Resolve a path alias to its actual path
 * e.g., "@/components/Foo" with paths {"@/*": ["./src/*"]} -> "src/components/Foo"
 */
export function resolvePathAlias(source: string, pathAliases: PathAliases): string {
  for (const [alias, targets] of Object.entries(pathAliases)) {
    // Convert alias pattern to regex (e.g., "@/*" -> /^@\/(.*)$/)
    const aliasPattern = alias
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\\\*/g, '(.*)');  // Convert * to capture group

    const regex = new RegExp(`^${aliasPattern}$`);
    const match = source.match(regex);

    if (match && targets.length > 0) {
      const target = targets[0]!;
      let resolved = target;
      if (match[1] !== undefined) {
        resolved = target.replace('*', match[1]);
      }
      // Remove leading ./ if present
      return resolved.replace(/^\.\//, '');
    }
  }

  return source;
}

/**
 * Normalize an import source relative to the importing file
 * Resolves relative paths (./ and ../) against the importing file's directory
 */
export function normalizeImportSource(source: string, importingFilePath: string): string {
  if (!source.startsWith('.')) {
    // Not a relative import - return as-is (already resolved by alias or absolute)
    return source.replace(/\.(ts|tsx|js|jsx)$/, '');
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

  return resolved.join('/').replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Normalize a file path for comparison (strips extension)
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Get both the full path and directory path for index files
 * Returns [normalPath, directoryPath] where directoryPath is null for non-index files
 *
 * Example: "src/components/ui/index.ts" -> ["src/components/ui/index", "src/components/ui"]
 */
export function getNormalizedPaths(filePath: string): [string, string | null] {
  const normalized = normalizeFilePath(filePath);

  if (normalized.endsWith('/index')) {
    return [normalized, normalized.slice(0, -6)]; // Remove '/index'
  }

  return [normalized, null];
}

/**
 * Build a lookup index mapping multiple path forms to file node IDs.
 *
 * For each file, indexes:
 * - Full relative path (e.g., "src/utils.ts")
 * - Path without extension (e.g., "src/utils")
 * - Directory path for index files (e.g., "src/components" for "src/components/index.ts")
 *
 * Returns a Map for O(1) lookups instead of O(N) iteration per import.
 */
export function buildFilePathIndex(fileNodes: FileNode[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const file of fileNodes) {
    // Index by full path
    index.set(file.filePath, file.id);

    // Index without extension
    const withoutExt = normalizeFilePath(file.filePath);
    index.set(withoutExt, file.id);

    // Index as directory for index files
    const basename = file.filePath.split('/').pop() || '';
    if (/^index\.(ts|tsx|js|jsx)$/.test(basename)) {
      const dirPath = file.filePath.replace(/\/index\.(ts|tsx|js|jsx)$/, '');
      index.set(dirPath, file.id);
    }
  }

  return index;
}

/**
 * Resolve an import source to a file node ID
 *
 * Handles: path aliases, relative paths, extension resolution, index.ts resolution.
 * Uses buildFilePathIndex for O(1) lookups when index is pre-built,
 * or falls back to linear scan when called with raw NodeMap.
 */
export function resolveImportToFileId(
  source: string,
  currentFilePath: string,
  nodes: NodeMap,
  pathAliases: PathAliases,
  fileIndex?: Map<string, string>
): string | null {
  // First try to resolve path alias
  const resolvedSource = resolvePathAlias(source, pathAliases);

  // Skip external packages (those that don't start with . or / and weren't resolved by alias)
  if (!resolvedSource.startsWith('.') && !resolvedSource.startsWith('/') && resolvedSource === source) {
    return null;
  }

  // Normalize the import path
  const normalizedSource = normalizeImportSource(resolvedSource, currentFilePath);

  // If we have a pre-built index, use it for O(1) lookup
  if (fileIndex) {
    return (
      fileIndex.get(normalizedSource) ||
      fileIndex.get(normalizedSource + '.ts') ||
      fileIndex.get(normalizedSource + '.tsx') ||
      fileIndex.get(normalizedSource + '.js') ||
      fileIndex.get(normalizedSource + '.jsx') ||
      fileIndex.get(normalizedSource + '/index') ||
      null
    );
  }

  // Fallback: linear scan through file nodes
  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  for (const file of fileNodes) {
    const normalizedFile = normalizeFilePath(file.filePath);
    if (normalizedFile === normalizedSource) {
      return file.id;
    }
  }

  return null;
}

/**
 * Extract FileNode entries from a NodeMap
 */
export function getFileNodes(nodes: NodeMap): FileNode[] {
  return Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );
}
