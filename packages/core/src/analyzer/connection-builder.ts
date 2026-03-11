/**
 * Connection builder - creates the dependency graph from parsed nodes
 *
 * Builds three types of connections:
 * 1. Import connections (file → file) - resolved through path aliases
 * 2. FunctionCall connections (function → function) - scope-aware resolution
 * 3. Inheritance connections (class → class) - extends/implements resolution
 *
 * This replaces the ad-hoc string-name matching that caused false positives
 * in orphan detection and incomplete edge rendering in the UI.
 */

import type { NodeMap, FileNode, FunctionNode, ClassNode } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import type { Connection } from '../types/connection.types.js';
import { ConnectionType } from '../types/connection.types.js';
import type { PathAliases } from '../types/analyzer.types.js';
import {
  resolvePathAlias,
  normalizeImportSource,
  buildFilePathIndex,
  getFileNodes,
} from '../resolver/import-resolver.js';

/**
 * Build all connections from parsed nodes
 *
 * Should be called after parsing is complete and all nodes are in the NodeMap.
 * Uses the shared import resolver for accurate path resolution.
 */
export function buildConnections(nodes: NodeMap, pathAliases: PathAliases): Connection[] {
  const connections: Connection[] = [];
  const seen = new Set<string>(); // Dedup by connection key

  const fileNodes = getFileNodes(nodes);
  const fileIndex = buildFilePathIndex(fileNodes);

  // Build helper indexes
  const functionsByFile = buildFunctionsByFileIndex(nodes);
  const classesByFile = buildClassesByFileIndex(nodes);

  // 1. Import connections (file → file)
  connections.push(
    ...buildImportConnections(fileNodes, fileIndex, pathAliases, seen)
  );

  // 2. FunctionCall connections (function → function)
  connections.push(
    ...buildFunctionCallConnections(nodes, fileNodes, fileIndex, functionsByFile, pathAliases, seen)
  );

  // 3. Inheritance connections (class → class)
  connections.push(
    ...buildInheritanceConnections(nodes, fileNodes, fileIndex, classesByFile, pathAliases, seen)
  );

  return connections;
}

/**
 * Build import connections between files
 */
function buildImportConnections(
  fileNodes: FileNode[],
  fileIndex: Map<string, string>,
  pathAliases: PathAliases,
  seen: Set<string>
): Connection[] {
  const connections: Connection[] = [];

  for (const file of fileNodes) {
    for (const imp of file.imports) {
      // Skip type-only imports — they don't create runtime dependencies
      if (imp.isTypeOnly) continue;

      // Resolve import to target file ID
      const resolvedSource = resolvePathAlias(imp.source, pathAliases);

      // Skip external packages
      if (!resolvedSource.startsWith('.') && !resolvedSource.startsWith('/') && resolvedSource === imp.source) {
        continue;
      }

      const normalizedSource = normalizeImportSource(resolvedSource, file.filePath);

      // Try to find the file in our index
      const targetId =
        fileIndex.get(normalizedSource) ||
        fileIndex.get(normalizedSource + '.ts') ||
        fileIndex.get(normalizedSource + '.tsx') ||
        fileIndex.get(normalizedSource + '.js') ||
        fileIndex.get(normalizedSource + '.jsx') ||
        fileIndex.get(normalizedSource + '/index') ||
        null;

      if (!targetId) continue;

      // Skip self-imports
      if (targetId === file.id) continue;

      const connKey = `${ConnectionType.Import}:${file.id}:${targetId}`;
      if (seen.has(connKey)) continue;
      seen.add(connKey);

      // Weight = number of imported items (higher = stronger dependency)
      const weight = imp.items.length || 1;

      connections.push({
        id: `conn:${connKey}`,
        sourceId: file.id,
        targetId,
        type: ConnectionType.Import,
        weight,
        metadata: {
          isCircular: false, // Detected separately by warning detector
          callCount: weight,
          locations: [],
        },
      });
    }
  }

  return connections;
}

/**
 * Build function call connections by resolving references through scope
 *
 * For each function's references[], resolves each name through:
 * 1. Sibling functions in the same file (local calls)
 * 2. Imported names → source file → matching exported function (cross-file calls)
 */
