// consumer.ts does `import * as ns from './namespace-target'`. A namespace
// import marks the whole module as used ('*'), so NEITHER of these is flagged,
// even though nsB is never referenced by name. (Characterizes namespace import.)
export function nsA(): void {}
export function nsB(): void {}
