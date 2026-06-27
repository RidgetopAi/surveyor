/**
 * Detection module — trustworthy problem-flagging via battle-tested engines.
 *
 * `runExternalDetection` is the single entry point: it auto-configures and runs
 * knip + dependency-cruiser against a target repo and maps their output into the
 * Surveyor Warning model. Each engine runs best-effort — if one fails (or the
 * target can't be analysed), its error is recorded and returned rather than
 * aborting the scan, so the rest of the analysis still ships.
 */

import type { NodeMap } from '../types/node.types.js';
import type { Warning } from '../types/warning.types.js';
import {
  resolveDetectionConfig,
  type DetectionConfig,
  type DetectionConfigOverride,
} from './detection-config.js';
import { runKnip } from './knip-adapter.js';
import { runDependencyCruiser } from './dependency-cruiser-adapter.js';
import { buildNodeResolver, mapKnipReport, mapDepCruiseReport } from './warning-mapper.js';

export interface EngineError {
  engine: 'knip' | 'dependency-cruiser';
  message: string;
}

export interface ExternalDetectionResult {
  warnings: Warning[];
  /** Engines that failed (best-effort degrade). Empty on full success. */
  engineErrors: EngineError[];
  /** The fully-resolved config actually used (for logging / reproducibility). */
  config: DetectionConfig;
}

/**
 * Run the external detection engines against `projectPath` and map their output
 * into warnings, linked to scan nodes via `nodes`.
 */
export async function runExternalDetection(
  projectPath: string,
  nodes: NodeMap,
  override: DetectionConfigOverride = {}
): Promise<ExternalDetectionResult> {
  const config = resolveDetectionConfig(override);
  const resolve = buildNodeResolver(nodes);
  const detectedAt = new Date().toISOString();
  const warnings: Warning[] = [];
  const engineErrors: EngineError[] = [];

  const tasks: Promise<void>[] = [];

  if (config.knip.enabled) {
    tasks.push(
      runKnip(projectPath, config)
        .then((report) => {
          warnings.push(...mapKnipReport(report, config, resolve, detectedAt));
        })
        .catch((err: unknown) => {
          engineErrors.push({
            engine: 'knip',
            message: err instanceof Error ? err.message : String(err),
          });
        })
    );
  }

  if (config.dependencyCruiser.enabled) {
    tasks.push(
      runDependencyCruiser(projectPath, config)
        .then((report) => {
          warnings.push(...mapDepCruiseReport(report, config, resolve, detectedAt));
        })
        .catch((err: unknown) => {
          engineErrors.push({
            engine: 'dependency-cruiser',
            message: err instanceof Error ? err.message : String(err),
          });
        })
    );
  }

  await Promise.all(tasks);

  return { warnings, engineErrors, config };
}

export {
  resolveDetectionConfig,
  DEFAULT_DETECTION_CONFIG,
  DEFAULT_SHARED_IGNORE,
} from './detection-config.js';
export type {
  DetectionConfig,
  DetectionConfigOverride,
  ScanMode,
  KnipIssueType,
  KnipEngineConfig,
  DependencyCruiserEngineConfig,
  ConfidenceConfig,
  DismissibleConfig,
} from './detection-config.js';
export { runKnip } from './knip-adapter.js';
export { runDependencyCruiser, buildDepCruiseConfig } from './dependency-cruiser-adapter.js';
export {
  buildNodeResolver,
  mapKnipReport,
  mapDepCruiseReport,
  type NodeResolver,
} from './warning-mapper.js';
export {
  discoverWorkspaces,
  deriveKnipConfig,
  deriveDepCruiseTargets,
  findTsConfig,
} from './target-config.js';
export { resolvePackageBinary, runJsonTool } from './run-engine.js';
export type {
  KnipJsonReport,
  KnipFileEntry,
  KnipSymbolIssue,
  DepCruiseJsonReport,
  DepCruiseViolation,
} from './engine-output.types.js';
