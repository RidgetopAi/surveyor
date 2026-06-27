/**
 * ScanPanel - Trigger project scans via server API with animated progress overlay
 */

import { useState, useCallback } from 'react';
import { useScanStore } from '../../stores/scan-store';
import { ScanProgress } from '../overlays';
import { SERVER_CONFIG } from '../../config';

interface ScanPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl?: string;
}

export function ScanPanel({ isOpen, onClose, serverUrl = SERVER_CONFIG.baseUrl }: ScanPanelProps) {
  const {
    setScan,
    scanProgress,
    startScan,
    updateScanProgress,
    addLogEntry,
    setScanPhase,
    resetScanProgress,
  } = useScanStore();

  const [projectPath, setProjectPath] = useState('');
  const [skipAnalysis, setSkipAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isScanning = scanProgress.phase === 'scanning' || scanProgress.phase === 'analyzing';

  const handleScan = useCallback(async () => {
    if (!projectPath.trim()) return;

    const isAIEnabled = !skipAnalysis;
    startScan(isAIEnabled);
    setError(null);

    addLogEntry('Initializing scan...', 'info');
    addLogEntry(`Target: ${projectPath}`, 'info');

    try {
      addLogEntry('Connecting to server...', 'progress');

      // POST to start scan - returns immediately with scanId
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

      const { scanId } = await response.json();
      addLogEntry('Scan started, streaming progress...', 'progress');

      // Connect to SSE endpoint for real-time progress
      console.log('[SSE] Connecting to:', `${serverUrl}/api/v1/scans/${scanId}/progress`);
      const eventSource = new EventSource(`${serverUrl}/api/v1/scans/${scanId}/progress`);
      let completed = false; // Track if we've handled completion to ignore subsequent errors

      eventSource.onopen = () => {
        console.log('[SSE] Connection opened');
      };

      eventSource.addEventListener('progress', (event) => {
        console.log('[SSE] Progress event:', event.data);
        const data = JSON.parse(event.data);
        const { phase, progress } = data;

        if (phase === 'scanning') {
          updateScanProgress({
            filesDiscovered: progress.current,
            totalFiles: progress.total,
            currentFile: progress.filePath || null,
          });
          // Log occasionally
          if (progress.current % 25 === 0 || progress.current === progress.total) {
            addLogEntry(`Parsed ${progress.current}/${progress.total} files`, 'progress');
          }
        } else if (phase === 'analyzing') {
          setScanPhase('analyzing');
          updateScanProgress({
            analyzedCount: progress.current,
            totalFunctions: progress.total,
            currentFile: progress.functionName || progress.filePath || null,
          });
          // Log occasionally
          if (progress.current % 10 === 0 || progress.current === progress.total) {
            addLogEntry(`Analyzed ${progress.current}/${progress.total} functions`, 'progress');
          }
        } else if (phase === 'complete') {
          completed = true;
          eventSource.close();

          // Fetch full result
          fetch(`${serverUrl}/api/v1/scans/${scanId}?projectPath=${encodeURIComponent(projectPath.trim())}`)
            .then(res => res.json())
            .then(({ scan }) => {
              if (scan) {
                addLogEntry(`Found ${scan.stats.totalFiles} files`, 'success');
                addLogEntry(`Found ${scan.stats.totalFunctions} functions`, 'success');
                if (isAIEnabled && scan.stats.analyzedCount > 0) {
                  addLogEntry(`Analyzed ${scan.stats.analyzedCount} functions with AI`, 'success');
                }
                addLogEntry('Scan complete!', 'success');
                setScan(scan);
                setScanPhase('complete');

                // Auto-close after brief delay
                setTimeout(() => {
                  resetScanProgress();
                  onClose();
                }, 800);
              }
            })
            .catch(() => {
              // If fetch fails, just mark complete with available data
              addLogEntry('Scan complete!', 'success');
              setScanPhase('complete');
              setTimeout(() => {
                resetScanProgress();
                onClose();
              }, 800);
            });
        } else if (phase === 'error') {
          completed = true;
          eventSource.close();
          const errorMessage = progress.error || 'Scan failed';
          setError(errorMessage);
          addLogEntry(`Error: ${errorMessage}`, 'info');
          setScanPhase('error');
        }
      });

      eventSource.addEventListener('error', (e) => {
        console.log('[SSE] Error event:', e, 'readyState:', eventSource.readyState, 'completed:', completed);
        if (completed) return; // Ignore errors after successful completion
        eventSource.close();
        setError('Lost connection to server');
        addLogEntry('Error: Lost connection to server', 'info');
        setScanPhase('error');
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Scan failed';
      setError(errorMessage);
      addLogEntry(`Error: ${errorMessage}`, 'info');
      setScanPhase('error');
    }
  }, [projectPath, skipAnalysis, serverUrl, setScan, startScan, updateScanProgress, addLogEntry, setScanPhase, resetScanProgress, onClose]);

  const handleClose = () => {
    if (!isScanning) {
      resetScanProgress();
      setError(null);
      onClose();
    }
  };

  const handleReset = () => {
    resetScanProgress();
    setError(null);
  };

  if (!isOpen) return null;

  const showOverlay = isScanning || scanProgress.phase === 'complete';

  return (
    <>
      {/* Modal Dialog */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
        <div className="bg-surface-2 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
            <h2 className="text-lg font-semibold">Scan Project</h2>
            <button
              onClick={handleClose}
              disabled={isScanning}
              className="text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {scanProgress.phase === 'idle' && !error && (
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
                    Skip AI analysis (faster, no LLM calls)
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

            {scanProgress.phase === 'error' && (
              <div className="space-y-3">
                <div className="p-3 bg-status-error/10 border border-status-error/20 rounded">
                  <p className="text-status-error text-sm">{error}</p>
                </div>
                <p className="text-text-muted text-xs">
                  Make sure the server is running: <code className="bg-surface-3 px-1 rounded">pnpm --filter @surveyor/server dev</code>
                </p>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-surface-3 hover:bg-surface-3/80 text-text-primary rounded font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            {isScanning && (
              <div className="text-center py-8 text-text-secondary">
                <p>Scan in progress...</p>
                <p className="text-xs text-text-muted mt-1">See overlay for details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animated Progress Overlay */}
      <ScanProgress isVisible={showOverlay} />
    </>
  );
}
