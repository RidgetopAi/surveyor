// starFn is consumed by consumer.ts via `export * from './star-source'` in
// barrel.ts -> NOT flagged. (Characterizes the star-re-export credit path.)
export function starFn(): void {}
