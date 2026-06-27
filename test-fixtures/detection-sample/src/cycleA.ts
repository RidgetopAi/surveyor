import { stepB } from './cycleB.js';

export function startCycle(): void {
  stepB();
}

export function stepA(): void {
  startCycle();
}
