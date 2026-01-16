/**
 * Unit tests for parse-functions.ts
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseFunctions } from './parse-functions.js';

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile('test.ts', code);
}

const FILE_ID = 'file:test.ts';
const FILE_PATH = 'test.ts';

describe('parseFunctions', () => {
  it('should parse basic function declaration', () => {
    const sourceFile = createSourceFile(`
      function greet(name: string): string {
        return 'Hello ' + name;
      }
    `);

    const { functions, functionIds } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions).toHaveLength(1);
    expect(functionIds).toHaveLength(1);

    const fn = functions[0];
    expect(fn.name).toBe('greet');
    expect(fn.type).toBe('function');
    expect(fn.parentFileId).toBe(FILE_ID);
    expect(fn.parentClassId).toBeNull();
    expect(fn.isExported).toBe(false);
    expect(fn.isAsync).toBe(false);
    expect(fn.behavioral).toBeNull();
  });

  it('should parse function parameters', () => {
    const sourceFile = createSourceFile(`
      function add(a: number, b: number): number {
        return a + b;
      }
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].params).toHaveLength(2);
    expect(functions[0].params[0].name).toBe('a');
    expect(functions[0].params[0].type).toBe('number');
    expect(functions[0].params[0].isOptional).toBe(false);
    expect(functions[0].params[1].name).toBe('b');
  });

  it('should parse optional parameters', () => {
    const sourceFile = createSourceFile(`
      function greet(name: string, greeting?: string): string {
        return (greeting || 'Hello') + ' ' + name;
      }
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].params[0].isOptional).toBe(false);
    expect(functions[0].params[1].isOptional).toBe(true);
  });

  it('should parse default parameter values', () => {
    const sourceFile = createSourceFile(`
      function greet(name: string, greeting: string = 'Hello'): string {
        return greeting + ' ' + name;
      }
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].params[1].defaultValue).toBe("'Hello'");
  });

  it('should parse return type', () => {
    const sourceFile = createSourceFile(`
      function getData(): Promise<string[]> {
        return Promise.resolve([]);
      }
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].returnType).toBe('Promise<string[]>');
  });

  it('should detect exported functions', () => {
    const sourceFile = createSourceFile(`
      export function publicFn() {}
      function privateFn() {}
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions).toHaveLength(2);
    const publicFn = functions.find(f => f.name === 'publicFn');
    const privateFn = functions.find(f => f.name === 'privateFn');

    expect(publicFn?.isExported).toBe(true);
    expect(privateFn?.isExported).toBe(false);
  });

  it('should detect async functions', () => {
    const sourceFile = createSourceFile(`
      async function fetchData(): Promise<void> {
        await fetch('/api');
      }
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].isAsync).toBe(true);
  });

  it('should parse arrow functions assigned to variables', () => {
    const sourceFile = createSourceFile(`
      const add = (a: number, b: number): number => a + b;
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('add');
    expect(functions[0].params).toHaveLength(2);
  });

  it('should detect exported arrow functions', () => {
    const sourceFile = createSourceFile(`
      export const myFn = () => 42;
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions).toHaveLength(1);
    expect(functions[0].isExported).toBe(true);
  });

  it('should detect async arrow functions', () => {
    const sourceFile = createSourceFile(`
      const fetchData = async () => {
        await fetch('/api');
      };
    `);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].isAsync).toBe(true);
  });

  it('should capture line numbers', () => {
    const sourceFile = createSourceFile(`function foo() {
  return 1;
}

function bar() {
  return 2;
}`);

    const { functions } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions[0].name).toBe('foo');
    expect(functions[0].line).toBe(1);
    expect(functions[0].endLine).toBe(3);

    expect(functions[1].name).toBe('bar');
    expect(functions[1].line).toBe(5);
    expect(functions[1].endLine).toBe(7);
  });

  it('should generate unique IDs', () => {
    const sourceFile = createSourceFile(`
      function fn1() {}
      function fn2() {}
    `);

    const { functions, functionIds } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functionIds[0]).not.toBe(functionIds[1]);
    expect(functions[0].id).toBe(functionIds[0]);
    expect(functions[1].id).toBe(functionIds[1]);
  });

  it('should return empty arrays for files with no functions', () => {
    const sourceFile = createSourceFile(`
      const x = 1;
      interface Foo {}
    `);

    const { functions, functionIds } = parseFunctions(sourceFile, FILE_ID, FILE_PATH);

    expect(functions).toHaveLength(0);
    expect(functionIds).toHaveLength(0);
  });
});
