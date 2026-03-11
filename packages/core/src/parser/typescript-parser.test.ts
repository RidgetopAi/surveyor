/**
 * Integration tests for typescript-parser.ts
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { scanProject, parseFile } from './typescript-parser.js';
import { ScanStatus } from '../types/scan.types.js';

// Path to test fixtures
const SAMPLE_PROJECT = path.join(__dirname, '../../../../test-fixtures/sample-project');

describe('scanProject', () => {
  it('should scan sample-project and return valid ScanResult', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Check top-level structure
    expect(result.id).toBeDefined();
    expect(result.projectPath).toBe(path.resolve(SAMPLE_PROJECT));
    expect(result.projectName).toBe('sample-project');
    expect(result.status).toBe(ScanStatus.Complete);
    expect(result.createdAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
  });

  it('should have correct stats', async () => {
    const result = await scanProject(SAMPLE_PROJECT, { skipWarnings: true });

    expect(result.stats.totalFiles).toBe(8);
    expect(result.stats.totalFunctions).toBe(14);
    expect(result.stats.totalClasses).toBe(0);
    expect(result.stats.totalConnections).toBeGreaterThan(0);
    expect(result.stats.totalWarnings).toBe(0);    // Warnings skipped
    expect(result.stats.pendingAnalysis).toBe(14); // Phase 4
  });

  it('should parse all files', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    const fileNodes = Object.values(result.nodes).filter(n => n.type === 'file');
    expect(fileNodes).toHaveLength(8);

    const fileNames = fileNodes.map(n => n.name);
    expect(fileNames).toContain('index.ts');
    expect(fileNames).toContain('userService.ts');
    expect(fileNames).toContain('authService.ts');
    expect(fileNames).toContain('crypto.ts');
    expect(fileNames).toContain('jwt.ts');
  });

  it('should extract imports from files', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Find userService file
    const userService = Object.values(result.nodes).find(
      n => n.type === 'file' && n.name === 'userService.ts'
    );
    expect(userService).toBeDefined();

    if (userService?.type === 'file') {
      expect(userService.imports.length).toBeGreaterThan(0);

      // Should import from database
      const dbImport = userService.imports.find(i => i.source.includes('database'));
      expect(dbImport).toBeDefined();
      expect(dbImport?.items.some(item => item.name === 'db')).toBe(true);
    }
  });

  it('should extract exports from files', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Find userService file
    const userService = Object.values(result.nodes).find(
      n => n.type === 'file' && n.name === 'userService.ts'
    );

    if (userService?.type === 'file') {
      const exportNames = userService.exports.map(e => e.name);
      expect(exportNames).toContain('createUser');
      expect(exportNames).toContain('getUserById');
      expect(exportNames).toContain('updateUser');
    }
  });

  it('should extract functions with parameters', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Find createUser function
    const createUser = Object.values(result.nodes).find(
      n => n.type === 'function' && n.name === 'createUser'
    );
    expect(createUser).toBeDefined();

    if (createUser?.type === 'function') {
      expect(createUser.isExported).toBe(true);
      expect(createUser.isAsync).toBe(true);
      expect(createUser.params.length).toBeGreaterThan(0);
      expect(createUser.returnType).toContain('Promise');
    }
  });

  it('should link functions to parent files', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Find a function
    const fn = Object.values(result.nodes).find(n => n.type === 'function');
    expect(fn).toBeDefined();

    if (fn?.type === 'function') {
      expect(fn.parentFileId).toBeDefined();
      expect(result.nodes[fn.parentFileId]).toBeDefined();
      expect(result.nodes[fn.parentFileId].type).toBe('file');
    }
  });

  it('should build connections from imports and references', async () => {
    const result = await scanProject(SAMPLE_PROJECT, { skipWarnings: true });

    expect(result.connections.length).toBeGreaterThan(0);
    expect(result.clusters).toHaveLength(0); // Phase 7

    // Every connection should have valid source and target IDs
    for (const conn of result.connections) {
      expect(result.nodes[conn.sourceId]).toBeDefined();
      expect(result.nodes[conn.targetId]).toBeDefined();
    }
  });

  it('should detect warnings when enabled', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    // Should have detected some warnings (orphaned code, unused exports, etc.)
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.stats.totalWarnings).toBe(result.warnings.length);

    // Each warning should have required fields
    for (const warning of result.warnings) {
      expect(warning.id).toBeDefined();
      expect(warning.category).toBeDefined();
      expect(warning.level).toBeDefined();
      expect(warning.title).toBeDefined();
      expect(warning.affectedNodes).toBeDefined();
    }
  });

  it('should have no errors for valid project', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    expect(result.errors).toHaveLength(0);
  });

  it('should use relative file paths in nodes', async () => {
    const result = await scanProject(SAMPLE_PROJECT);

    const fileNodes = Object.values(result.nodes).filter(n => n.type === 'file');

    for (const node of fileNodes) {
      expect(node.filePath).not.toContain(SAMPLE_PROJECT);
      expect(node.filePath.startsWith('src/')).toBe(true);
    }
  });
});

describe('parseFile', () => {
  it('should parse a single file', async () => {
    const filePath = path.join(SAMPLE_PROJECT, 'src/services/userService.ts');
    const result = await parseFile(filePath, SAMPLE_PROJECT);

    expect(result.type).toBe('file');
    expect(result.name).toBe('userService.ts');
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.functions.length).toBeGreaterThan(0);
  });
});

describe('scanProject with verbose option', () => {
  it('should accept verbose option without errors', async () => {
    const result = await scanProject(SAMPLE_PROJECT, { verbose: false });
    expect(result.status).toBe(ScanStatus.Complete);
  });
});
