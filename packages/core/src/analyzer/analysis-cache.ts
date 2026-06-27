/**
 * Caching layer for behavioral analysis results
 * Stores results in .surveyor directory, keyed by content hash
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  AnalysisCache,
  AnalysisCacheEntry,
  AnalysisResult,
} from '../types/analyzer.types.js';

// v2: cache entries are now keyed on provider + model in addition to content hash,
// so swapping the AI backend/model invalidates stale summaries instead of serving
// them. Bumping the version invalidates pre-v2 caches (which lack `provider`).
const CACHE_VERSION = 2;
const CACHE_FILENAME = 'analysis-cache.json';

/**
 * Generate a content hash for function code
 */
export function hashFunctionContent(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 16);
}

/**
 * Get the cache file path for a project
 */
function getCacheFilePath(outputDir: string): string {
  return join(outputDir, CACHE_FILENAME);
}

/**
 * Load analysis cache from disk
 */
export function loadCache(outputDir: string): AnalysisCache | null {
  const cachePath = getCacheFilePath(outputDir);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content) as AnalysisCache;

    // Version check - invalidate if format changed
    if (cache.version !== CACHE_VERSION) {
      return null;
    }

    return cache;
  } catch {
    // Corrupted cache - return null to rebuild
    return null;
  }
}

/**
 * Save analysis cache to disk
 */
export function saveCache(outputDir: string, cache: AnalysisCache): void {
  const cachePath = getCacheFilePath(outputDir);

  // Ensure directory exists
  const dir = dirname(cachePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(cache, null, 2);
  writeFileSync(cachePath, content, 'utf-8');
}

/**
 * Create a new empty cache
 */
export function createCache(projectPath: string): AnalysisCache {
  return {
    version: CACHE_VERSION,
    projectPath,
    entries: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get a cached analysis result if available AND it matches on content + provider +
 * model. A change to any of the three is a cache miss — so swapping the AI backend
 * or model never serves a stale summary produced by the old one.
 */
export function getCachedResult(
  cache: AnalysisCache,
  functionId: string,
  contentHash: string,
  provider: string,
  model: string
): AnalysisResult | null {
  const entry = cache.entries[functionId];

  if (!entry) {
    return null;
  }

  // Content changed - cache miss
  if (entry.contentHash !== contentHash) {
    return null;
  }

  // Different AI backend or model - cache miss (don't serve a stale summary).
  if (entry.provider !== provider || entry.model !== model) {
    return null;
  }

  return entry.result;
}

/**
 * Store an analysis result in the cache, tagged with the provider + model that
 * produced it so a later swap invalidates it.
 */
export function setCachedResult(
  cache: AnalysisCache,
  functionId: string,
  contentHash: string,
  result: AnalysisResult,
  provider: string,
  model: string
): void {
  const entry: AnalysisCacheEntry = {
    contentHash,
    result,
    analyzedAt: new Date().toISOString(),
    provider,
    model,
  };

  cache.entries[functionId] = entry;
  cache.updatedAt = new Date().toISOString();
}

/**
 * Remove stale entries from cache (functions that no longer exist)
 */
export function pruneCache(
  cache: AnalysisCache,
  validFunctionIds: Set<string>
): number {
  let removed = 0;

  for (const functionId of Object.keys(cache.entries)) {
    if (!validFunctionIds.has(functionId)) {
      delete cache.entries[functionId];
      removed++;
    }
  }

  if (removed > 0) {
    cache.updatedAt = new Date().toISOString();
  }

  return removed;
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: AnalysisCache): {
  totalEntries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
} {
  const entries = Object.values(cache.entries);

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }

  const dates = entries.map((e) => e.analyzedAt).sort();

  return {
    totalEntries: entries.length,
    oldestEntry: dates[0] ?? null,
    newestEntry: dates[dates.length - 1] ?? null,
  };
}
