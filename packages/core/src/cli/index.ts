#!/usr/bin/env node
/**
 * Surveyor CLI entry point
 *
 * Commands:
 *   scan <path>  - Scan a directory and extract structure
 */

import { Command } from 'commander';
import { VERSION } from '../index.js';
import { scanCommand } from './commands/scan.js';

const program = new Command();

program
  .name('surveyor')
  .description('Codebase mapping and visualization tool')
  .version(VERSION);

// Register scan command
program.addCommand(scanCommand);

// Parse and execute
program.parse();
