// A re-export hub (deliberately NOT named index.ts, so it is not auto-skipped
// by the index-file rule -- its exports are skipped because they are re-exports).
export { reExported } from './source';
export * from './star-source';
