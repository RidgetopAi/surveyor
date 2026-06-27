/**
 * Subprocess plumbing for the detection engines.
 *
 * Both knip and dependency-cruiser are invoked via their CLIs with a JSON
 * reporter rather than their programmatic APIs. Rationale (recorded for the
 * Inspector):
 *   - The JSON reporters are the STABLE, documented, version-resilient contract.
 *     knip's programmatic entry is internal and coupled to its CLI option
 *     parsing; running the CLI insulates us from that.
 *   - Running in a child process with `cwd === target` makes each tool resolve
 *     the TARGET's tsconfig / node_modules / framework config naturally — exactly
 *     what we need when scanning a repo we don't control.
 *   - One uniform "spawn + parse JSON" path keeps both adapters identical and
 *     isolates each tool's heavy module-graph traversal (and its own TypeScript
 *     version) from the Surveyor process.
 *
 * Both tools EXIT NON-ZERO when they find issues — that is success, not failure.
 * We therefore parse stdout regardless of exit code and only surface an error
 * when stdout is not valid JSON.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Resolve the absolute path to a package's bin script.
 *
 * We do NOT use `require.resolve(pkg)`: dependency-cruiser's `exports` map is
 * ESM-only (no `require`/`default` condition), so CJS resolution throws
 * "No exports main defined". Instead we walk up from this module looking for
 * `node_modules/<pkg>/package.json` (symlinks followed — handles pnpm's store),
 * which never touches the `exports` field.
 */
export function resolvePackageBinary(pkgName: string, binRelative: string): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (;;) {
    const pkgRoot = path.join(dir, 'node_modules', pkgName);
    const pj = path.join(pkgRoot, 'package.json');
    if (fs.existsSync(pj)) {
      const bin = path.join(pkgRoot, binRelative);
      if (!fs.existsSync(bin)) {
        throw new Error(`Found ${pkgName} at ${pkgRoot} but bin ${binRelative} is missing`);
      }
      return bin;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not locate node_modules/${pkgName} from ${fileURLToPath(import.meta.url)}`
      );
    }
    dir = parent;
  }
}

export interface RunJsonToolOptions {
  binPath: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  /** Label for error messages. */
  label: string;
}

/**
 * Run a JS CLI under the current Node binary, capture stdout, and parse it as
 * JSON. Resolves with the parsed value even when the tool exits non-zero, as
 * long as stdout is valid JSON. Rejects on spawn failure, timeout, or
 * unparseable output.
 */
export function runJsonTool<T = unknown>(options: RunJsonToolOptions): Promise<T> {
  const { binPath, args, cwd, timeoutMs, label } = options;

  return new Promise<T>((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env: process.env,
      // Inherit nothing on stdin; capture stdout/stderr.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label} failed to start: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (stdout.length === 0) {
        reject(
          new Error(
            `${label} produced no output (exit ${code}). stderr: ${stderr.slice(0, 1000) || '(empty)'}`
          )
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as T);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        reject(
          new Error(
            `${label} output was not valid JSON (exit ${code}): ${msg}. ` +
              `stderr: ${stderr.slice(0, 1000) || '(empty)'}`
          )
        );
      }
    });
  });
}
