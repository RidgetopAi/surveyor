/**
 * CLI scan command
 *
 * Usage: surveyor scan <path> [options]
 *
 * Scans a directory and extracts structural information:
 * - Files, functions, classes
 * - Imports and exports
 * - Parameters and return types
 * - Behavioral analysis (optional, requires LLM API key)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { scanProject } from '../../parser/index.js';
import { analyzeBehavior, createLLMClientFromEnv } from '../../analyzer/index.js';
import type { AnalysisProgress } from '../../types/analyzer.types.js';

interface ScanCommandOptions {
  output?: string;
  format: 'json';
  verbose: boolean;
  analyze: boolean;
  noAnalyze: boolean;
}

export const scanCommand = new Command('scan')
  .description('Scan a directory and extract structure')
  .argument('<path>', 'Path to the project directory to scan')
  .option('-o, --output <dir>', 'Output directory (default: stdout)')
  .option('-f, --format <type>', 'Output format: json', 'json')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-a, --analyze', 'Run behavioral analysis on functions (requires SURVEYOR_LLM_API_KEY)', false)
  .option('--no-analyze', 'Skip behavioral analysis')
  .action(async (targetPath: string, options: ScanCommandOptions) => {
    const { output, format: _format, verbose, analyze, noAnalyze } = options;
    const shouldAnalyze = analyze && !noAnalyze;

    // Resolve the target path
    const absolutePath = path.resolve(targetPath);

    // Verify path exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: Path does not exist: ${absolutePath}`);
      process.exit(1);
    }

    // Verify it's a directory
    if (!fs.statSync(absolutePath).isDirectory()) {
      console.error(`Error: Path is not a directory: ${absolutePath}`);
      process.exit(1);
    }

    try {
      // Run the scan
      let result = await scanProject(absolutePath, { verbose });

      // Run behavioral analysis if requested
      if (shouldAnalyze) {
        try {
          const client = createLLMClientFromEnv();
          const outputDir = output ? path.resolve(output) : path.join(absolutePath, '.surveyor');

          if (verbose) {
            console.log('\nRunning behavioral analysis...');
          }

          // Progress callback for verbose mode
          const onProgress = verbose
            ? (progress: AnalysisProgress) => {
                const cacheIndicator = progress.fromCache ? ' (cached)' : '';
                process.stdout.write(
                  `\r  Analyzing ${progress.current}/${progress.total}: ${progress.functionName}${cacheIndicator}          `
                );
              }
            : undefined;

          result = await analyzeBehavior(result, client, {
            onProgress,
            cacheDir: outputDir,
            model: process.env.SURVEYOR_LLM_MODEL || 'grok-4-1-fast-reasoning',
          });

          if (verbose) {
            console.log('\n  Analysis complete.');
            console.log(`  Analyzed: ${result.stats.analyzedCount}`);
          }
        } catch (analyzeErr) {
          const msg = analyzeErr instanceof Error ? analyzeErr.message : String(analyzeErr);
          console.error(`\nWarning: Behavioral analysis failed: ${msg}`);
          console.error('Continuing with scan results only.');
        }
      }

      // Format output
      const jsonOutput = JSON.stringify(result, null, 2);

      if (output) {
        // Write to file
        const outputDir = path.resolve(output);

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputPath = path.join(outputDir, `scan-${result.id}.json`);
        fs.writeFileSync(outputPath, jsonOutput);

        console.log(`Scan complete. Output written to: ${outputPath}`);
        console.log(`  Files: ${result.stats.totalFiles}`);
        console.log(`  Functions: ${result.stats.totalFunctions}`);
        console.log(`  Classes: ${result.stats.totalClasses}`);
        if (shouldAnalyze) {
          console.log(`  Analyzed: ${result.stats.analyzedCount}`);
        }
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`);
        }
      } else {
        // Output to stdout
        if (verbose) {
          console.log('---');
        }
        console.log(jsonOutput);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`Scan failed: ${error}`);
      process.exit(1);
    }
  });