function buildFunctionCallConnections(
  nodes: NodeMap,
  fileNodes: FileNode[],
  fileIndex: Map<string, string>,
  functionsByFile: Map<string, FunctionNode[]>,
  pathAliases: PathAliases,
  seen: Set<string>
): Connection[] {
  const connections: Connection[] = [];

  const functionNodes = Object.values(nodes).filter(
    (n): n is FunctionNode => n.type === NodeType.Function
  );

  // Build lookup: for each file, what names are imported and from where
  const importScopeByFile = buildImportScopeIndex(fileNodes, fileIndex, pathAliases);

  // Build lookup: for each file, what function names are locally defined
  const localFunctionsByName = new Map<string, Map<string, FunctionNode>>();
  for (const [fileId, funcs] of functionsByFile) {
    const nameMap = new Map<string, FunctionNode>();
    for (const func of funcs) {
      // Don't overwrite — first definition wins (prevents shadowing confusion)
      if (!nameMap.has(func.name)) {
        nameMap.set(func.name, func);
      }
    }
    localFunctionsByName.set(fileId, nameMap);
  }

  // Build lookup: for each file, what functions are exported by name
  const exportedFunctionsByFile = buildExportedFunctionsIndex(fileNodes, functionsByFile);

  for (const func of functionNodes) {
    if (!func.references || func.references.length === 0) continue;

    const localFuncs = localFunctionsByName.get(func.parentFileId) || new Map();
    const importScope = importScopeByFile.get(func.parentFileId) || new Map();

    for (const refName of func.references) {
      let targetFuncId: string | null = null;

      // 1. Check local functions in the same file
      const localFunc = localFuncs.get(refName);
      if (localFunc && localFunc.id !== func.id) {
        targetFuncId = localFunc.id;
      }

      // 2. Check imported names → resolve to function in source file
      if (!targetFuncId) {
        const importInfo = importScope.get(refName);
        if (importInfo) {
          const targetFileId = importInfo.fileId;
          const exportedFuncs = exportedFunctionsByFile.get(targetFileId);
          if (exportedFuncs) {
            // If it was a default import, look for the default export function
            const lookupName = importInfo.isDefault ? importInfo.originalName : refName;
            const targetFunc = exportedFuncs.get(lookupName);
            if (targetFunc) {
              targetFuncId = targetFunc.id;
            }
          }
        }
      }

      if (!targetFuncId) continue;

      const connKey = `${ConnectionType.FunctionCall}:${func.id}:${targetFuncId}`;
      if (seen.has(connKey)) {
        // Increment weight on existing connection
        const existing = connections.find(c => c.id === `conn:${connKey}`);
        if (existing) {
          existing.weight++;
          existing.metadata.callCount++;
        }
        continue;
      }
      seen.add(connKey);

      connections.push({
        id: `conn:${connKey}`,
        sourceId: func.id,
        targetId: targetFuncId,
        type: ConnectionType.FunctionCall,
        weight: 1,
        metadata: {
          isCircular: false,
          callCount: 1,
          locations: [{
            filePath: func.filePath,
            line: func.line,
            column: 0,
          }],
        },
      });
    }
  }

  return connections;
}

/**
 * Build inheritance connections for classes
 */
function buildInheritanceConnections(
  nodes: NodeMap,
  fileNodes: FileNode[],
  fileIndex: Map<string, string>,
  classesByFile: Map<string, ClassNode[]>,
  pathAliases: PathAliases,
  seen: Set<string>
): Connection[] {
  const connections: Connection[] = [];

  const classNodes = Object.values(nodes).filter(
    (n): n is ClassNode => n.type === NodeType.Class
  );

  // Build import scope for resolving parent class names
  const importScopeByFile = buildImportScopeIndex(fileNodes, fileIndex, pathAliases);

  // Build exported classes index
  const exportedClassesByFile = buildExportedClassesIndex(fileNodes, classesByFile);

  for (const cls of classNodes) {
    const parentNames: Array<{ name: string; type: ConnectionType }> = [];

    if (cls.extends) {
      parentNames.push({ name: cls.extends, type: ConnectionType.Inheritance });
    }
    for (const impl of cls.implements) {
      parentNames.push({ name: impl, type: ConnectionType.Implementation });
    }

    if (parentNames.length === 0) continue;

    const importScope = importScopeByFile.get(cls.parentFileId) || new Map();
    const localClasses = new Map<string, ClassNode>();
    for (const c of (classesByFile.get(cls.parentFileId) || [])) {
      localClasses.set(c.name, c);
    }

    for (const { name, type } of parentNames) {
      let targetClassId: string | null = null;

      // Check local classes
      const localClass = localClasses.get(name);
      if (localClass && localClass.id !== cls.id) {
        targetClassId = localClass.id;
      }

      // Check imported classes
      if (!targetClassId) {
        const importInfo = importScope.get(name);
        if (importInfo) {
          const exportedClasses = exportedClassesByFile.get(importInfo.fileId);
          if (exportedClasses) {
            const lookupName = importInfo.isDefault ? importInfo.originalName : name;
            const targetClass = exportedClasses.get(lookupName);
            if (targetClass) {
              targetClassId = targetClass.id;
            }
          }
        }
      }

      if (!targetClassId) continue;

      const connKey = `${type}:${cls.id}:${targetClassId}`;
      if (seen.has(connKey)) continue;
      seen.add(connKey);

      connections.push({
        id: `conn:${connKey}`,
        sourceId: cls.id,
        targetId: targetClassId,
        type,
        weight: 1,
        metadata: {
          isCircular: false,
          callCount: 1,
          locations: [{
            filePath: cls.filePath,
            line: cls.line,
            column: 0,
          }],
        },
      });
    }
  }

  return connections;
}

