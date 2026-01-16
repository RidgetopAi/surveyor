/**
 * Unit tests for parse-exports.ts
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseExports } from './parse-exports.js';

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile('test.ts', code);
}

describe('parseExports', () => {
  it('should parse exported functions', () => {
    const sourceFile = createSourceFile(`
      export function myFunction() {
        return 42;
      }
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'myFunction',
      alias: null,
      isDefault: false,
      isTypeOnly: false,
      kind: 'function',
    });
  });

  it('should parse exported classes', () => {
    const sourceFile = createSourceFile(`
      export class MyClass {
        foo() {}
      }
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyClass',
      alias: null,
      isDefault: false,
      isTypeOnly: false,
      kind: 'class',
    });
  });

  it('should parse exported interfaces', () => {
    const sourceFile = createSourceFile(`
      export interface User {
        id: string;
        name: string;
      }
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'User',
      alias: null,
      isDefault: false,
      isTypeOnly: true,
      kind: 'interface',
    });
  });

  it('should parse exported type aliases', () => {
    const sourceFile = createSourceFile(`
      export type ID = string;
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'ID',
      alias: null,
      isDefault: false,
      isTypeOnly: true,
      kind: 'type',
    });
  });

  it('should parse exported enums', () => {
    const sourceFile = createSourceFile(`
      export enum Status {
        Active = 'active',
        Inactive = 'inactive',
      }
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'Status',
      alias: null,
      isDefault: false,
      isTypeOnly: false,
      kind: 'enum',
    });
  });

  it('should parse exported variables', () => {
    const sourceFile = createSourceFile(`
      export const MY_CONST = 42;
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0].name).toBe('MY_CONST');
    expect(exports[0].kind).toBe('variable');
  });

  it('should parse default exports', () => {
    const sourceFile = createSourceFile(`
      export default function main() {
        return 'hello';
      }
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0].isDefault).toBe(true);
    expect(exports[0].kind).toBe('function');
  });

  it('should parse re-exports', () => {
    const sourceFile = createSourceFile(`
      export { foo, bar } from './other';
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(2);
    expect(exports[0]).toEqual({
      name: 'foo',
      alias: null,
      isDefault: false,
      isTypeOnly: false,
      kind: 'reexport',
      source: './other',
    });
    expect(exports[1]).toEqual({
      name: 'bar',
      alias: null,
      isDefault: false,
      isTypeOnly: false,
      kind: 'reexport',
      source: './other',
    });
  });

  it('should parse re-exports with aliases', () => {
    const sourceFile = createSourceFile(`
      export { foo as myFoo } from './other';
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'foo',
      alias: 'myFoo',
      isDefault: false,
      isTypeOnly: false,
      kind: 'reexport',
      source: './other',
    });
  });

  it('should parse type re-exports', () => {
    const sourceFile = createSourceFile(`
      export type { User } from './types';
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(1);
    expect(exports[0].isTypeOnly).toBe(true);
    expect(exports[0].kind).toBe('reexport');
  });

  it('should handle multiple exports', () => {
    const sourceFile = createSourceFile(`
      export function fn1() {}
      export function fn2() {}
      export const x = 1;
      export interface Foo {}
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(4);
  });

  it('should return empty array for files with no exports', () => {
    const sourceFile = createSourceFile(`
      const internal = 42;
      function helper() {}
    `);

    const exports = parseExports(sourceFile);

    expect(exports).toHaveLength(0);
  });
});
