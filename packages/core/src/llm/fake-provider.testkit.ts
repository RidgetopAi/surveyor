/**
 * Faithful FAKE provider + a shared provider CONTRACT assertion.
 *
 * This is a TEST helper (*.testkit.ts → excluded from the build, never shipped).
 * The fake is "faithful": it returns through the SAME normalizeAnalysis path the
 * real providers use, so it CANNOT diverge from the {summary, flags} contract. It
 * is the always-on, no-network gate. The contract assertion is also run against the
 * REAL OpenAI-compatible provider in the Ollama smoke, so one contract pins both.
 */

import type {
  DescribeFunctionInput,
  DescribeFunctionResult,
  LLMProvider,
} from './provider.js';
import { normalizeAnalysis } from './prompt.js';
import { expect } from 'vitest';

/** Heuristic the fake uses to set flags from code text (deterministic, offline). */
function inferFlags(code: string): Record<string, boolean> {
  return {
    databaseRead: /\b(select|find|findOne|query|getBy)\b/i.test(code),
    databaseWrite: /\b(insert|update|delete|save|create)\b/i.test(code),
    httpCall: /\b(fetch|axios|http)\b/i.test(code),
    fileRead: /\b(readFile|createReadStream|readFileSync)\b/i.test(code),
    fileWrite: /\b(writeFile|createWriteStream|writeFileSync)\b/i.test(code),
    sendsNotification: /\b(sendMail|sendEmail|notify|sms|push)\b/i.test(code),
    modifiesGlobalState: /\bglobal\b|process\.env\s*=/i.test(code),
    hasSideEffects: false,
  };
}

/**
 * A deterministic, offline LLMProvider. Optionally fails on demand (to exercise the
 * caller's error handling) and counts calls (to prove the worker pool routes here).
 */
export class FakeProvider implements LLMProvider {
  readonly name = 'fake';
  readonly model: string;
  calls = 0;
  private readonly failOn: Set<string>;

  constructor(opts: { model?: string; failOn?: string[] } = {}) {
    this.model = opts.model ?? 'fake-model-1';
    this.failOn = new Set(opts.failOn ?? []);
  }

  async describeFunction(input: DescribeFunctionInput): Promise<DescribeFunctionResult> {
    this.calls++;
    if (this.failOn.has(input.functionName)) {
      throw new Error(`FakeProvider: forced failure for ${input.functionName}`);
    }
    // Route through the real normalizer — same contract as the live providers.
    return normalizeAnalysis({
      summary: `Function ${input.functionName} in ${input.filePath}`.slice(0, 100),
      flags: inferFlags(input.functionCode),
    });
  }
}

/**
 * Assert that a provider honors the {summary, flags} contract for a real-ish input.
 * Shared by the fake-contract test and the live Ollama smoke.
 */
export async function assertProviderContract(provider: LLMProvider): Promise<DescribeFunctionResult> {
  const result = await provider.describeFunction({
    functionName: 'saveReport',
    filePath: 'src/reports.ts',
    functionCode: [
      'async function saveReport(report) {',
      '  const fs = require("fs");',
      '  fs.writeFileSync("/tmp/report.json", JSON.stringify(report));',
      '  return true;',
      '}',
    ].join('\n'),
  });

  // summary: non-empty string.
  expect(typeof result.summary).toBe('string');
  expect(result.summary.length).toBeGreaterThan(0);

  // flags: all 8 keys present as booleans.
  const flagKeys = [
    'databaseRead',
    'databaseWrite',
    'httpCall',
    'fileRead',
    'fileWrite',
    'sendsNotification',
    'modifiesGlobalState',
    'hasSideEffects',
  ] as const;
  for (const key of flagKeys) {
    expect(typeof result.flags[key]).toBe('boolean');
  }

  // Invariant: any concrete effect implies hasSideEffects.
  const anyConcrete =
    result.flags.databaseRead ||
    result.flags.databaseWrite ||
    result.flags.httpCall ||
    result.flags.fileRead ||
    result.flags.fileWrite ||
    result.flags.sendsNotification ||
    result.flags.modifiesGlobalState;
  if (anyConcrete) {
    expect(result.flags.hasSideEffects).toBe(true);
  }

  return result;
}
