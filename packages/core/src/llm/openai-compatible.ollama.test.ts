/**
 * REAL-SURFACE SMOKE — OpenAICompatibleProvider against on-box Ollama.
 *
 * Proves the pluggable seam end-to-end AND the future cheap/self-hosted tier:
 * a REAL local model returns a valid {summary, flags} through the SAME
 * OpenAI-compatible adapter (and the SAME assertProviderContract) the product
 * uses. Free, no API key (Ollama on http://localhost:11434/v1).
 *
 * Self-gating: if Ollama isn't reachable or has no usable chat model, the test
 * SKIPS with a clear log rather than failing. On a box with Ollama it RUNS and
 * is the real proof.
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { loadLLMConfigFromEnv, createProvider } from './config.js';
import { assertProviderContract } from './fake-provider.testkit.js';

const OLLAMA_BASE = 'http://localhost:11434/v1';
const PREFERRED = ['qwen2.5:1.5b', 'qwen2.5:3b', 'llama3.2:3b'];

let chatModel: string | null = null;
let reason = '';

async function probe(): Promise<void> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE}/models`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      reason = `Ollama /models returned ${res.status}`;
      return;
    }
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const ids = (data.data ?? []).map((m) => m.id);
    // Exclude embedding-only models (can't do chat completions).
    const chatable = ids.filter((id) => !/embed/i.test(id));
    chatModel =
      PREFERRED.find((p) => chatable.includes(p)) ?? chatable[0] ?? null;
    if (!chatModel) reason = `Ollama reachable but no chat model (have: ${ids.join(', ') || 'none'})`;
  } catch (err) {
    reason = `Ollama not reachable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

beforeAll(async () => {
  await probe();
});

describe('OpenAICompatibleProvider → real Ollama (cheap/self-hosted tier)', () => {
  it(
    'returns a real {summary, flags} for a function with side effects',
    async (ctx) => {
      if (!chatModel) {
        console.warn(`[ollama smoke] SKIPPED — ${reason}`);
        ctx.skip();
        return;
      }
      console.log(`[ollama smoke] using model=${chatModel} at ${OLLAMA_BASE}`);

      // Built PURELY via the config seam (provider=openai-compatible + base URL),
      // exactly as a user would swap to a self-hosted tier.
      const config = loadLLMConfigFromEnv({
        SURVEYOR_LLM_PROVIDER: 'openai-compatible',
        SURVEYOR_LLM_BASE_URL: OLLAMA_BASE,
        SURVEYOR_LLM_MODEL: chatModel,
        SURVEYOR_LLM_TEMPERATURE: '0',
        SURVEYOR_LLM_TIMEOUT: '90000',
        SURVEYOR_LLM_MAX_TOKENS: '512',
      });
      expect(config.requiresApiKey).toBe(false); // loopback → keyless

      const provider = createProvider(config);
      expect(provider.name).toBe('openai-compatible');

      // Same contract assertion the FakeProvider passes — one contract, both ends.
      const result = await assertProviderContract(provider);

      console.log(
        `[ollama smoke] summary="${result.summary}" flags=${JSON.stringify(result.flags)}`,
      );

      // A real model on a file-writing function should produce a non-trivial summary.
      expect(result.summary.length).toBeGreaterThan(3);
    },
    120000,
  );
});
