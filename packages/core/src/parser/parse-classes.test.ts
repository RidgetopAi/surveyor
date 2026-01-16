/**
 * Unit tests for parse-classes.ts
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseClasses } from './parse-classes.js';

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile('test.ts', code);
}

const FILE_ID = 'file:test.ts';
const FILE_PATH = 'test.ts';

describe('parseClasses', () => {
  it('should parse basic class declaration', () => {
    const sourceFile = createSourceFile(`
      class MyClass {
        foo() {}
      }
    `);

    const { classes, classIds } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classes).toHaveLength(1);
    expect(classIds).toHaveLength(1);

    const cls = classes[0];
    expect(cls.name).toBe('MyClass');
    expect(cls.type).toBe('class');
    expect(cls.parentFileId).toBe(FILE_ID);
    expect(cls.isExported).toBe(false);
    expect(cls.extends).toBeNull();
    expect(cls.implements).toHaveLength(0);
  });

  it('should detect exported classes', () => {
    const sourceFile = createSourceFile(`
      export class PublicClass {}
      class PrivateClass {}
    `);

    const { classes } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classes).toHaveLength(2);
    const publicCls = classes.find(c => c.name === 'PublicClass');
    const privateCls = classes.find(c => c.name === 'PrivateClass');

    expect(publicCls?.isExported).toBe(true);
    expect(privateCls?.isExported).toBe(false);
  });

  it('should parse class methods', () => {
    const sourceFile = createSourceFile(`
      class Calculator {
        add(a: number, b: number): number {
          return a + b;
        }

        subtract(a: number, b: number): number {
          return a - b;
        }
      }
    `);

    const { classes, methods } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classes[0].methods).toHaveLength(2);
    expect(methods).toHaveLength(2);

    const addMethod = methods.find(m => m.name === 'add');
    expect(addMethod?.params).toHaveLength(2);
    expect(addMethod?.returnType).toBe('number');
    expect(addMethod?.parentClassId).toBe(classes[0].id);
  });

  it('should parse async methods', () => {
    const sourceFile = createSourceFile(`
      class Api {
        async fetchData(): Promise<string> {
          return 'data';
        }
      }
    `);

    const { methods } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(methods[0].isAsync).toBe(true);
  });

  it('should parse class properties', () => {
    const sourceFile = createSourceFile(`
      class User {
        public name: string;
        private id: number;
        protected email: string;
        readonly createdAt: Date;
        static count: number;
      }
    `);

    const { classes } = parseClasses(sourceFile, FILE_ID, FILE_PATH);
    const properties = classes[0].properties;

    expect(properties).toHaveLength(5);

    const nameProp = properties.find(p => p.name === 'name');
    expect(nameProp?.visibility).toBe('public');
    expect(nameProp?.isStatic).toBe(false);
    expect(nameProp?.isReadonly).toBe(false);

    const idProp = properties.find(p => p.name === 'id');
    expect(idProp?.visibility).toBe('private');

    const emailProp = properties.find(p => p.name === 'email');
    expect(emailProp?.visibility).toBe('protected');

    const createdAtProp = properties.find(p => p.name === 'createdAt');
    expect(createdAtProp?.isReadonly).toBe(true);

    const countProp = properties.find(p => p.name === 'count');
    expect(countProp?.isStatic).toBe(true);
  });

  it('should parse class inheritance', () => {
    const sourceFile = createSourceFile(`
      class Animal {}
      class Dog extends Animal {}
    `);

    const { classes } = parseClasses(sourceFile, FILE_ID, FILE_PATH);
    const dog = classes.find(c => c.name === 'Dog');

    expect(dog?.extends).toBe('Animal');
  });

  it('should parse interface implementations', () => {
    const sourceFile = createSourceFile(`
      interface Runnable {
        run(): void;
      }
      interface Stoppable {
        stop(): void;
      }
      class Task implements Runnable, Stoppable {
        run() {}
        stop() {}
      }
    `);

    const { classes } = parseClasses(sourceFile, FILE_ID, FILE_PATH);
    const task = classes.find(c => c.name === 'Task');

    expect(task?.implements).toContain('Runnable');
    expect(task?.implements).toContain('Stoppable');
  });

  it('should capture line numbers', () => {
    const sourceFile = createSourceFile(`class Foo {
  bar() {}
}

class Baz {
  qux() {}
}`);

    const { classes } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classes[0].name).toBe('Foo');
    expect(classes[0].line).toBe(1);
    expect(classes[0].endLine).toBe(3);

    expect(classes[1].name).toBe('Baz');
    expect(classes[1].line).toBe(5);
  });

  it('should generate unique IDs', () => {
    const sourceFile = createSourceFile(`
      class A {}
      class B {}
    `);

    const { classes, classIds } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classIds[0]).not.toBe(classIds[1]);
    expect(classes[0].id).toBe(classIds[0]);
    expect(classes[1].id).toBe(classIds[1]);
  });

  it('should link methods to parent class', () => {
    const sourceFile = createSourceFile(`
      class MyClass {
        myMethod() {}
      }
    `);

    const { classes, methods } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(methods[0].parentClassId).toBe(classes[0].id);
    expect(methods[0].parentFileId).toBe(FILE_ID);
  });

  it('should return empty arrays for files with no classes', () => {
    const sourceFile = createSourceFile(`
      function foo() {}
      const x = 1;
    `);

    const { classes, classIds, methods } = parseClasses(sourceFile, FILE_ID, FILE_PATH);

    expect(classes).toHaveLength(0);
    expect(classIds).toHaveLength(0);
    expect(methods).toHaveLength(0);
  });
});
