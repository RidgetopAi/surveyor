/**
 * Unit tests for parse-imports.ts
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseImports } from './parse-imports.js';

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile('test.ts', code);
}

describe('parseImports', () => {
  it('should parse named imports', () => {
    const sourceFile = createSourceFile(`
      import { foo, bar } from './module';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./module');
    expect(imports[0].isTypeOnly).toBe(false);
    expect(imports[0].items).toHaveLength(2);
    expect(imports[0].items[0]).toEqual({
      name: 'foo',
      alias: null,
      isDefault: false,
      isNamespace: false,
    });
    expect(imports[0].items[1]).toEqual({
      name: 'bar',
      alias: null,
      isDefault: false,
      isNamespace: false,
    });
  });

  it('should parse default imports', () => {
    const sourceFile = createSourceFile(`
      import MyModule from './module';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./module');
    expect(imports[0].items).toHaveLength(1);
    expect(imports[0].items[0]).toEqual({
      name: 'MyModule',
      alias: null,
      isDefault: true,
      isNamespace: false,
    });
  });

  it('should parse namespace imports', () => {
    const sourceFile = createSourceFile(`
      import * as Utils from './utils';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./utils');
    expect(imports[0].items).toHaveLength(1);
    expect(imports[0].items[0]).toEqual({
      name: 'Utils',
      alias: null,
      isDefault: false,
      isNamespace: true,
    });
  });

  it('should parse aliased imports', () => {
    const sourceFile = createSourceFile(`
      import { foo as myFoo } from './module';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].items[0]).toEqual({
      name: 'foo',
      alias: 'myFoo',
      isDefault: false,
      isNamespace: false,
    });
  });

  it('should parse type-only imports', () => {
    const sourceFile = createSourceFile(`
      import type { User } from './types';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].isTypeOnly).toBe(true);
    expect(imports[0].items[0].name).toBe('User');
  });

  it('should parse mixed imports', () => {
    const sourceFile = createSourceFile(`
      import DefaultExport, { named1, named2 as alias2 } from './module';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(1);
    expect(imports[0].items).toHaveLength(3);

    // Default import
    expect(imports[0].items[0]).toEqual({
      name: 'DefaultExport',
      alias: null,
      isDefault: true,
      isNamespace: false,
    });

    // Named imports
    expect(imports[0].items[1]).toEqual({
      name: 'named1',
      alias: null,
      isDefault: false,
      isNamespace: false,
    });
    expect(imports[0].items[2]).toEqual({
      name: 'named2',
      alias: 'alias2',
      isDefault: false,
      isNamespace: false,
    });
  });

  it('should handle multiple import statements', () => {
    const sourceFile = createSourceFile(`
      import { a } from './a';
      import { b } from './b';
      import { c } from './c';
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(3);
    expect(imports[0].source).toBe('./a');
    expect(imports[1].source).toBe('./b');
    expect(imports[2].source).toBe('./c');
  });

  it('should return empty array for files with no imports', () => {
    const sourceFile = createSourceFile(`
      const x = 1;
      export { x };
    `);

    const imports = parseImports(sourceFile);

    expect(imports).toHaveLength(0);
  });
});
