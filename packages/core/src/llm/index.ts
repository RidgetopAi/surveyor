/**
 * LLM module — the pluggable AI seam for behavioral analysis.
 *
 * Public surface: the provider interface, the two adapters, and the config-driven
 * selection. Consumers depend on `LLMProvider` + `createProviderFromEnv`, never on
 * a concrete backend — that is what makes provider/model swappable by config alone.
 */

export type {
  LLMProvider,
  DescribeFunctionInput,
  DescribeFunctionResult,
} from './provider.js';

export {
  type LLMConfig,
  type LLMProviderKind,
  LLM_CONFIG_DEFAULTS,
  loadLLMConfigFromEnv,
  createProvider,
  createProviderFromEnv,
  isProviderConfigured,
} from './config.js';

export { AnthropicProvider } from './anthropic-provider.js';
export { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export {
  DEFAULT_SYSTEM_PROMPT,
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_TOOL_NAME,
  BEHAVIORAL_FLAG_KEYS,
  buildUserPrompt,
  normalizeAnalysis,
} from './prompt.js';
