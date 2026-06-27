/**
 * LLMProvider seam — the pluggable AI boundary for behavioral analysis.
 *
 * Every concrete backend (Anthropic, any OpenAI-compatible API including local
 * Ollama) implements this ONE interface. The behavioral analyzer depends only on
 * this seam, so the provider/model is swappable by CONFIG with zero code change.
 */

import type { BehavioralFlags } from '../types/node.types.js';

/**
 * Input to {@link LLMProvider.describeFunction}: a single function to summarize.
 * Mirrors what the old buildUserPrompt consumed (name, code, file path).
 */
export interface DescribeFunctionInput {
  /** The function's name (for the prompt context). */
  functionName: string;
  /** The raw source of the function body (may be truncated by the provider). */
  functionCode: string;
  /** The file the function lives in (for the prompt context). */
  filePath: string;
}

/**
 * The structured result every provider must return for a function.
 * This is the exact shape behavioral-analyzer needs to populate a
 * {@link import('../types/node.types.js').BehavioralSummary}.
 */
export interface DescribeFunctionResult {
  /** One-line, human-readable summary of what the function does. */
  summary: string;
  /** Detected behavioral side-effect flags. */
  flags: BehavioralFlags;
}

/**
 * The pluggable AI provider contract.
 *
 * Implementations MUST:
 *  - return a well-formed {@link DescribeFunctionResult} (valid summary + all 8
 *    flags present as booleans) for a successful call;
 *  - throw on transport/parse failure (the caller decides how to degrade) —
 *    never silently return a "failed" sentinel of their own invention.
 */
export interface LLMProvider {
  /** Stable provider id, e.g. 'anthropic' | 'openai-compatible'. Used in the cache key. */
  readonly name: string;
  /** Concrete model id in use, e.g. 'claude-haiku-4-5'. Used in the cache key. */
  readonly model: string;
  /** Analyze one function and return its structured behavioral description. */
  describeFunction(input: DescribeFunctionInput): Promise<DescribeFunctionResult>;
}
