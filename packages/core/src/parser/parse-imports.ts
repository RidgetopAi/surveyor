/**
 * Parse imports from a TypeScript source file
 *
 * Extracts:
 * - Import source path
 * - Named imports
 * - Default imports
 * - Namespace imports
 * - Type-only imports
 */

import { SourceFile } from 'ts-morph';
import type { ImportInfo, ImportItem } from '../types/node.types.js';

/**
 * Parse all import declarations from a source file
 */
export function parseImports(sourceFile: SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importDeclarations = sourceFile.getImportDeclarations();

  for (const importDecl of importDeclarations) {
    const source = importDecl.getModuleSpecifierValue();
    const isTypeOnly = importDecl.isTypeOnly();
    const items: ImportItem[] = [];

    // Default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      items.push({
        name: defaultImport.getText(),
        alias: null,
        isDefault: true,
        isNamespace: false,
      });
    }

    // Namespace import (import * as X)
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      items.push({
        name: namespaceImport.getText(),
        alias: null,
        isDefault: false,
        isNamespace: true,
      });
    }

    // Named imports
    const namedImports = importDecl.getNamedImports();
    for (const named of namedImports) {
      const name = named.getName();
      const aliasNode = named.getAliasNode();
      items.push({
        name,
        alias: aliasNode ? aliasNode.getText() : null,
        isDefault: false,
        isNamespace: false,
      });
    }

    imports.push({
      source,
      items,
      isTypeOnly,
    });
  }

  return imports;
}
