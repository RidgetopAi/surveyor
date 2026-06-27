/**
 * Raw JSON shapes emitted by the detection engines' reporters.
 *
 * These mirror the *stable* parts of each tool's JSON output that the mapper
 * depends on. They are deliberately permissive (extra fields ignored) so a minor
 * tool upgrade that adds fields does not break parsing. Captured real samples
 * used to pin these live under src/detection/__fixtures__/.
 */

// ───────────────────────────── knip ──────────────────────────────

/** A located symbol issue (unused export / type). */
export interface KnipSymbolIssue {
  name: string;
  line?: number;
  col?: number;
  pos?: number;
}

/** An unused-file issue carries just the file path in `name`. */
export interface KnipFileIssue {
  name: string;
}

/**
 * knip groups all issues for one source file under a single entry keyed by
 * `file`. Arrays are present-but-empty when there is nothing of that kind.
 */
export interface KnipFileEntry {
  file: string;
  files?: KnipFileIssue[];
  exports?: KnipSymbolIssue[];
  types?: KnipSymbolIssue[];
  nsExports?: KnipSymbolIssue[];
  nsTypes?: KnipSymbolIssue[];
  enumMembers?: Record<string, KnipSymbolIssue[]>;
  // Out-of-scope-for-P1 groups (dependencies, unlisted, binaries, …) are
  // intentionally not typed; they are ignored by the mapper.
  [key: string]: unknown;
}

export interface KnipJsonReport {
  issues: KnipFileEntry[];
}

// ─────────────────────── dependency-cruiser ───────────────────────

/** One hop in a reported cycle: a module plus the edge-types leading to it. */
export interface DepCruiseCycleHop {
  name: string;
  dependencyTypes: string[];
}

export interface DepCruiseViolation {
  type: string; // 'cycle' for circular violations
  from: string;
  to: string;
  dependencyTypes?: string[];
  rule: { name: string; severity: string };
  cycle?: DepCruiseCycleHop[];
}

export interface DepCruiseJsonReport {
  summary: {
    violations: DepCruiseViolation[];
    error?: number;
    totalCruised?: number;
    totalDependenciesCruised?: number;
  };
  // modules[] etc. are present but unused by the mapper.
  [key: string]: unknown;
}
