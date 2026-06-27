/**
 * knip adapter — runs knip against a target repo and returns its raw JSON report.
 *
 * knip detects unused files / exports / types using the TypeScript compiler, so
 * (unlike a name-based detector) it does NOT mis-flag symbols reached via lazy /
 * dynamic imports, property access, or object-map dispatch. We feed it an
 * auto-derived config (see target-config.ts) and parse `--reporter json`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DetectionConfig } from './detection-config.js';
import type { KnipJsonReport } from './engine-output.types.js';
import { deriveKnipConfig } from './target-config.js';
import { resolvePackageBinary, runJsonTool } from './run-engine.js';

/** Relative path to knip's bin within its package. */
const KNIP_BIN = 'bin/knip.js';

/**
 * Run knip on `projectPath`. Writes the derived config to a temp file, invokes
 * the CLI with cwd === projectPath, and returns the parsed report. The temp file
 * is always cleaned up.
 */
export async function runKnip(
  projectPath: string,
  config: DetectionConfig
): Promise<KnipJsonReport> {
  const absProject = path.resolve(projectPath);
  const knipConfig = deriveKnipConfig(absProject, config);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surveyor-knip-'));
  const configPath = path.join(tmpDir, 'knip.json');
  fs.writeFileSync(configPath, JSON.stringify(knipConfig, null, 2));

  try {
    const binPath = resolvePackageBinary('knip', KNIP_BIN);
    const report = await runJsonTool<KnipJsonReport>({
      binPath,
      args: ['--reporter', 'json', '--config', configPath, '--no-exit-code'],
      cwd: absProject,
      timeoutMs: config.knip.timeoutMs,
      label: 'knip',
    });

    if (!report || !Array.isArray(report.issues)) {
      throw new Error('knip report missing expected "issues" array');
    }
    return report;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
