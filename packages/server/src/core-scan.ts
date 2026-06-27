/**
 * Real scan implementation wired to @surveyor/core.
 *
 * Key P4a fix (Inspector P0): scan outputs + the AI cache are written to the
 * PER-JOB WORKSPACE (`job.workspaceDir`), never inside the scanned tree. The old
 * server wrote `<projectPath>/.surveyor/...` — mutating the customer's repo. Now
 * nothing is written under `projectPath`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  scanProject,
  analyzeBehavior,
  loadLLMConfigFromEnv,
  isProviderConfigured,
  createProvider,
  type ScanResult,
} from '@surveyor/core';
import type { ScanFn } from './scan-runner.js';

/**
 * Build the production ScanFn. `env` is injectable for testing the LLM-config
 * branch without touching globals.
 */
export function makeCoreScanFn(env: NodeJS.ProcessEnv = process.env): ScanFn {
  return async (job, onProgress) => {
    const { projectPath, options, workspaceDir, id: jobId } = job;

    fs.mkdirSync(workspaceDir, { recursive: true });

    const detectionMode: 'app' | 'library' = options.mode === 'library' ? 'library' : 'app';
    const enableDetection = options.detect !== false;

    let result: ScanResult = await scanProject(projectPath, {
      verbose: false,
      ...(enableDetection ? { detection: { mode: detectionMode } } : {}),
      onProgress: (progress) => onProgress(progress),
    });

    // Stamp our pre-assigned job id onto the result.
    result = { ...result, id: jobId };

    // Behavioral analysis only if a provider is configured and not skipped.
    const llmConfig = loadLLMConfigFromEnv(env);
    const skipAnalysis = options.skipAnalysis ?? !isProviderConfigured(llmConfig);

    if (!skipAnalysis && isProviderConfigured(llmConfig)) {
      const provider = createProvider(llmConfig);
      result = await analyzeBehavior(result, provider, {
        onProgress: (p) =>
          onProgress({
            phase: 'analyzing',
            current: p.current,
            total: p.total,
            functionName: p.functionName,
            filePath: p.filePath,
            fromCache: p.fromCache,
          }),
        // AI cache → per-job workspace, NOT the scanned tree.
        cacheDir: workspaceDir,
        concurrency: llmConfig.concurrency,
      });
    }

    // Persist the result into the workspace (not the scanned tree). This is a
    // convenience artifact for debugging / handoff; the canonical copy is the one
    // returned to the caller (Mandrel persists durably in P4b).
    try {
      fs.writeFileSync(
        path.join(workspaceDir, `scan-${jobId}.json`),
        JSON.stringify(result, null, 2),
      );
    } catch {
      // A failure to write the debug artifact must not fail the scan.
    }

    return result;
  };
}
