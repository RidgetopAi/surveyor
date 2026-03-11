/**
 * Tests for warning detector's use of the connection graph
 *
 * Verifies that the warning detector correctly uses pre-built connections
 * to determine orphaned code and circular dependencies, rather than
 * relying on string-name matching.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { scanProject } from '../parser/typescript-parser.js';
import { WarningCategory } from '../types/warning.types.js';
import { ConnectionType } from '../types/connection.types.js';

// Path to test fixtures
const SAMPLE_PROJECT = path.join(__dirname, '../../../../test-fixtures/sample-project');

describe('warning detector with connections', () => {
  describe('orphaned code detection', () => {
    it('should not flag functions that have incoming FunctionCall connections', async () => {
      const result = await scanProject(SAMPLE_PROJECT);

      const orphanWarnings = result.warnings.filter(
        w => w.category === WarningCategory.OrphanedCode
      );

      // Build set of function IDs that have incoming FunctionCall connections
      const calledFunctionIds = new Set<string>();
      for (const conn of result.connections) {
        if (conn.type === ConnectionType.FunctionCall) {
          calledFunctionIds.add(conn.targetId);
        }
      }

      // No orphan warning should reference a function that has an incoming call
      for (const warning of orphanWarnings) {
        for (const nodeId of warning.affectedNodes) {
          const node = result.nodes[nodeId];
          if (node && node.type === 'function') {
            expect(calledFunctionIds.has(nodeId)).toBe(false);
          }
        }
      }
    });

    it('should not flag exported functions as orphaned', async () => {
      const result = await scanProject(SAMPLE_PROJECT);

      const orphanWarnings = result.warnings.filter(
        w => w.category === WarningCategory.OrphanedCode
      );

      for (const warning of orphanWarnings) {
        for (const nodeId of warning.affectedNodes) {
          const node = result.nodes[nodeId];
          if (node && node.type === 'function') {
            expect(node.isExported).toBe(false);
          }
        }
      }
    });

    it('should not flag functions referenced in topLevelReferences', async () => {
      const result = await scanProject(SAMPLE_PROJECT);

      const orphanWarnings = result.warnings.filter(
        w => w.category === WarningCategory.OrphanedCode
      );

      const orphanedFuncNames = orphanWarnings.flatMap(w =>
        w.affectedNodes.map(id => result.nodes[id]?.name).filter(Boolean)
      );

      // For each file, check that top-level referenced functions are not flagged
      const fileNodes = Object.values(result.nodes).filter(n => n.type === 'file');
      for (const file of fileNodes) {
        if (file.type === 'file' && file.topLevelReferences) {
          for (const ref of file.topLevelReferences) {
            // A function name in topLevelReferences should not appear in orphan warnings
            // (for functions in that same file)
            const funcInFile = Object.values(result.nodes).find(
              n => n.type === 'function' && n.name === ref && n.parentFileId === file.id
            );
            if (funcInFile && !funcInFile.isExported) {
              expect(orphanedFuncNames).not.toContain(ref);
            }
          }
        }
      }
    });
  });

  describe('circular dependency detection (file level)', () => {
    it('should use Import connections to detect file circular dependencies', async () => {
      const result = await scanProject(SAMPLE_PROJECT);

      // Verify that Import connections exist between files
      const importConns = result.connections.filter(c => c.type === ConnectionType.Import);
      expect(importConns.length).toBeGreaterThan(0);

      // authService imports from userService and userService doesn't import authService
      // so there should be no file-level circular warning between them
      // The circular dependencies, if any, come from the connection graph
      const circularWarnings = result.warnings.filter(
        w => w.category === WarningCategory.CircularDependency
      );

      // Each circular warning should reference valid node IDs
      for (const warning of circularWarnings) {
        for (const nodeId of warning.affectedNodes) {
          expect(result.nodes[nodeId]).toBeDefined();
        }
      }
    });

    it('should include all cycle members in affectedNodes', async () => {
      const result = await scanProject(SAMPLE_PROJECT);

      const circularWarnings = result.warnings.filter(
        w => w.category === WarningCategory.CircularDependency
      );

      // Each circular warning should have at least 2 affected nodes (a cycle needs >= 2)
      for (const warning of circularWarnings) {
        expect(warning.affectedNodes.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('connection graph integrity', () => {
    it('should have connections that match the import structure of the project', async () => {
      const result = await scanProject(SAMPLE_PROJECT, { skipWarnings: true });

      // authService.ts imports from userService.ts and utils/jwt.ts
      const authFile = Object.values(result.nodes).find(
        n => n.type === 'file' && n.name === 'authService.ts'
      );
      const userServiceFile = Object.values(result.nodes).find(
        n => n.type === 'file' && n.name === 'userService.ts'
      );
      const jwtFile = Object.values(result.nodes).find(
        n => n.type === 'file' && n.name === 'jwt.ts'
      );

      expect(authFile).toBeDefined();
      expect(userServiceFile).toBeDefined();
      expect(jwtFile).toBeDefined();

      const importConns = result.connections.filter(c => c.type === ConnectionType.Import);

      // authService -> userService import connection
      const authToUser = importConns.find(
        c => c.sourceId === authFile!.id && c.targetId === userServiceFile!.id
      );
      expect(authToUser).toBeDefined();

      // authService -> jwt import connection
      const authToJwt = importConns.find(
        c => c.sourceId === authFile!.id && c.targetId === jwtFile!.id
      );
      expect(authToJwt).toBeDefined();
    });

    it('should build FunctionCall connections that the warning detector uses for orphan detection', async () => {
      const result = await scanProject(SAMPLE_PROJECT, { skipWarnings: true });

      const fnCallConns = result.connections.filter(c => c.type === ConnectionType.FunctionCall);

      // authService.login calls getUserById (cross-file)
      const login = Object.values(result.nodes).find(
        n => n.type === 'function' && n.name === 'login'
      );
      const getUserById = Object.values(result.nodes).find(
        n => n.type === 'function' && n.name === 'getUserById'
      );

      if (login && getUserById) {
        const callConn = fnCallConns.find(
          c => c.sourceId === login.id && c.targetId === getUserById.id
        );
        expect(callConn).toBeDefined();
      }

      // authService.login calls signToken (cross-file)
      const signToken = Object.values(result.nodes).find(
        n => n.type === 'function' && n.name === 'signToken'
      );

      if (login && signToken) {
        const callConn = fnCallConns.find(
          c => c.sourceId === login.id && c.targetId === signToken.id
        );
        expect(callConn).toBeDefined();
      }
    });

    it('should ensure warnings are consistent with the connection graph', async () => {
      // Run scan with warnings enabled
      const result = await scanProject(SAMPLE_PROJECT);

      // Get all function nodes that the warning detector could flag
      const allFuncs = Object.values(result.nodes).filter(n => n.type === 'function');

      // Build the set of called function IDs from connections
      const calledIds = new Set<string>();
      for (const conn of result.connections) {
        if (conn.type === ConnectionType.FunctionCall) {
          calledIds.add(conn.targetId);
        }
      }

      // For any non-exported, non-class-method function that IS called,
      // verify it does NOT appear in orphan warnings
      const orphanWarningNodeIds = new Set(
        result.warnings
          .filter(w => w.category === WarningCategory.OrphanedCode)
          .flatMap(w => w.affectedNodes)
      );

      for (const func of allFuncs) {
        if (func.type === 'function' && !func.isExported && !func.parentClassId) {
          if (calledIds.has(func.id)) {
            expect(orphanWarningNodeIds.has(func.id)).toBe(false);
          }
        }
      }
    });
  });
});
