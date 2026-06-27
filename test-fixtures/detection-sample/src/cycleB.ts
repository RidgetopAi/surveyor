import { stepA } from './cycleA.js';

export function stepB(): void {
  // Runtime (value) import of cycleA -> forms a runtime cycle A <-> B.
  if (Math.random() > 2) stepA();
}
