/**
 * Config-driven LLM provider selection (configs-not-hardcoded).
 *
 * One named config (LLMConfig) describes provider, model, endpoint, which env var
 * holds the key, token/timeout/concurrency limits, etc. Everything is overridable
 * via SURVEYOR_LLM_* env. Swapping provider+model (e.g. Anthropic → local Ollama)
 * is PURELY a config change — no code edit.
 *
 * Defaults: provider=anthropic, model=claude-haiku-4-5 (Brian's locked default).
 */

import type { LLMProvider } from './provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

/** The supported provider kinds. */
export type LLMProviderKind = 'anthropic' | 'openai-compatible';

/** A complete, resolved LLM configuration. */
export interface LLMConfig {
  /** Which adapter to instantiate. */
  provider: LLMProviderKind;
  /** Concrete model id. */
  model: string;
  /**
   * Base URL. For 'openai-compatible' this is the API base (e.g.
   * http://localhost:11434/v1) — '/chat/completions' is appended if absent. For
   * 'anthropic' it overrides the SDK base URL (usually left undefined).
   */
  baseURL?: string;
  /** Name of the env var that holds the API key (e.g. ANTHROPIC_API_KEY). */
  apiKeyEnvVar: string;
  /** Resolved API key value (read from apiKeyEnvVar). May be empty for keyless backends (Ollama). */
  apiKey: string;
  /** Whether a non-empty apiKey is required to construct the provider. */
  requiresApiKey: boolean;
  /** Max tokens for the model response. */
  maxTokens: number;
  /** Per-request timeout (ms). */
  timeout: number;
  /** Worker-pool concurrency for bulk analysis. */
  concurrency: number;
  /** Max chars of function source sent per request (truncated beyond this). */
  maxCodeLength: number;
  /** Max transport retries on 429/5xx (Anthropic uses the SDK's own retry). */
  maxRetries: number;
  /**
   * Sampling temperature for OpenAI-compatible backends ONLY. Undefined => not sent.
   * Never sent to Anthropic (current Claude models 400 on sampling params).
   */
  temperature?: number;
  /** Optional system-prompt override (defaults to DEFAULT_SYSTEM_PROMPT). */
  systemPrompt?: string;
}

/** Built-in defaults. Brian's locked default tier is Anthropic Haiku. */
export const LLM_CONFIG_DEFAULTS = {
  provider: 'anthropic' as LLMProviderKind,
  anthropicModel: 'claude-haiku-4-5',
  openaiBaseURL: 'https://api.x.ai/v1',
  anthropicApiKeyEnvVar: 'ANTHROPIC_API_KEY',
  openaiApiKeyEnvVar: 'SURVEYOR_LLM_API_KEY',
  maxTokens: 1024,
  timeout: 30000,
  concurrency: 5,
  maxCodeLength: 2000,
  maxRetries: 2,
} as const;

type Env = Record<string, string | undefined>;

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatEnv(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** A loopback base URL (Ollama/local) needs no API key by default. */
function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Resolve an {@link LLMConfig} from environment variables. Pure: pass a custom env
 * for tests. No env mutation, no side effects.
 */
export function loadLLMConfigFromEnv(env: Env = process.env): LLMConfig {
  const provider: LLMProviderKind =
    env.SURVEYOR_LLM_PROVIDER === 'openai-compatible'
      ? 'openai-compatible'
      : env.SURVEYOR_LLM_PROVIDER === 'anthropic'
        ? 'anthropic'
        : LLM_CONFIG_DEFAULTS.provider;

  const isAnthropic = provider === 'anthropic';

  // Base URL: explicit BASE_URL wins, then legacy ENDPOINT (back-compat), then default.
  const baseURL =
    env.SURVEYOR_LLM_BASE_URL ||
    env.SURVEYOR_LLM_ENDPOINT ||
    (isAnthropic ? undefined : LLM_CONFIG_DEFAULTS.openaiBaseURL);

  const model =
    env.SURVEYOR_LLM_MODEL ||
    (isAnthropic ? LLM_CONFIG_DEFAULTS.anthropicModel : '');

  const apiKeyEnvVar =
    env.SURVEYOR_LLM_API_KEY_ENV ||
    (isAnthropic
      ? LLM_CONFIG_DEFAULTS.anthropicApiKeyEnvVar
      : LLM_CONFIG_DEFAULTS.openaiApiKeyEnvVar);

  const apiKey = env[apiKeyEnvVar] ?? '';

  // Keyless by default only for a loopback (Ollama) openai-compatible backend.
  const requiresApiKey = parseBoolEnv(
    env.SURVEYOR_LLM_API_KEY_REQUIRED,
    !(provider === 'openai-compatible' && isLoopbackUrl(baseURL)),
  );

  return {
    provider,
    model,
    baseURL,
    apiKeyEnvVar,
    apiKey,
    requiresApiKey,
    maxTokens: parseIntEnv(env.SURVEYOR_LLM_MAX_TOKENS, LLM_CONFIG_DEFAULTS.maxTokens),
    timeout: parseIntEnv(env.SURVEYOR_LLM_TIMEOUT, LLM_CONFIG_DEFAULTS.timeout),
    concurrency: parseIntEnv(env.SURVEYOR_LLM_CONCURRENCY, LLM_CONFIG_DEFAULTS.concurrency),
    maxCodeLength: parseIntEnv(env.SURVEYOR_LLM_MAX_CODE_LENGTH, LLM_CONFIG_DEFAULTS.maxCodeLength),
    maxRetries: parseIntEnv(env.SURVEYOR_LLM_MAX_RETRIES, LLM_CONFIG_DEFAULTS.maxRetries),
    // Temperature is OFF by default (Anthropic 400s on it; OpenAI-compatible uses
    // model default). Only sent when explicitly configured for openai-compatible.
    temperature: parseFloatEnv(env.SURVEYOR_LLM_TEMPERATURE),
    systemPrompt: env.SURVEYOR_LLM_SYSTEM_PROMPT || undefined,
  };
}

/** Whether a provider can actually be constructed/used given the resolved config. */
export function isProviderConfigured(config: LLMConfig): boolean {
  return !config.requiresApiKey || config.apiKey.trim().length > 0;
}

/**
 * The single selection point: map a config to a concrete provider. Adding a backend
 * is the ONLY place that needs a code change — selecting one never does.
 */
export function createProvider(config: LLMConfig): LLMProvider {
  if (config.requiresApiKey && config.apiKey.trim().length === 0) {
    throw new Error(
      `LLM API key required: set ${config.apiKeyEnvVar} (provider=${config.provider}).`,
    );
  }
  if (config.model.trim().length === 0) {
    throw new Error(
      `LLM model not set: set SURVEYOR_LLM_MODEL (provider=${config.provider}).`,
    );
  }

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config);
    default: {
      // Exhaustiveness guard.
      const exhaustive: never = config.provider;
      throw new Error(`Unknown LLM provider: ${String(exhaustive)}`);
    }
  }
}

/** Construct a provider straight from the environment (throws if misconfigured). */
export function createProviderFromEnv(env: Env = process.env): LLMProvider {
  return createProvider(loadLLMConfigFromEnv(env));
}
