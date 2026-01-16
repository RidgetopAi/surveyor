/**
 * Browser-safe behavioral analyzer
 * Self-contained to avoid importing Node.js dependencies from @surveyor/core
 */

import type { ScanResult, FunctionNode, BehavioralFlags, SummarySource } from '@surveyor/core';

/**
 * Progress information during analysis
 */
export interface AnalysisProgress {
  current: number;
  total: number;
  functionName: string;
  filePath: string;
  fromCache: boolean;
}

/**
 * LLM analysis result
 */
export interface LLMAnalysisResult {
  summary: string;
  flags: BehavioralFlags;
}

/**
 * Browser-compatible LLM client
 */
export interface BrowserLLMClient {
  analyzeFunction(
    name: string,
    code: string,
    filePath: string
  ): Promise<LLMAnalysisResult>;
}

/**
 * Options for browser-based behavioral analysis
 */
export interface BrowserAnalyzeOptions {
  onProgress?: (progress: AnalysisProgress) => void;
  skipAnalyzed?: boolean;
  maxFunctions?: number;
}

/**
 * Create an LLM client for browser use
 */
export function createBrowserLLMClient(config: {
  apiKey: string;
  endpoint?: string;
  model?: string;
}): BrowserLLMClient {
  const {
    apiKey,
    endpoint = 'https://api.x.ai/v1/chat/completions',
    model = 'grok-4-1-fast-reasoning',
  } = config;

  return {
    async analyzeFunction(
      name: string,
      code: string,
      filePath: string
    ): Promise<LLMAnalysisResult> {
      const prompt = `Analyze this TypeScript function and provide:
1. A one-line summary (max 100 chars) of what it does
2. Side effect flags (true/false for each)

Function: ${name}
File: ${filePath}

\`\`\`typescript
${code}
\`\`\`

Respond in JSON format:
{
  "summary": "one-line description",
  "flags": {
    "databaseRead": false,
    "databaseWrite": false,
    "httpCall": false,
    "fileRead": false,
    "fileWrite": false,
    "sendsNotification": false,
    "modifiesGlobalState": false,
    "hasSideEffects": false
  }
}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM API error: ${response.status} ${text}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const result = JSON.parse(jsonMatch[0]);
      return {
        summary: result.summary || 'No summary available',
        flags: {
          databaseRead: result.flags?.databaseRead ?? false,
          databaseWrite: result.flags?.databaseWrite ?? false,
          httpCall: result.flags?.httpCall ?? false,
          fileRead: result.flags?.fileRead ?? false,
          fileWrite: result.flags?.fileWrite ?? false,
          sendsNotification: result.flags?.sendsNotification ?? false,
          modifiesGlobalState: result.flags?.modifiesGlobalState ?? false,
          hasSideEffects: result.flags?.hasSideEffects ?? false,
        },
      };
    },
  };
}

/**
 * Analyze all functions in a scan result using browser-compatible LLM client
 * Requires scan result with embedded source code in FunctionNodes
 */
export async function analyzeBehaviorBrowser(
  scanResult: ScanResult,
  client: BrowserLLMClient,
  options: BrowserAnalyzeOptions = {}
): Promise<ScanResult> {
  const { onProgress, skipAnalyzed = true, maxFunctions } = options;

  // Collect all function nodes that need analysis
  const functionsToAnalyze: FunctionNode[] = [];

  for (const node of Object.values(scanResult.nodes)) {
    if (node.type === 'function') {
      const funcNode = node as FunctionNode;
      // Skip if already analyzed and skipAnalyzed is true
      if (skipAnalyzed && funcNode.behavioral) {
        continue;
      }
      // Skip if no source code embedded
      if (!funcNode.source) {
        continue;
      }
      functionsToAnalyze.push(funcNode);
    }
  }

  // Apply max functions limit
  const targetFunctions = maxFunctions
    ? functionsToAnalyze.slice(0, maxFunctions)
    : functionsToAnalyze;

  const total = targetFunctions.length;
  let current = 0;
  let analyzedCount = scanResult.stats.analyzedCount || 0;

  // Process functions sequentially
  for (const funcNode of targetFunctions) {
    current++;

    // Report progress
    if (onProgress) {
      onProgress({
        current,
        total,
        functionName: funcNode.name,
        filePath: funcNode.filePath,
        fromCache: false,
      });
    }

    try {
      // Call LLM for analysis
      const result = await client.analyzeFunction(
        funcNode.name,
        funcNode.source!,
        funcNode.filePath
      );

      // Update function node with behavioral data
      funcNode.behavioral = {
        summary: result.summary,
        source: 'ai' as SummarySource,
        analyzedAt: new Date().toISOString(),
        flags: result.flags,
      };

      analyzedCount++;
    } catch (error) {
      console.error(
        `Failed to analyze ${funcNode.name} in ${funcNode.filePath}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Update stats
  scanResult.stats.analyzedCount = analyzedCount;
  scanResult.stats.pendingAnalysis = functionsToAnalyze.length - analyzedCount;

  return scanResult;
}
