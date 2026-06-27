/**
 * Detection-engine configuration (Phase 1 — trustworthy analysis).
 *
 * Surveyor delegates problem-FLAGGING to battle-tested tools:
 *   - knip               → unused files / exports / types
 *   - dependency-cruiser → dependency cycles (and, later, rule violations)
 *
 * EVERYTHING tunable lives here as named config — thresholds, which engines run,
 * the app-vs-library mode, per-source confidence, dismissibility, ignore globs,
 * and the per-tool options. No literals scattered through the adapters
 * (configs-not-hardcoded; CLAUDE.md standing rule).
 *
 * `DEFAULT_DETECTION_CONFIG` is the product default; callers pass a partial
 * override which is deep-merged by `resolveDetectionConfig`.
 */

/**
 * How to treat the target codebase.
 *  - `app`     : a deployable application. An export that nothing imports is a
 *                candidate for removal, so unused exports/types ARE surfaced.
 *  - `library` : a published package. Its public exports are the API surface and
 *                are NOT dead code, so unused exports/types are suppressed; only
 *                genuinely unreachable files and dependency cycles are surfaced.
 */
export type ScanMode = 'app' | 'library';

/** knip issue groups Surveyor knows how to map into the Warning model. */
export type KnipIssueType = 'files' | 'exports' | 'types' | 'nsExports' | 'nsTypes' | 'enumMembers';

export interface KnipEngineConfig {
  enabled: boolean;
  /**
   * Which knip issue groups to surface as warnings. knip reports many more
   * (dependencies, unlisted, binaries, …); those are real but a different class
   * (dependency hygiene) and are intentionally out of scope for P1 dead-code
   * flagging. Add them here to surface them — no code change needed.
   */
  issueTypes: KnipIssueType[];
  /**
   * Extra ignore globs merged into the generated knip config (on top of
   * `sharedIgnore`). Use for target-specific noise.
   */
  ignore: string[];
  /**
   * Whether to ALSO report unused exports of entry files. knip's semantics:
   * `false` (the default) treats entry-file exports as used — correct for us,
   * since entry files (main, index barrels, route modules) ARE the public
   * surface and flagging them is noise. `true` analyses entry files too (far more
   * findings) — opt in only when hunting truly-everything.
   */
  includeEntryExports: boolean;
  /**
   * knip's OWN default per-workspace entry globs, replicated here so Surveyor can
   * EXTEND a workspace's entry set (adding scripts/bin/config one-offs) WITHOUT
   * losing knip's index/main detection. knip REPLACES — does not merge — a
   * workspace `entry` (ConfigurationChief.getConfigForWorkspace), so anything we
   * add must re-include these or the entire tree gets flagged unused. Kept in
   * config (not hardcoded in the adapter) so a knip-default change is a one-line
   * edit. Source: knip getDefaultWorkspaceConfig (v6.22).
   */
  defaultEntry: string[];
  /**
   * Extra entry globs added to EVERY workspace so one-off scripts, bin tools and
   * standalone config files are treated as ENTRY points — i.e. not reported as
   * "unused files", and (critically) their imports COUNT as usage, so a helper
   * imported only by a script/config isn't a false "unused export". Applied
   * per-workspace, so globs are workspace-relative (`**​/` reaches nested dirs
   * like `src/scripts`).
   */
  extraEntry: string[];
  /**
   * knip plugin names to FORCE-ENABLE for every workspace. knip only
   * auto-enables a test-runner plugin (which is what registers `*.test.*` as
   * entries) when that runner is a DIRECT dependency. Repos that run tests
   * indirectly — CRA/react-scripts and craco both shell out to jest — never trip
   * that check, so their test files are mis-flagged as unused AND their imports
   * are not counted (inflating unused exports). Force-enabling the jest/vitest
   * plugins registers the standard test-entry globs regardless of how the runner
   * is wired. A plugin is force-enabled by giving it a (truthy) config object —
   * knip's WorkspaceWorker.determineEnabledPlugins short-circuits its isEnabled
   * check. Harmless where a workspace has no tests.
   */
  forceEnablePlugins: string[];
  /** Subprocess wall-clock timeout (ms). */
  timeoutMs: number;
}

export interface DependencyCruiserEngineConfig {
  enabled: boolean;
  /**
   * Include type-only imports (`import type { … }`) when detecting cycles.
   * Type-only cycles are real architectural smells but harmless at runtime
   * (erased on compile), so they are surfaced at LOWER confidence than runtime
   * cycles. Set false to ignore them entirely.
   */
  includeTypeOnly: boolean;
  /** Regex (string) of module paths to exclude from the graph. */
  exclude: string;
  /** Regex (string) of module paths to not follow into (kept shallow). */
  doNotFollow: string;
  /** Subprocess wall-clock timeout (ms). */
  timeoutMs: number;
}

/** Per-source confidence scores (0..1) assigned to mapped warnings. */
export interface ConfidenceConfig {
  /** knip: a genuinely unreachable file. Hard evidence. */
  knipFile: number;
  /** knip: an export imported nowhere. Could still be used internally → medium. */
  knipExport: number;
  /** knip: an exported type imported nowhere. */
  knipType: number;
  /** dependency-cruiser: a runtime import cycle. */
  cycle: number;
  /** dependency-cruiser: a type-only import cycle (runtime-harmless). */
  cycleTypeOnly: number;
  /** Surveyor: a file over the line threshold. Accurate, ~0% FP. */
  largeFile: number;
}

/** Whether the UI offers one-click dismiss, per source. */
export interface DismissibleConfig {
  knipFile: boolean;
  knipExport: boolean;
  knipType: boolean;
  cycle: boolean;
  largeFile: boolean;
}

