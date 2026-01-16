/**
 * Analyzer-related type definitions for behavioral analysis
 */

import type { BehavioralFlags } from './node.types.js';

/**
 * Configuration for the LLM analyzer
 */
export interface AnalyzerConfig {
  /** API endpoint URL (OpenAI-compatible) */
  endpoint: string;
  /** API key for authentication */
  apiKey: string;
  /** Model identifier */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for generation (0-1) */
  temperature: number;
  /** Timeout in milliseconds */
  timeout: number;
  /** Maximum concurrent requests */
  concurrency: number;
}

/**
 * Default analyzer configuration
 */
export const DEFAULT_ANALYZER_CONFIG: Partial<AnalyzerConfig> = {
  model: 'grok-4-1-fast-reasoning',
  maxTokens: 256,
  temperature: 0.1,
  timeout: 30000,
  concurrency: 5,
};

/**
 * Raw analysis result from LLM before processing
 */
export interface AnalysisResult {
  /** One-line summary of function behavior */
  summary: string;
  /** Detected behavioral flags */
  flags: BehavioralFlags;
  /** Raw LLM response for debugging */
  rawResponse?: string;
}

/**
 * Cache entry for analyzed function
 */
export interface AnalysisCacheEntry {
  /** Hash of function content */
  contentHash: string;
  /** Analysis result */
  result: AnalysisResult;
  /** When analysis was performed */
  analyzedAt: string;
  /** Model used for analysis */
  model: string;
}

/**
 * Analysis cache structure stored in .surveyor directory
 */
export interface AnalysisCache {
  /** Version for cache format migrations */
  version: number;
  /** Project path this cache belongs to */
  projectPath: string;
  /** Entries keyed by function ID */
  entries: Record<string, AnalysisCacheEntry>;
  /** Last cache update timestamp */
  updatedAt: string;
}

/**
 * Progress callback for analysis operations
 */
export type AnalysisProgressCallback = (progress: AnalysisProgress) => void;

/**
 * Progress information during analysis
 */
export interface AnalysisProgress {
  /** Current function being analyzed */
  current: number;
  /** Total functions to analyze */
  total: number;
  /** Current function name */
  functionName: string;
  /** Current file path */
  filePath: string;
  /** Whether analysis was cached */
  fromCache: boolean;
}

/**
 * LLM analysis result from analyzeFunction
 */
export interface LLMAnalysisResult {
  summary: string;
  flags: BehavioralFlags;
}

/**
 * Browser-compatible LLM client interface
 */
export interface BrowserLLMClient {
  analyzeFunction(
    name: string,
    code: string,
    filePath: string
  ): Promise<LLMAnalysisResult>;
}

/**
 * Path alias mapping from tsconfig.json paths
 * e.g., { "@/*": ["./src/*"] }
 */
export type PathAliases = Record<string, string[]>;

/**
 * Options for warning detection
 */
export interface WarningDetectorOptions {
  /** Detect circular dependencies at file level (import cycles) */
  detectFileCircular?: boolean;
  /** Detect circular dependencies at function level (call cycles) */
  detectFunctionCircular?: boolean;
  /** Detect orphaned code (unreferenced functions) */
  detectOrphaned?: boolean;
  /** Detect unused exports */
  detectUnusedExports?: boolean;
  /** Detect large files */
  detectLargeFiles?: boolean;
  /** Threshold for large file warning (lines) */
  largeFileThreshold?: number;
  /** Detect functions with missing type annotations */
  detectMissingTypes?: boolean;
  /** Path aliases from tsconfig.json for resolving imports */
  pathAliases?: PathAliases;
  /** Enable Next.js/framework convention awareness */
  frameworkConventions?: boolean;
}

/**
 * Default warning detector options
 */
export const DEFAULT_WARNING_OPTIONS: Required<WarningDetectorOptions> = {
  detectFileCircular: true,
  detectFunctionCircular: false,
  detectOrphaned: true,
  detectUnusedExports: true,
  detectLargeFiles: true,
  largeFileThreshold: 500,
  detectMissingTypes: false,
  pathAliases: {},
  frameworkConventions: true,
};