// --- Helper indexes ---

interface ImportedNameInfo {
  fileId: string;       // Target file node ID
  originalName: string; // Name as exported by source (for default imports)
  isDefault: boolean;   // Was this a default import?
}

/**
 * Build import scope index for each file
 * Maps: fileId -> Map<localName, ImportedNameInfo>
 *
 * For `import { foo } from './utils'` → maps "foo" to { fileId: "file:src/utils.ts", originalName: "foo" }
 * For `import Bar from './bar'` → maps "Bar" to { fileId: "file:src/bar.ts", originalName: "Bar", isDefault: true }
 */
function buildImportScopeIndex(
  fileNodes: FileNode[],
  fileIndex: Map<string, string>,
  pathAliases: PathAliases
): Map<string, Map<string, ImportedNameInfo>> {
  const scopeByFile = new Map<string, Map<string, ImportedNameInfo>>();

  for (const file of fileNodes) {
    const scope = new Map<string, ImportedNameInfo>();

    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;

      const resolvedSource = resolvePathAlias(imp.source, pathAliases);

      // Skip external packages
      if (!resolvedSource.startsWith('.') && !resolvedSource.startsWith('/') && resolvedSource === imp.source) {
        continue;
      }

      const normalizedSource = normalizeImportSource(resolvedSource, file.filePath);

      const targetFileId =
        fileIndex.get(normalizedSource) ||
        fileIndex.get(normalizedSource + '.ts') ||
        fileIndex.get(normalizedSource + '.tsx') ||
        fileIndex.get(normalizedSource + '.js') ||
        fileIndex.get(normalizedSource + '.jsx') ||
        fileIndex.get(normalizedSource + '/index') ||
        null;

      if (!targetFileId) continue;

      for (const item of imp.items) {
        if (item.isNamespace) {
          // Namespace import — can't resolve individual names, skip
          continue;
        }

        const localName = item.alias || item.name;
        scope.set(localName, {
          fileId: targetFileId,
          originalName: item.name,
          isDefault: item.isDefault,
        });
      }
    }

    scopeByFile.set(file.id, scope);
  }

  return scopeByFile;
}

/**
 * Build index of functions grouped by parent file ID
 */
function buildFunctionsByFileIndex(nodes: NodeMap): Map<string, FunctionNode[]> {
  const index = new Map<string, FunctionNode[]>();

  for (const node of Object.values(nodes)) {
    if (node.type !== NodeType.Function) continue;
    const func = node as FunctionNode;

    const existing = index.get(func.parentFileId) || [];
    existing.push(func);
    index.set(func.parentFileId, existing);
  }

  return index;
}

/**
 * Build index of classes grouped by parent file ID
 */
function buildClassesByFileIndex(nodes: NodeMap): Map<string, ClassNode[]> {
  const index = new Map<string, ClassNode[]>();

  for (const node of Object.values(nodes)) {
    if (node.type !== NodeType.Class) continue;
    const cls = node as ClassNode;

    const existing = index.get(cls.parentFileId) || [];
    existing.push(cls);
    index.set(cls.parentFileId, existing);
  }

  return index;
}

/**
 * Build index of exported functions for each file
 * Maps: fileId -> Map<exportName, FunctionNode>
 */
function buildExportedFunctionsIndex(
  fileNodes: FileNode[],
  functionsByFile: Map<string, FunctionNode[]>
): Map<string, Map<string, FunctionNode>> {
  const index = new Map<string, Map<string, FunctionNode>>();

  for (const file of fileNodes) {
    const funcs = functionsByFile.get(file.id) || [];
    const exportedFuncs = new Map<string, FunctionNode>();

    for (const func of funcs) {
      if (func.isExported) {
        exportedFuncs.set(func.name, func);
      }
    }

    // Also map default exports
    for (const exp of file.exports) {
      if (exp.isDefault && exp.kind === 'function') {
        const func = funcs.find(f => f.name === exp.name);
        if (func) {
          exportedFuncs.set(exp.name, func);
        }
      }
    }

    if (exportedFuncs.size > 0) {
      index.set(file.id, exportedFuncs);
    }
  }

  return index;
}

/**
 * Build index of exported classes for each file
 * Maps: fileId -> Map<exportName, ClassNode>
 */
function buildExportedClassesIndex(
  fileNodes: FileNode[],
  classesByFile: Map<string, ClassNode[]>
): Map<string, Map<string, ClassNode>> {
  const index = new Map<string, Map<string, ClassNode>>();

  for (const file of fileNodes) {
    const classes = classesByFile.get(file.id) || [];
    const exportedClasses = new Map<string, ClassNode>();

    for (const cls of classes) {
      if (cls.isExported) {
        exportedClasses.set(cls.name, cls);
      }
    }

    if (exportedClasses.size > 0) {
      index.set(file.id, exportedClasses);
    }
  }

  return index;
}
