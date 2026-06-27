/**
 * Provider CONTRACT test — the always-on, no-network gate.
 *
 * Pins the LLMProvider interface: input → {summary, flags} shape, all 8 flags as
 * booleans, the hasSideEffects invariant, and error propagation. Run against the
 * faithful FakeProvider here; the SAME assertProviderContract is run against the
 * REAL OpenAI-compatible provider in the Ollama smoke, so one contract pins both.
 */

import { describe, it, expect } from 'vitest';
import { FakeProvider, assertProviderContract } from './fake-provider.testkit.js';
import { normalizeAnalysis } from './prompt.js';

describe('LLMProvider contract (FakeProvider)', () => {
  it('returns a valid {summary, flags} for a function with a write side effect', async () => {
    const provider = new FakeProvider();
    const result = await assertProviderContract(provider);

    // The contract input writes a file → fileWrite + hasSideEffects must be set.
    expect(result.flags.fileWrite).toBe(true);
    expect(result.flags.hasSideEffects).toBe(true);
  });

  it('exposes stable name + model used for cache keying', () => {
    const provider = new FakeProvider({ model: 'fake-model-9' });
    expect(provider.name).toBe('fake');
    expect(provider.model).toBe('fake-model-9');
  });

  it('propagates errors (caller decides how to degrade — no silent sentinel)', async () => {
    const provider = new FakeProvider({ failOn: ['boom'] });
    await expect(
      provider.describeFunction({
        functionName: 'boom',
        filePath: 'src/x.ts',
        functionCode: 'function boom() {}',
      }),
    ).rejects.toThrow(/forced failure/);
  });

  it('infers no side effects for a pure function', async () => {
    const provider = new FakeProvider();
    const result = await provider.describeFunction({
      functionName: 'add',
      filePath: 'src/math.ts',
      functionCode: 'function add(a, b) { return a + b; }',
    });
    expect(result.flags.hasSideEffects).toBe(false);
  });
});

describe('normalizeAnalysis (shared by every provider)', () => {
  it('coerces flags to booleans and derives hasSideEffects from any concrete effect', () => {
    const r = normalizeAnalysis({
      summary: 'reads a row',
      flags: { databaseRead: 1, httpCall: 'yes' },
    });
    expect(r.flags.databaseRead).toBe(true);
    expect(r.flags.httpCall).toBe(true);
    expect(r.flags.hasSideEffects).toBe(true); // implied
    expect(r.flags.fileWrite).toBe(false);
  });

  it('truncates an over-long summary to 150 chars', () => {
    const r = normalizeAnalysis({ summary: 'x'.repeat(400), flags: {} });
    expect(r.summary.length).toBe(150);
  });

  it('throws on a missing/empty summary (no bogus summary emitted)', () => {
    expect(() => normalizeAnalysis({ flags: {} })).toThrow(/summary/);
    expect(() => normalizeAnalysis({ summary: '   ', flags: {} })).toThrow(/summary/);
  });

  it('throws on a non-object payload', () => {
    expect(() => normalizeAnalysis('not json')).toThrow();
    expect(() => normalizeAnalysis(null)).toThrow();
  });
});
