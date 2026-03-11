/**
 * Unit tests for import-resolver.ts
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePathAlias,
  normalizeImportSource,
  normalizeFilePath,
  getNormalizedPaths,
  buildFilePathIndex,
} from './import-resolver.js';
import type { FileNode } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';

// Helper to create a minimal FileNode for index tests
function makeFileNode(filePath: string, id?: string): FileNode {
  return {
    id: id || `file:${filePath}`,
    type: NodeType.File,
    name: filePath.split('/').pop() || filePath,
    filePath,
    line: 1,
    endLine: 10,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    topLevelReferences: [],
  };
}

describe('resolvePathAlias', () => {
  it('should resolve @/* alias to src/*', () => {
    const aliases = { '@/*': ['./src/*'] };
    expect(resolvePathAlias('@/components/Foo', aliases)).toBe('src/components/Foo');
  });

  it('should resolve @components/* alias', () => {
    const aliases = { '@components/*': ['./src/components/*'] };
    expect(resolvePathAlias('@components/Button', aliases)).toBe('src/components/Button');
  });

  it('should resolve exact alias without wildcard', () => {
    const aliases = { '@config': ['./src/config/index.ts'] };
    expect(resolvePathAlias('@config', aliases)).toBe('src/config/index.ts');
  });

  it('should return source unchanged when no alias matches', () => {
    const aliases = { '@/*': ['./src/*'] };
    expect(resolvePathAlias('./utils/helper', aliases)).toBe('./utils/helper');
  });

  it('should return source unchanged for external packages', () => {
    const aliases = { '@/*': ['./src/*'] };
    expect(resolvePathAlias('react', aliases)).toBe('react');
  });

  it('should handle empty aliases', () => {
    expect(resolvePathAlias('@/foo', {})).toBe('@/foo');
  });

  it('should use the first target when multiple targets exist', () => {
    const aliases = { '@/*': ['./src/*', './lib/*'] };
    expect(resolvePathAlias('@/utils', aliases)).toBe('src/utils');
  });

  it('should strip leading ./ from resolved path', () => {
    const aliases = { '~/*': ['./src/*'] };
    expect(resolvePathAlias('~/foo', aliases)).toBe('src/foo');
  });
});

describe('normalizeImportSource', () => {
  it('should resolve ./ relative imports', () => {
    const result = normalizeImportSource('./utils', 'src/services/userService.ts');
    expect(result).toBe('src/services/utils');
  });

  it('should resolve ../ relative imports', () => {
    const result = normalizeImportSource('../utils/crypto', 'src/services/userService.ts');
    expect(result).toBe('src/utils/crypto');
  });

  it('should resolve deeply nested ../ imports', () => {
    const result = normalizeImportSource('../../lib/helper', 'src/features/auth/login.ts');
    expect(result).toBe('src/lib/helper');
  });

  it('should strip .ts extension from relative imports', () => {
    const result = normalizeImportSource('./helper.ts', 'src/utils/index.ts');
    expect(result).toBe('src/utils/helper');
  });

  it('should strip .tsx extension from relative imports', () => {
    const result = normalizeImportSource('./Button.tsx', 'src/components/index.ts');
    expect(result).toBe('src/components/Button');
  });

  it('should strip extensions from non-relative (already-resolved) paths', () => {
    const result = normalizeImportSource('src/utils/crypto.ts', 'src/index.ts');
    expect(result).toBe('src/utils/crypto');
  });

  it('should handle non-relative imports by stripping extension only', () => {
    const result = normalizeImportSource('src/utils/crypto.js', 'anything.ts');
    expect(result).toBe('src/utils/crypto');
  });

  it('should handle file at project root', () => {
    const result = normalizeImportSource('./config', 'index.ts');
    expect(result).toBe('config');
  });
});

describe('normalizeFilePath', () => {
  it('should strip .ts extension', () => {
    expect(normalizeFilePath('src/utils/crypto.ts')).toBe('src/utils/crypto');
  });

  it('should strip .tsx extension', () => {
    expect(normalizeFilePath('src/components/Button.tsx')).toBe('src/components/Button');
  });

  it('should strip .js extension', () => {
    expect(normalizeFilePath('src/utils/helper.js')).toBe('src/utils/helper');
  });

  it('should strip .jsx extension', () => {
    expect(normalizeFilePath('src/components/App.jsx')).toBe('src/components/App');
  });

  it('should return path unchanged if no recognized extension', () => {
    expect(normalizeFilePath('src/data/config.json')).toBe('src/data/config.json');
  });

  it('should handle paths without directories', () => {
    expect(normalizeFilePath('index.ts')).toBe('index');
  });
});

describe('getNormalizedPaths', () => {
  it('should return [normalizedPath, null] for regular files', () => {
    const [normalized, dirPath] = getNormalizedPaths('src/utils/crypto.ts');
    expect(normalized).toBe('src/utils/crypto');
    expect(dirPath).toBeNull();
  });

  it('should return [normalizedPath, directoryPath] for index files', () => {
    const [normalized, dirPath] = getNormalizedPaths('src/components/ui/index.ts');
    expect(normalized).toBe('src/components/ui/index');
    expect(dirPath).toBe('src/components/ui');
  });

  it('should handle index.tsx files', () => {
    const [normalized, dirPath] = getNormalizedPaths('src/pages/index.tsx');
    expect(normalized).toBe('src/pages/index');
    expect(dirPath).toBe('src/pages');
  });

  it('should not treat non-index files ending in "index" as index files', () => {
    const [normalized, dirPath] = getNormalizedPaths('src/utils/reindex.ts');
    expect(normalized).toBe('src/utils/reindex');
    expect(dirPath).toBeNull();
  });
});

describe('buildFilePathIndex', () => {
  it('should index files by their full path', () => {
    const files = [makeFileNode('src/utils/crypto.ts')];
    const index = buildFilePathIndex(files);

    expect(index.get('src/utils/crypto.ts')).toBe('file:src/utils/crypto.ts');
  });

  it('should index files by path without extension', () => {
    const files = [makeFileNode('src/utils/crypto.ts')];
    const index = buildFilePathIndex(files);

    expect(index.get('src/utils/crypto')).toBe('file:src/utils/crypto.ts');
  });

  it('should index index files by their directory path', () => {
    const files = [makeFileNode('src/database/index.ts')];
    const index = buildFilePathIndex(files);

    expect(index.get('src/database/index.ts')).toBe('file:src/database/index.ts');
    expect(index.get('src/database/index')).toBe('file:src/database/index.ts');
    expect(index.get('src/database')).toBe('file:src/database/index.ts');
  });

  it('should not create directory mapping for non-index files', () => {
    const files = [makeFileNode('src/utils/crypto.ts')];
    const index = buildFilePathIndex(files);

    expect(index.has('src/utils')).toBe(false);
  });

  it('should handle multiple files', () => {
    const files = [
      makeFileNode('src/utils/crypto.ts'),
      makeFileNode('src/services/userService.ts'),
      makeFileNode('src/database/index.ts'),
    ];
    const index = buildFilePathIndex(files);

    expect(index.get('src/utils/crypto')).toBe('file:src/utils/crypto.ts');
    expect(index.get('src/services/userService')).toBe('file:src/services/userService.ts');
    expect(index.get('src/database')).toBe('file:src/database/index.ts');
  });

  it('should return an empty map for empty input', () => {
    const index = buildFilePathIndex([]);
    expect(index.size).toBe(0);
  });

  it('should handle index.tsx and index.jsx files', () => {
    const files = [makeFileNode('src/components/index.tsx')];
    const index = buildFilePathIndex(files);

    expect(index.get('src/components')).toBe('file:src/components/index.tsx');
  });
});
