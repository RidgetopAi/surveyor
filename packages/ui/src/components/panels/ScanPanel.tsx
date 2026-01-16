/**
 * ScanPanel - Trigger project scans via server API
 */

import { useState, useCallback } from 'react';
import { useScanStore } from '../../stores/scan-store';
import type { ScanResult } from '@surveyor/core';

interface ScanPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl?: string;
}

type ScanState = 'idle' | 'scanning' | 'analyzing' | 'complete' | 'error';

interface ScanProgress {
  current: number;
  total: number;
  functionName: string;
  filePath: string;
}

export function ScanPanel({ isOpen, onClose, serverUrl = 'http://localhost:4000' }: ScanPanelProps) {
  const { setScan } = useScanStore();
  const [projectPath, setProjectPath] = useState('');
  const [skipAnalysis, setSkipAnalysis] = useState(false);
  const [state, setState] = useState<ScanState>('idle');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    if (!projectPath.trim()) return;

    setState('scanning');
    setError(null);
    setProgress(null);

    try {
      const response = await fetch(`${serverUrl}/api/v1/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: projectPath.trim(),
          options: { skipAnalysis },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      const scan = data.result as ScanResult;

      setScan(scan);
      setState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setState('error');
    }
  }, [projectPath, skipAnalysis, serverUrl, setScan]);

  const handleClose = () => {
    if (state !== 'scanning' && state !== 'analyzing') {
      setState('idle');
      setProgress(null);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-2 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <h2 className="text-lg font-semibold">Scan Project</h2>
          <button
            onClick={handleClose}
            disabled={state === 'scanning' || state === 'analyzing'}
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
                Enter the path to a project directory to scan. The server will parse TypeScript/JavaScript files and build a dependency graph.
              </p>

              <div>
                <label className="block text-sm font-medium mb-1">Project Path</label>
                <input
                  type="text"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded text-sm focus:outline-none focus:border-accent-blue font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skipAnalysis"
                  checked={skipAnalysis}
                  onChange={(e) => setSkipAnalysis(e.target.checked)}
                  className="rounded bg-surface-1 border-surface-3"
                />
                <label htmlFor="skipAnalysis" className="text-sm text-text-secondary">
                  Skip behavioral analysis (faster, no LLM calls)
                </label>
              </div>

              <button
                onClick={handleScan}
                disabled={!projectPath.trim()}
                className="w-full px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:bg-surface-3 disabled:text-text-secondary text-white rounded font-medium transition-colors"
              >
                Start Scan
              </button>

              <p className="text-text-muted text-xs">
                Server: {serverUrl}
              </p>
            </>
          )}

          {(state === 'scanning' || state === 'analyzing') && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full" />
                <span className="text-sm">
                  {state === 'scanning' ? 'Scanning project...' : 'Analyzing functions...'}
                </span>
              </div>

              {progress && (
                <>
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
                    {progress.functionName}
                  </div>
                </>
              )}

              <p className="text-text-muted text-xs">
                This may take a moment for large projects...
              </p>
            </div>
          )}

          {state === 'complete' && (
            <div className="text-center space-y-3">
              <div className="text-4xl">✓</div>
              <p className="text-status-success font-medium">Scan Complete</p>
              <p className="text-sm text-text-secondary">
                Project loaded and ready to explore.
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-white rounded font-medium transition-colors"
              >
                View Results
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <div className="p-3 bg-status-error/10 border border-status-error/20 rounded">
                <p className="text-status-error text-sm">{error}</p>
              </div>
              <p className="text-text-muted text-xs">
                Make sure the server is running: <code className="bg-surface-3 px-1 rounded">pnpm --filter @surveyor/server dev</code>
              </p>
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