export interface DetectionConfig {
  /** App vs library — governs whether unused exports/types are surfaced. */
  mode: ScanMode;
  knip: KnipEngineConfig;
  dependencyCruiser: DependencyCruiserEngineConfig;
  confidence: ConfidenceConfig;
  dismissible: DismissibleConfig;
  /**
   * Ignore globs shared across engines: generated code, build output, vendored
   * deps, declaration files, and common fixture/example dirs that are
   * intentionally unreferenced. Sane defaults for arbitrary target repos; the
   * documented residual limits live in the engine README.
   */
  sharedIgnore: string[];
}

/**
 * Default ignore globs for codebases we don't control. Generated API clients,
 * build output and fixture dirs are the dominant false-positive sources for a
 * file-level "unused" check, so they are excluded by default.
 */
export const DEFAULT_SHARED_IGNORE: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/*.d.ts',
  '**/generated/**',
  '**/__generated__/**',
  '**/test-fixtures/**',
  '**/fixtures/**',
  '**/__mocks__/**',
  '**/__fixtures__/**',
];

/**
 * knip's own default per-workspace entry globs (index/cli/main at root and under
 * `src/`). Replicated so we can EXTEND a workspace's entry without losing them —
 * knip replaces, not merges, a workspace `entry`. Mirror of knip v6.22
 * getDefaultWorkspaceConfig over DEFAULT_EXTENSIONS.
 */
export const DEFAULT_KNIP_ENTRY: readonly string[] = [
  '{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
  'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
];

/**
 * Extra entry globs so one-off scripts, bin tools and standalone config files
 * are treated as entries (not "unused files") and their imports count as usage.
 * Workspace-relative; `**​/` reaches nested dirs (e.g. `src/scripts`).
 */
export const DEFAULT_KNIP_EXTRA_ENTRY: readonly string[] = [
  '**/scripts/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
  'bin/**/*.{js,mjs,cjs,ts,mts,cts}',
  '*.config.{js,mjs,cjs,ts,mts,cts}',
  '**/*.config.{js,mjs,cjs,ts,mts,cts}',
];

/**
 * Test-runner plugins force-enabled per workspace so test files are entries (and
 * their imports count as usage) even when the runner is wired indirectly
 * (CRA/react-scripts, craco → jest).
 */
export const DEFAULT_KNIP_FORCE_ENABLE_PLUGINS: readonly string[] = ['jest', 'vitest'];

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  mode: 'app',
  knip: {
    enabled: true,
    issueTypes: ['files', 'exports', 'types'],
    ignore: [],
    includeEntryExports: false,
    defaultEntry: [...DEFAULT_KNIP_ENTRY],
    extraEntry: [...DEFAULT_KNIP_EXTRA_ENTRY],
    forceEnablePlugins: [...DEFAULT_KNIP_FORCE_ENABLE_PLUGINS],
    timeoutMs: 300_000,
  },
  dependencyCruiser: {
    enabled: true,
    includeTypeOnly: true,
    exclude: '(^|/)(node_modules|dist|build|coverage)/',
    doNotFollow: 'node_modules',
    timeoutMs: 300_000,
  },
  confidence: {
    knipFile: 0.9,
    knipExport: 0.6,
    knipType: 0.5,
    cycle: 0.85,
    cycleTypeOnly: 0.6,
    largeFile: 0.95,
  },
  dismissible: {
    knipFile: true,
    knipExport: true,
    knipType: true,
    cycle: true,
    largeFile: false,
  },
  sharedIgnore: [...DEFAULT_SHARED_IGNORE],
};

/** Deep partial for ergonomic overrides. */
export type DetectionConfigOverride = {
  mode?: ScanMode;
  knip?: Partial<KnipEngineConfig>;
  dependencyCruiser?: Partial<DependencyCruiserEngineConfig>;
  confidence?: Partial<ConfidenceConfig>;
  dismissible?: Partial<DismissibleConfig>;
  sharedIgnore?: string[];
};

/**
 * Merge a partial override onto the defaults and apply mode semantics.
 *
 * In `library` mode, `exports` / `types` / `nsExports` / `nsTypes` are stripped
 * from knip's issue types (a library's public API is not dead code), unless the
 * caller explicitly set `knip.issueTypes`.
 */
export function resolveDetectionConfig(override: DetectionConfigOverride = {}): DetectionConfig {
  const base = DEFAULT_DETECTION_CONFIG;

  const mode = override.mode ?? base.mode;

  const explicitIssueTypes = override.knip?.issueTypes;
  let issueTypes = explicitIssueTypes ?? base.knip.issueTypes;
  if (mode === 'library' && !explicitIssueTypes) {
    const exportLike = new Set<KnipIssueType>(['exports', 'types', 'nsExports', 'nsTypes']);
    issueTypes = issueTypes.filter((t) => !exportLike.has(t));
  }

  return {
    mode,
    knip: {
      ...base.knip,
      ...override.knip,
      issueTypes: [...issueTypes],
      ignore: override.knip?.ignore ?? [...base.knip.ignore],
      defaultEntry: override.knip?.defaultEntry ?? [...base.knip.defaultEntry],
      extraEntry: override.knip?.extraEntry ?? [...base.knip.extraEntry],
      forceEnablePlugins:
        override.knip?.forceEnablePlugins ?? [...base.knip.forceEnablePlugins],
    },
    dependencyCruiser: { ...base.dependencyCruiser, ...override.dependencyCruiser },
    confidence: { ...base.confidence, ...override.confidence },
    dismissible: { ...base.dismissible, ...override.dismissible },
    sharedIgnore: override.sharedIgnore ?? [...base.sharedIgnore],
  };
}
