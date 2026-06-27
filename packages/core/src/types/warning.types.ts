/**
 * Warning-related type definitions
 * See CONTRACTS.md for full documentation
 */

export enum WarningLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

export enum WarningCategory {
  CircularDependency = 'circular_dependency',
  OrphanedCode = 'orphaned_code',
  DuplicateCode = 'duplicate_code',
  LargeFile = 'large_file',
  DeepNesting = 'deep_nesting',
  MissingTypes = 'missing_types',
  UnusedExport = 'unused_export',
  SecurityConcern = 'security_concern',
}

/**
 * Which engine produced a warning.
 *
 * Phase 1 of the Surveyor rebuild delegates problem-FLAGGING to battle-tested
 * tools (knip, dependency-cruiser) instead of hand-rolled, name-based detectors.
 * `source` lets the UI rank/group findings by the tool that produced them and is
 * the audit trail for "where did this come from".
 */
export enum WarningSource {
  /** Surveyor's own in-process detectors (currently: large_file). */
  Surveyor = 'surveyor',
  /** knip — unused files / exports / types. */
  Knip = 'knip',
  /** dependency-cruiser — dependency cycles and rule violations. */
  DependencyCruiser = 'dependency-cruiser',
}

export interface Warning {
  id: string;
  category: WarningCategory;
  level: WarningLevel;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion: WarningSuggestion | null;
  detectedAt: string;
  /** Which engine produced this warning. */
  source: WarningSource;
  /**
   * How confident we are this is a real, actionable finding (0..1).
   * High (>= ~0.8): structural / hard evidence (genuinely orphaned file,
   * import cycle, oversized file). Lower: soft signals the UI should present
   * quietly and rank below the hard ones (e.g. an export only used internally,
   * so the `export` keyword is redundant but the symbol is NOT dead). Drives
   * ranking + soft-presentation in the UI.
   */
  confidence: number;
  /**
   * Whether the UI should offer a one-click dismiss for this finding. Soft /
   * lower-confidence findings (and anything correct-but-low-value on a given
   * codebase, e.g. a library's public exports) are dismissible so the user can
   * quiet the noise without losing the high-signal findings.
   */
  dismissible: boolean;
}

export interface WarningSuggestion {
  summary: string;
  reasoning: string;
  codeExample: string | null;
  autoFixable: boolean;
}
