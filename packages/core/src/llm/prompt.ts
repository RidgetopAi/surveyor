/**
 * Behavioral-summary prompt + the structured-output schema + a single response
 * normalizer shared by every provider.
 *
 * The prompt lives in code (single runtime source of truth) and is overridable
 * via LLMConfig.systemPrompt (configs-not-hardcoded). It deliberately does NOT
 * live in prompts/*.md at runtime: those markdown files are unshipped design docs
 * (the package ships only `dist`), and parsing fenced sections out of markdown is
 * exactly the brittle string-surgery this rebuild removes. See
 * prompts/behavioral-summary.md for the design reference.
 */

import type { BehavioralFlags } from '../types/node.types.js';
import type { DescribeFunctionInput, DescribeFunctionResult } from './provider.js';

/** The behavioral flag keys, in a single canonical list (no drift between sites). */
export const BEHAVIORAL_FLAG_KEYS = [
  'databaseRead',
  'databaseWrite',
  'httpCall',
  'fileRead',
  'fileWrite',
  'sendsNotification',
  'modifiesGlobalState',
  'hasSideEffects',
] as const satisfies ReadonlyArray<keyof BehavioralFlags>;

/**
 * Default system prompt. Describes the task and the flag semantics. The structured
 * output (Anthropic tool schema / OpenAI json mode) enforces the SHAPE; this prompt
 * supplies the SEMANTICS.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a code analyzer. Read a single TypeScript/JavaScript function and describe its behavior.

Produce:
1. summary: a one-line description of WHAT the function does (not how), active voice, max 100 chars.
2. flags: booleans describing observable side effects.

Flag definitions:
- databaseRead: Reads from a database (SELECT, find, get queries).
- databaseWrite: Writes to a database (INSERT, UPDATE, DELETE, save, create).
- httpCall: Makes outbound HTTP/network requests (fetch, axios, http client).
- fileRead: Reads from the filesystem (readFile, createReadStream).
- fileWrite: Writes to the filesystem (writeFile, createWriteStream).
- sendsNotification: Sends emails, push notifications, or SMS.
- modifiesGlobalState: Mutates global/singleton/module-level state.
- hasSideEffects: True if ANY other flag is true OR the function mutates external state.

If unsure about a flag, set it to false.`;

/**
 * JSON Schema for the {summary, flags} object. Used directly as the Anthropic tool
 * input_schema (structured output) and as the contract the OpenAI-compatible json
 * mode is asked to honor.
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'One-line description of what the function does (max 100 chars).',
    },
    flags: {
      type: 'object',
      properties: Object.fromEntries(
        BEHAVIORAL_FLAG_KEYS.map((k) => [k, { type: 'boolean' }]),
      ),
      required: [...BEHAVIORAL_FLAG_KEYS],
      additionalProperties: false,
    },
  },
  required: ['summary', 'flags'],
  additionalProperties: false,
} as const;

/** The tool name used for Anthropic structured output. */
export const ANALYSIS_TOOL_NAME = 'record_function_analysis';

/**
 * Build the user-message text for a function. Truncates very long bodies so we stay
 * within token budget (length is config-driven via maxCodeLength).
 */
export function buildUserPrompt(input: DescribeFunctionInput, maxCodeLength: number): string {
  const { functionName, functionCode, filePath } = input;
  const truncated =
    functionCode.length > maxCodeLength
      ? functionCode.slice(0, maxCodeLength) + '\n// ... truncated'
      : functionCode;

  return `Analyze this function:

File: ${filePath}
Function: ${functionName}

\`\`\`typescript
${truncated}
\`\`\``;
}

/**
 * Normalize an arbitrary parsed object into a valid {@link DescribeFunctionResult}.
 *
 * This is the SINGLE place flags get coerced to booleans and hasSideEffects is
 * derived — shared by both providers so structured and json-mode outputs converge
 * on identical semantics. Throws if `summary` is unusable so the caller can decide
 * how to degrade (rather than silently emitting a bogus summary).
 */
export function normalizeAnalysis(raw: unknown): DescribeFunctionResult {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('LLM analysis output was not an object');
  }
  const obj = raw as Record<string, unknown>;
  const rawFlags = (obj.flags ?? {}) as Record<string, unknown>;

  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
    throw new Error('LLM analysis output missing a usable "summary"');
  }
  const summary = obj.summary.slice(0, 150);

  const flags: BehavioralFlags = {
    databaseRead: Boolean(rawFlags.databaseRead),
    databaseWrite: Boolean(rawFlags.databaseWrite),
    httpCall: Boolean(rawFlags.httpCall),
    fileRead: Boolean(rawFlags.fileRead),
    fileWrite: Boolean(rawFlags.fileWrite),
    sendsNotification: Boolean(rawFlags.sendsNotification),
    modifiesGlobalState: Boolean(rawFlags.modifiesGlobalState),
    hasSideEffects: Boolean(rawFlags.hasSideEffects),
  };

  // hasSideEffects is implied by any concrete effect.
  if (!flags.hasSideEffects) {
    flags.hasSideEffects =
      flags.databaseRead ||
      flags.databaseWrite ||
      flags.httpCall ||
      flags.fileRead ||
      flags.fileWrite ||
      flags.sendsNotification ||
      flags.modifiesGlobalState;
  }

  return { summary, flags };
}
