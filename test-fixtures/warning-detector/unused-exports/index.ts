// Files named index.ts/index.js are skipped wholesale by the unused-export
// detector, so this export is NOT flagged even though nothing imports it.
// (Characterizes the index-file skip.)
export function indexOnlyExport(): void {}
