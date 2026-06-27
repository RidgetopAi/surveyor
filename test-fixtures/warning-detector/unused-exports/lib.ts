// usedDirect is imported by consumer.ts -> NOT flagged.
export function usedDirect(): void {}

// unusedFn is exported but never imported anywhere -> SHOULD be flagged unused_export.
export function unusedFn(): void {}

// Type-only exports are skipped by the detector regardless of usage.
export type UnusedType = string;
export interface UnusedIface {
  x: number;
}
