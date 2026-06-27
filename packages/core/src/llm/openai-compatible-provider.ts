/**
 * OpenAICompatibleProvider — the OpenAI chat-completions wire shape.
 *
 * Covers xAI / OpenAI AND local Ollama (http://localhost:11434/v1). This is the
 * refactored home of the old llm-client.ts logic, so the previous behavior stays
 * reachable purely by config (provider=openai-compatible).
 *
 * Improvements over the old client:
 *  - asks for JSON via response_format json_object (OpenAI + Ollama honor it);
 *  - 429/5xx retry with exponential backoff (fetch has none of its own);
 *  - sends `temperature` ONLY when explicitly configured;
 *  - normalizes output through the shared normalizeAnalysis (with a tolerant
 *    fence-strip fallback for backends that wrap JSON in markdown).
 */

import type { LLMConfig } from './config.js';
import type {
  DescribeFunctionInput,
  DescribeFunctionResult,
  LLMProvider,
} from './provider.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  buildUserPrompt,
  normalizeAnalysis,
} from './prompt.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Resolve the full chat-completions URL from a base (append the path if absent). */
function resolveChatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  readonly model: string;

  private readonly config: LLMConfig;
  private readonly url: string;
  private readonly systemPrompt: string;

  constructor(config: LLMConfig) {
    if (!config.baseURL) {
      throw new Error('OpenAICompatibleProvider requires a baseURL (set SURVEYOR_LLM_BASE_URL).');
    }
    this.config = config;
    this.model = config.model;
    this.url = resolveChatCompletionsUrl(config.baseURL);
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  async describeFunction(input: DescribeFunctionInput): Promise<DescribeFunctionResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: buildUserPrompt(input, this.config.maxCodeLength) },
    ];

    const raw = await this.chat(messages);
    return normalizeAnalysis(this.extractJson(raw));
  }

  /** POST to chat/completions with timeout + retry/backoff on 429 & 5xx. */
  private async chat(messages: ChatMessage[]): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.config.maxTokens,
      // Ask for JSON; OpenAI and Ollama both honor this. Harmless if ignored.
      response_format: { type: 'json_object' },
    };
    // Only send temperature when explicitly configured.
    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.apiKey) {
          headers.Authorization = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(this.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          // Retry transient classes; fail fast on 4xx (except 429).
          if ((response.status === 429 || response.status >= 500) && attempt < this.config.maxRetries) {
            lastError = new Error(`LLM API error ${response.status}: ${errorText}`);
            await sleep(this.backoffMs(attempt));
            continue;
          }
          throw new Error(`LLM API error ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as ChatCompletionResponse;
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('No content in LLM response');
        }
        return content;
      } catch (err) {
        // Abort/network errors are retryable up to the limit.
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const retryable = isAbort || (err instanceof TypeError); // fetch network failures are TypeError
        if (retryable && attempt < this.config.maxRetries) {
          lastError = err;
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM request failed');
  }

  /** Exponential backoff with jitter: ~250ms, 500ms, 1000ms ... */
  private backoffMs(attempt: number): number {
    const base = 250 * 2 ** attempt;
    return base + Math.floor(Math.random() * 100);
  }

  /** Parse JSON, tolerating a markdown ```json fence some backends still emit. */
  private extractJson(response: string): unknown {
    const trimmed = response.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced && fenced[1]) {
        return JSON.parse(fenced[1].trim());
      }
      throw new Error('LLM response was not valid JSON');
    }
  }
}
