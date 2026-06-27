/**
 * OPT-IN live smoke for AnthropicProvider (the default tier).
 *
 * Deliberately NOT a gate: the build env has no ANTHROPIC_API_KEY (the launcher
 * unsets it), so this SKIPS by default. Run it manually with a key to verify the
 * structured-output (tool-based) path against the real API:
 *
 *   ANTHROPIC_API_KEY=sk-... pnpm --filter @surveyor/core exec vitest run anthropic-provider.live
 */

import { describe, it, expect } from 'vitest';
import { loadLLMConfigFromEnv, createProvider } from './config.js';
import { assertProviderContract } from './fake-provider.testkit.js';

const hasKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasKey)('AnthropicProvider → real API (opt-in)', () => {
  it('returns structured {summary, flags} via the forced tool call', async () => {
    const config = loadLLMConfigFromEnv(process.env); // defaults: anthropic + haiku
    const provider = createProvider(config);
    expect(provider.name).toBe('anthropic');

    const result = await assertProviderContract(provider);
    console.log(`[anthropic live] model=${provider.model} summary="${result.summary}"`);
    expect(result.flags.fileWrite).toBe(true);
  }, 60000);
});
