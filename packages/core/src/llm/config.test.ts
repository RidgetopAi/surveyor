/**
 * Config-driven selection test — proves provider/model swap is PURELY config.
 *
 * loadLLMConfigFromEnv is pure (takes an env object), so no global env mutation.
 * The key assertion: the SAME createProvider() call, fed only different env,
 * yields AnthropicProvider vs OpenAICompatibleProvider — zero code change.
 */

import { describe, it, expect } from 'vitest';
import {
  loadLLMConfigFromEnv,
  createProvider,
  isProviderConfigured,
  LLM_CONFIG_DEFAULTS,
} from './config.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

describe('loadLLMConfigFromEnv defaults', () => {
  it('defaults to anthropic + claude-haiku-4-5 (Brian locked default)', () => {
    const cfg = loadLLMConfigFromEnv({});
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-haiku-4-5');
    expect(cfg.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(cfg.requiresApiKey).toBe(true);
    // Temperature is OFF by default (Anthropic 400s on sampling params).
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.maxTokens).toBe(LLM_CONFIG_DEFAULTS.maxTokens);
  });

  it('reads the anthropic key from ANTHROPIC_API_KEY', () => {
    const cfg = loadLLMConfigFromEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    expect(cfg.apiKey).toBe('sk-test');
    expect(isProviderConfigured(cfg)).toBe(true);
  });
});

describe('config-driven provider selection (zero code change)', () => {
  it('env → AnthropicProvider', () => {
    const cfg = loadLLMConfigFromEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    const provider = createProvider(cfg);
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe('claude-haiku-4-5');
  });

  it('env → OpenAICompatibleProvider pointed at Ollama (no key needed, loopback)', () => {
    const cfg = loadLLMConfigFromEnv({
      SURVEYOR_LLM_PROVIDER: 'openai-compatible',
      SURVEYOR_LLM_BASE_URL: 'http://localhost:11434/v1',
      SURVEYOR_LLM_MODEL: 'qwen2.5:1.5b',
    });
    expect(cfg.requiresApiKey).toBe(false); // loopback → keyless
    expect(isProviderConfigured(cfg)).toBe(true);
    const provider = createProvider(cfg);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe('openai-compatible');
    expect(provider.model).toBe('qwen2.5:1.5b');
  });

  it('THE swap: anthropic vs openai-compatible+ollama differ ONLY in env, not code', () => {
    const buildProvider = (env: Record<string, string | undefined>) =>
      createProvider(loadLLMConfigFromEnv(env));

    const a = buildProvider({ ANTHROPIC_API_KEY: 'sk-test' });
    const b = buildProvider({
      SURVEYOR_LLM_PROVIDER: 'openai-compatible',
      SURVEYOR_LLM_BASE_URL: 'http://localhost:11434/v1',
      SURVEYOR_LLM_MODEL: 'llama3.2:3b',
    });

    expect(a.name).toBe('anthropic');
    expect(b.name).toBe('openai-compatible');
  });

  it('a remote openai-compatible endpoint requires a key by default', () => {
    const cfg = loadLLMConfigFromEnv({
      SURVEYOR_LLM_PROVIDER: 'openai-compatible',
      SURVEYOR_LLM_BASE_URL: 'https://api.x.ai/v1',
      SURVEYOR_LLM_MODEL: 'grok-3',
    });
    expect(cfg.requiresApiKey).toBe(true);
    expect(isProviderConfigured(cfg)).toBe(false); // no key set
    expect(() => createProvider(cfg)).toThrow(/API key required/);
  });

  it('honors legacy SURVEYOR_LLM_ENDPOINT as a base URL (back-compat)', () => {
    const cfg = loadLLMConfigFromEnv({
      SURVEYOR_LLM_PROVIDER: 'openai-compatible',
      SURVEYOR_LLM_ENDPOINT: 'http://localhost:11434/v1/chat/completions',
      SURVEYOR_LLM_MODEL: 'qwen2.5:1.5b',
    });
    expect(cfg.baseURL).toBe('http://localhost:11434/v1/chat/completions');
    expect(cfg.requiresApiKey).toBe(false);
  });

  it('lets a custom env var name supply the key (SURVEYOR_LLM_API_KEY_ENV)', () => {
    const cfg = loadLLMConfigFromEnv({
      SURVEYOR_LLM_API_KEY_ENV: 'MY_KEY',
      MY_KEY: 'secret-123',
    });
    expect(cfg.apiKeyEnvVar).toBe('MY_KEY');
    expect(cfg.apiKey).toBe('secret-123');
  });

  it('parses numeric + temperature tunables from env', () => {
    const cfg = loadLLMConfigFromEnv({
      SURVEYOR_LLM_PROVIDER: 'openai-compatible',
      SURVEYOR_LLM_BASE_URL: 'http://localhost:11434/v1',
      SURVEYOR_LLM_MODEL: 'x',
      SURVEYOR_LLM_MAX_TOKENS: '512',
      SURVEYOR_LLM_CONCURRENCY: '8',
      SURVEYOR_LLM_TEMPERATURE: '0.2',
    });
    expect(cfg.maxTokens).toBe(512);
    expect(cfg.concurrency).toBe(8);
    expect(cfg.temperature).toBe(0.2);
  });
});
