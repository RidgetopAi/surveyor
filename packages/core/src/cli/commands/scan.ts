/**
 * CLI scan command
 *
 * Usage: surveyor scan <path> [options]
 *
 * Scans a directory and extracts structural information:
 * - Files, functions, classes
 * - Imports and exports
 * - Parameters and return types
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { scanProject } from '../../parser/index.js';

interface ScanCommandOptions {
  output?: string;
  format: 'json';
  verbose: boolean;
}

export const scanCommand = new Command('scan')
  .description('Scan a directory and extract structure')
  .argument('<path>', 'Path to the project directory to scan')
  .option('-o, --output <dir>', 'Output directory (default: stdout)')
  .option('-f, --format <type>', 'Output format: json', 'json')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (targetPath: string, options: ScanCommandOptions) => {
    const { output, format: _format, verbose } = options;

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
      const result = await scanProject(absolutePath, { verbose });

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
