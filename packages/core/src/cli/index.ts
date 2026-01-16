#!/usr/bin/env node
/**
 * Surveyor CLI entry point
 *
 * Commands:
 *   scan <path>  - Scan a directory and extract structure
 */

import { config } from 'dotenv';
import { Command } from 'commander';
import { VERSION } from '../index.js';
import { scanCommand } from './commands/scan.js';

// Load environment variables from .env file
// Looks in current directory and parent directories
config();
config({ path: '../.env' });
config({ path: '../../.env' });

const program = new Command();

program
  .name('surveyor')
  .description('Codebase mapping and visualization tool')
  .version(VERSION);

// Register scan command
program.addCommand(scanCommand);

// Parse and execute
program.parse();
