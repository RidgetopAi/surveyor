// Entry point. Reaches usedExport + the cycle, so those files are NOT orphaned.
import { usedExport } from './hasUnusedExport.js';
import { startCycle } from './cycleA.js';

export function main(): void {
  usedExport();
  startCycle();
}
