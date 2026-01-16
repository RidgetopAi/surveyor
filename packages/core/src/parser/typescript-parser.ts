/**
 * TypeScript Parser - Core parsing engine using ts-morph
 *
 * Extracts structural information from TypeScript/JavaScript files:
 * - File imports and exports
 * - Function declarations
 * - Class declarations
 *
 * Phase 1: No behavioral analysis, no clusters, no warnings
 */

import { Project, SourceFile } from 'ts-morph';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

import type { ScanResult, ScanStats, ScanError } from '../types/scan.types.js';
import { ScanStatus } from '../types/scan.types.js';
import type { FileNode, FunctionNode, ClassNode, NodeMap } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import { WarningLevel } from '../types/warning.types.js';
import type { WarningDetectorOptions } from '../types/analyzer.types.js';
import { detectWarnings, updateWarningStats } from '../analyzer/warning-detector.js';

import { parseImports } from './parse-imports.js';
import { parseExports } from './parse-exports.js';
import { parseFunctions } from './parse-functions.js';
import { parseClasses } from './parse-classes.js';

export interface ScanOptions {
  verbose?: boolean;
  /** Skip warning detection */
  skipWarnings?: boolean;
  /** Warning detector options */
  warningOptions?: WarningDetectorOptions;
}

/**
 * Generate a deterministic node ID from file path
 */
function generateFileId(filePath: string, projectPath: string): string {
  const relativePath = path.relative(projectPath, filePath);
  return `file:${relativePath}`;
}

/**
 * Extract project name from path or package.json
 */
function getProjectName(projectPath: string): string {
  return path.basename(path.resolve(projectPath));
}

/**
 * Find all TypeScript/JavaScript files in a directory
 */
async function findSourceFiles(projectPath: string): Promise<string[]> {
  const patterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.d.ts',
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: ignorePatterns,
      absolute: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)].sort();
}

/**
 * Parse a single source file and extract all structural information
 */
function parseSourceFile(
  sourceFile: SourceFile,
  projectPath: string,
  _errors: ScanError[]
): { fileNode: FileNode; functionNodes: FunctionNode[]; classNodes: ClassNode[] } {
  const filePath = sourceFile.getFilePath();
  const relativePath = path.relative(projectPath, filePath);
  const fileId = generateFileId(filePath, projectPath);

  // Parse imports
  const imports = parseImports(sourceFile);

  // Parse exports
  const exports = parseExports(sourceFile);

  // Parse functions
  const { functions: functionNodes, functionIds } = parseFunctions(
    sourceFile,
    fileId,
    relativePath
  );

  // Parse classes
  const { classes: classNodes, classIds } = parseClasses(
    sourceFile,
    fileId,
    relativePath
  );

  // Build FileNode
  const fileNode: FileNode = {
    id: fileId,
    type: NodeType.File,
    name: path.basename(filePath),
    filePath: relativePath,
    line: 1,
    endLine: sourceFile.getEndLineNumber(),
    imports,
    exports,
    functions: functionIds,
    classes: classIds,
  };

  return { fileNode, functionNodes, classNodes };
}

/**
 * Calculate statistics from the parsed nodes
 */
function calculateStats(nodes: NodeMap): ScanStats {
  let totalFiles = 0;
  let totalFunctions = 0;
  let totalClasses = 0;

  const nodesByType: Record<string, number> = {
    [NodeType.File]: 0,
    [NodeType.Function]: 0,
    [NodeType.Class]: 0,
    [NodeType.Cluster]: 0,
  };

  for (const node of Object.values(nodes)) {
    const currentCount = nodesByType[node.type];
    if (currentCount !== undefined) {
      nodesByType[node.type] = currentCount + 1;
    }

    switch (node.type) {
      case NodeType.File:
        totalFiles++;
        break;
      case NodeType.Function:
        totalFunctions++;
        break;
      case NodeType.Class:
        totalClasses++;
        break;
    }
  }

  return {
    totalFiles,
    totalFunctions,
    totalClasses,
    totalConnections: 0, // Connections built later
    totalWarnings: 0,    // Warnings detected in Phase 5
    warningsByLevel: {
      [WarningLevel.Info]: 0,
      [WarningLevel.Warning]: 0,
      [WarningLevel.Error]: 0,
    },
    nodesByType,
    analyzedCount: 0,     // Behavioral analysis in Phase 4
    pendingAnalysis: totalFunctions,
  };
}

