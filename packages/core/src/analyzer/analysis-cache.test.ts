/**
 * analysis-cache tests — focus on the P2 fix: the cache key now includes
 * provider + model, so swapping the AI backend/model INVALIDATES stale summaries
 * instead of serving them.
 */

import { describe, it, expect } from 'vitest';
import {
  createCache,
  setCachedResult,
  getCachedResult,
  hashFunctionContent,
} from './analysis-cache.js';
import type { AnalysisResult } from '../types/analyzer.types.js';

function makeResult(summary: string): AnalysisResult {
  return {
    summary,
    flags: {
      databaseRead: false,
      databaseWrite: false,
      httpCall: false,
      fileRead: false,
      fileWrite: false,
      sendsNotification: false,
      modifiesGlobalState: false,
      hasSideEffects: false,
    },
  };
}

describe('analysis cache provider/model keying (P2 fix)', () => {
  const fnId = 'fn-1';
  const code = 'function f() { return 1; }';
  const hash = hashFunctionContent(code);

  it('hits when content + provider + model all match', () => {
    const cache = createCache('/proj');
    setCachedResult(cache, fnId, hash, makeResult('haiku summary'), 'anthropic', 'claude-haiku-4-5');

    const hit = getCachedResult(cache, fnId, hash, 'anthropic', 'claude-haiku-4-5');
    expect(hit?.summary).toBe('haiku summary');
  });

  it('MISSES on a model swap (same provider) — no stale summary served', () => {
    const cache = createCache('/proj');
    setCachedResult(cache, fnId, hash, makeResult('haiku summary'), 'anthropic', 'claude-haiku-4-5');

    const miss = getCachedResult(cache, fnId, hash, 'anthropic', 'claude-sonnet-4-5');
    expect(miss).toBeNull();
  });

  it('MISSES on a provider swap (same model name) — no stale summary served', () => {
    const cache = createCache('/proj');
    setCachedResult(cache, fnId, hash, makeResult('grok summary'), 'openai-compatible', 'shared-name');

    const miss = getCachedResult(cache, fnId, hash, 'anthropic', 'shared-name');
    expect(miss).toBeNull();
  });

  it('still misses on a content change', () => {
    const cache = createCache('/proj');
    setCachedResult(cache, fnId, hash, makeResult('s'), 'anthropic', 'claude-haiku-4-5');

    const miss = getCachedResult(cache, fnId, hashFunctionContent('different'), 'anthropic', 'claude-haiku-4-5');
    expect(miss).toBeNull();
  });

  it('persists provider + model on the stored entry', () => {
    const cache = createCache('/proj');
    setCachedResult(cache, fnId, hash, makeResult('s'), 'openai-compatible', 'qwen2.5:1.5b');

    const entry = cache.entries[fnId];
    expect(entry?.provider).toBe('openai-compatible');
    expect(entry?.model).toBe('qwen2.5:1.5b');
  });
});
