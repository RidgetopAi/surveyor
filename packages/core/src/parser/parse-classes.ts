/**
 * Parse classes from a TypeScript source file
 *
 * Extracts:
 * - Class name, line numbers
 * - Methods (as FunctionNode references)
 * - Properties
 * - Inheritance (extends, implements)
 * - Export status
 */

import { SourceFile, ClassDeclaration, Scope } from 'ts-morph';
import type { ClassNode, FunctionNode, PropertyInfo, ParameterInfo } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';

export interface ParseClassesResult {
  classes: ClassNode[];
  classIds: string[];
  methods: FunctionNode[];
}

/**
 * Generate a unique ID for a class
 */
function generateClassId(fileId: string, name: string, line: number): string {
  return `${fileId}:class:${name}:${line}`;
}

/**
 * Generate a unique ID for a method
 */
function generateMethodId(classId: string, name: string, line: number): string {
  return `${classId}:method:${name}:${line}`;
}

/**
 * Map ts-morph Scope to visibility string
 */
function getVisibility(scope: Scope | undefined): PropertyInfo['visibility'] {
  switch (scope) {
    case Scope.Private:
      return 'private';
    case Scope.Protected:
      return 'protected';
    default:
      return 'public';
  }
}

/**
 * Parse class properties
 */
function parseProperties(classDecl: ClassDeclaration): PropertyInfo[] {
  const properties: PropertyInfo[] = [];

  for (const prop of classDecl.getProperties()) {
    properties.push({
      name: prop.getName(),
      type: prop.getType().getText() || null,
      visibility: getVisibility(prop.getScope()),
      isStatic: prop.isStatic(),
      isReadonly: prop.isReadonly(),
    });
  }

  return properties;
}

/**
 * Parse class methods into FunctionNodes
 */
function parseMethods(
  classDecl: ClassDeclaration,
  classId: string,
  fileId: string,
  filePath: string
): { methods: FunctionNode[]; methodIds: string[] } {
  const methods: FunctionNode[] = [];
  const methodIds: string[] = [];

  for (const method of classDecl.getMethods()) {
    const name = method.getName();
    const line = method.getStartLineNumber();
    const id = generateMethodId(classId, name, line);

    const params: ParameterInfo[] = method.getParameters().map(param => ({
      name: param.getName(),
      type: param.getType().getText() || null,
      isOptional: param.isOptional(),
      defaultValue: param.getInitializer()?.getText() || null,
    }));

    const node: FunctionNode = {
      id,
      type: NodeType.Function,
      name,
      filePath,
      line,
      endLine: method.getEndLineNumber(),
      parentFileId: fileId,
      parentClassId: classId,
      params,
      returnType: method.getReturnType().getText() || null,
      isExported: false, // Methods aren't directly exported
      isAsync: method.isAsync(),
      behavioral: null, // Phase 4
    };

    methods.push(node);
    methodIds.push(id);
  }

  return { methods, methodIds };
}

/**
 * Parse all class declarations from a source file
 */
export function parseClasses(
  sourceFile: SourceFile,
  fileId: string,
  filePath: string
): ParseClassesResult {
  const classes: ClassNode[] = [];
  const classIds: string[] = [];
  const allMethods: FunctionNode[] = [];

  const classDeclarations = sourceFile.getClasses();

  for (const classDecl of classDeclarations) {
    const name = classDecl.getName() || 'anonymous';
    const line = classDecl.getStartLineNumber();
    const id = generateClassId(fileId, name, line);

    // Parse methods
    const { methods, methodIds } = parseMethods(classDecl, id, fileId, filePath);
    allMethods.push(...methods);

    // Parse properties
    const properties = parseProperties(classDecl);

    // Get inheritance info
    const extendsClause = classDecl.getExtends();
    const implementsClauses = classDecl.getImplements();

    const node: ClassNode = {
      id,
      type: NodeType.Class,
      name,
      filePath,
      line,
      endLine: classDecl.getEndLineNumber(),
      parentFileId: fileId,
      methods: methodIds,
      properties,
      isExported: classDecl.isExported(),
      extends: extendsClause ? extendsClause.getText() : null,
      implements: implementsClauses.map(impl => impl.getText()),
    };

    classes.push(node);
    classIds.push(id);
  }

  return { classes, classIds, methods: allMethods };
}
