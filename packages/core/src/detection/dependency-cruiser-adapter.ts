/**
 * dependency-cruiser adapter — detects dependency cycles in a target repo.
 *
 * dependency-cruiser resolves modules through the target's tsconfig (path
 * aliases, extensions, all import kinds), which is why it catches real cycles our
 * name-based detector missed (measured: 9 real cycles on ra-mandrel vs 0 from the
 * hand-rolled detector). We generate a config carrying a `no-circular` rule and
 * parse `--output-type json`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DetectionConfig } from './detection-config.js';
import type { DepCruiseJsonReport } from './engine-output.types.js';
import { deriveDepCruiseTargets, findTsConfig } from './target-config.js';
import { resolvePackageBinary, runJsonTool } from './run-engine.js';

/** Relative path to dependency-cruiser's bin within its package. */
const DEPCRUISE_BIN = 'bin/dependency-cruise.mjs';

/**
 * Build the dependency-cruiser config object (the `no-circular` rule + resolution
 * options). Exported for testability.
 */
export function buildDepCruiseConfig(
  projectPath: string,
  config: DetectionConfig
): Record<string, unknown> {
  const tsConfig = findTsConfig(projectPath);
  const dcConfig: Record<string, unknown> = {
    forbidden: [
      {
        name: 'no-circular',
        severity: 'warn',
        comment: 'Dependency cycle detected',
        from: {},
        to: { circular: true },
      },
    ],
    options: {
      doNotFollow: { path: config.dependencyCruiser.doNotFollow },
      exclude: { path: config.dependencyCruiser.exclude },
      tsPreCompilationDeps: config.dependencyCruiser.includeTypeOnly,
      ...(tsConfig ? { tsConfig: { fileName: tsConfig } } : {}),
    },
  };
  return dcConfig;
}

/**
 * Run dependency-cruiser on `projectPath` and return the parsed report. Writes
 * the generated config to a temp file (cleaned up afterwards) and runs with
 * cwd === projectPath so TS resolution uses the target's tsconfig.
 */
export async function runDependencyCruiser(
  projectPath: string,
  config: DetectionConfig
): Promise<DepCruiseJsonReport> {
  const absProject = path.resolve(projectPath);
  const targets = deriveDepCruiseTargets(absProject);
  const dcConfig = buildDepCruiseConfig(absProject, config);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-depcruise-'));
  const configPath = path.join(tmpDir, 'dependency-cruiser.json');
  fs.writeFileSync(configPath, JSON.stringify(dcConfig, null, 2));

  try {
    const binPath = resolvePackageBinary('dependency-cruiser', DEPCRUISE_BIN);
    const report = await runJsonTool<DepCruiseJsonReport>({
      binPath,
      args: [...targets, '--config', configPath, '--output-type', 'json'],
      cwd: absProject,
      timeoutMs: config.dependencyCruiser.timeoutMs,
      label: 'dependency-cruiser',
    });

    if (!report || !report.summary || !Array.isArray(report.summary.violations)) {
      throw new Error('dependency-cruiser report missing expected summary.violations');
    }
    return report;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