/**
 * Scan a project directory and extract structural information
 *
 * @param projectPath - Path to the project root directory
 * @param options - Scan configuration options
 * @returns ScanResult with all parsed nodes
 */
export async function scanProject(
  projectPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const { verbose = false } = options;
  const absolutePath = path.resolve(projectPath);
  const scanId = uuidv4();
  const startTime = new Date().toISOString();

  if (verbose) {
    console.log(`Starting scan of: ${absolutePath}`);
  }

  // Initialize result structure
  const errors: ScanError[] = [];
  const nodes: NodeMap = {};

  // Find all source files
  const sourceFilePaths = await findSourceFiles(absolutePath);

  if (verbose) {
    console.log(`Found ${sourceFilePaths.length} source files`);
  }

  // Create ts-morph Project
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add source files to project
  for (const filePath of sourceFilePaths) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({
        filePath: path.relative(absolutePath, filePath),
        line: null,
        message: `Failed to add file: ${error}`,
        recoverable: true,
      });
    }
  }

  // Parse each source file
  for (const sourceFile of project.getSourceFiles()) {
    try {
      const { fileNode, functionNodes, classNodes } = parseSourceFile(
        sourceFile,
        absolutePath,
        errors
      );

      // Add file node
      nodes[fileNode.id] = fileNode;

      // Add function nodes
      for (const fn of functionNodes) {
        nodes[fn.id] = fn;
      }

      // Add class nodes
      for (const cls of classNodes) {
        nodes[cls.id] = cls;
      }

      if (verbose) {
        console.log(`  Parsed: ${fileNode.filePath} (${functionNodes.length} functions, ${classNodes.length} classes)`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const filePath = sourceFile.getFilePath();
      errors.push({
        filePath: path.relative(absolutePath, filePath),
        line: null,
        message: `Failed to parse file: ${error}`,
        recoverable: true,
      });
    }
  }

  // Calculate statistics
  const stats = calculateStats(nodes);

  // Build final result
  const result: ScanResult = {
    id: scanId,
    projectPath: absolutePath,
    projectName: getProjectName(absolutePath),
    status: errors.length > 0 && Object.keys(nodes).length === 0
      ? ScanStatus.Failed
      : ScanStatus.Complete,
    createdAt: startTime,
    completedAt: new Date().toISOString(),
    stats,
    nodes,
    connections: [], // Phase 2: Build connections from imports
    warnings: [],    // Populated below
    clusters: [],    // Phase 7: Build clusters
    errors,
  };

  // Detect warnings (unless skipped)
  if (!options.skipWarnings) {
    if (verbose) {
      console.log(`\nDetecting warnings...`);
    }
    result.warnings = detectWarnings(result, options.warningOptions);
    updateWarningStats(result);

    if (verbose) {
      console.log(`  Found ${result.warnings.length} warnings`);
    }
  }

  if (verbose) {
    console.log(`\nScan complete:`);
    console.log(`  Files: ${stats.totalFiles}`);
    console.log(`  Functions: ${stats.totalFunctions}`);
    console.log(`  Classes: ${stats.totalClasses}`);
    console.log(`  Warnings: ${result.stats.totalWarnings}`);
    console.log(`  Errors: ${errors.length}`);
  }

  return result;
}

/**
 * Parse a single file (for testing or targeted parsing)
 */
export async function parseFile(
  filePath: string,
  projectPath?: string
): Promise<FileNode> {
  const absoluteFilePath = path.resolve(filePath);
  const resolvedProjectPath = projectPath
    ? path.resolve(projectPath)
    : path.dirname(absoluteFilePath);

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const sourceFile = project.addSourceFileAtPath(absoluteFilePath);
  const errors: ScanError[] = [];

  const { fileNode } = parseSourceFile(sourceFile, resolvedProjectPath, errors);

  return fileNode;
}
