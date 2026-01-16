/**
 * AnalyzePanel - Trigger behavioral analysis from UI
 */

import { useState, useCallback } from 'react';
import { useScanStore } from '../../stores/scan-store';
import type { ScanResult } from '@surveyor/core';
import {
  analyzeBehaviorBrowser,
  createBrowserLLMClient,
  type AnalysisProgress,
} from '../../lib/browser-analyzer';

interface AnalyzePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type AnalysisState = 'idle' | 'running' | 'complete' | 'error';

const DEFAULT_MODEL = 'grok-4-1-fast-reasoning';
const DEFAULT_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

export function AnalyzePanel({ isOpen, onClose }: AnalyzePanelProps) {
  const { currentScan, setScan } = useScanStore();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [state, setState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Count functions needing analysis
  const functionsNeedingAnalysis = currentScan
    ? Object.values(currentScan.nodes).filter(
        (n) => n.type === 'function' && !('behavioral' in n && n.behavioral) && ('source' in n && n.source)
      ).length
    : 0;

  const handleAnalyze = useCallback(async () => {
    if (!currentScan || !apiKey.trim()) return;

    setState('running');
    setError(null);
    setProgress(null);

    try {
      const client = createBrowserLLMClient({
        apiKey: apiKey.trim(),
        model: model.trim() || DEFAULT_MODEL,
        endpoint: endpoint.trim() || DEFAULT_ENDPOINT,
      });

      const onProgress = (p: AnalysisProgress) => {
        setProgress(p);
      };

      // Clone the scan to avoid mutating the original during analysis
      const scanCopy = JSON.parse(JSON.stringify(currentScan)) as ScanResult;

      const analyzedScan = await analyzeBehaviorBrowser(scanCopy, client, {
        onProgress,
        skipAnalyzed: true,
      });

      setScan(analyzedScan);
      setState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setState('error');
    }
  }, [currentScan, apiKey, model, endpoint, setScan]);

  const handleClose = () => {
    if (state !== 'running') {
      setState('idle');
      setProgress(null);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-2 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <h2 className="text-lg font-semibold">Behavioral Analysis</h2>
          <button
            onClick={handleClose}
            disabled={state === 'running'}
            className="text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {state === 'idle' && (
            <>
              <p className="text-text-secondary text-sm">
                Analyze {functionsNeedingAnalysis} functions using AI to generate behavioral summaries and detect side effects.
              </p>

              {functionsNeedingAnalysis === 0 ? (
                <p className="text-status-warning text-sm">
                  No functions available for analysis. Make sure the scan includes function source code.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your xAI/OpenAI API key"
                      className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded text-sm focus:outline-none focus:border-accent-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="grok-4-1-fast-reasoning"
                      className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded text-sm font-mono focus:outline-none focus:border-accent-blue"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    {showAdvanced ? '▼ Hide advanced' : '▶ Show advanced'}
                  </button>

                  {showAdvanced && (
                    <div>
                      <label className="block text-sm font-medium mb-1">API Endpoint</label>
                      <input
                        type="text"
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        placeholder="https://api.x.ai/v1/chat/completions"
                        className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded text-sm font-mono focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleAnalyze}
                    disabled={!apiKey.trim()}
                    className="w-full px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:bg-surface-3 disabled:text-text-secondary text-white rounded font-medium transition-colors"
                  >
                    Start Analysis
                  </button>
                </>
              )}
            </>
          )}

          {state === 'running' && progress && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full" />
                <span className="text-sm">Analyzing functions...</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Progress</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-blue transition-all duration-200"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>

              <div className="text-xs text-text-secondary truncate">
                {progress.functionName} ({progress.filePath.split('/').pop()})
              </div>
            </div>
          )}

          {state === 'complete' && (
            <div className="text-center space-y-3">
              <div className="text-4xl">✓</div>
              <p className="text-status-success font-medium">Analysis Complete</p>
              <p className="text-sm text-text-secondary">
                {currentScan?.stats.analyzedCount || 0} functions analyzed with behavioral summaries.
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-white rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <p className="text-status-error text-sm">{error}</p>
              <button
                onClick={() => setState('idle')}
                className="px-4 py-2 bg-surface-3 hover:bg-surface-3/80 text-text-primary rounded font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
