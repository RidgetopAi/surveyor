import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Canvas } from './components/canvas';
import { Breadcrumb, SearchBar, FilePicker, ViewToggle } from './components/controls';
import { NodeDetailPanel, AnalyzePanel, ScanPanel, WarningPanel } from './components/panels';
import { useScanStore } from './stores/scan-store';
import type { ScanResult } from '@surveyor/core';

function App() {
  const { currentScan, isLoading, error, setScan, setLoading, setError } = useScanStore();
  const [showAnalyzePanel, setShowAnalyzePanel] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [showWarningPanel, setShowWarningPanel] = useState(false);

  const handleFileSelect = (data: unknown) => {
    setLoading(true);
    try {
      // Basic validation
      const scan = data as ScanResult;
      if (!scan.projectName || !scan.nodes || !scan.connections) {
        throw new Error('Invalid scan file format');
      }
      setScan(scan);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load scan file'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileError = (err: Error) => {
    setError(err);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-1 text-text-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading scan data...</div>
      </div>
    );
  }

  // Welcome screen when no scan loaded
  if (!currentScan) {
    return (
      <div className="min-h-screen bg-surface-1 text-text-primary flex flex-col">
        <header className="h-12 shrink-0 bg-surface-2 border-b border-surface-3 flex items-center px-4">
          <h1 className="text-lg font-semibold">Surveyor</h1>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-center mb-2">Code Visualization Tool</h2>
            <p className="text-text-secondary text-center mb-8">
              Explore your codebase structure, imports, and dependencies
            </p>

            {/* Scan Project Button */}
            <button
              onClick={() => setShowScanPanel(true)}
              className="w-full mb-4 px-4 py-3 bg-accent-blue hover:bg-accent-blue/80 text-white rounded-lg font-medium transition-colors"
            >
              Scan Project
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-3" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface-1 text-text-muted">or load existing scan</span>
              </div>
            </div>

            <FilePicker
              variant="dropzone"
              onFileSelect={handleFileSelect}
              onError={handleFileError}
            />
            {error && (
              <p className="mt-4 text-status-error text-center text-sm">{error.message}</p>
            )}
          </div>
        </main>
        <ScanPanel isOpen={showScanPanel} onClose={() => setShowScanPanel(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface-1 text-text-primary flex flex-col">
      <header className="h-12 shrink-0 bg-surface-2 border-b border-surface-3 flex items-center px-4 gap-4">
        <h1 className="text-lg font-semibold">Surveyor</h1>
        <button
          onClick={() => setShowScanPanel(true)}
          className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 text-white rounded text-sm font-medium transition-colors"
        >
          Scan
        </button>
        <FilePicker onFileSelect={handleFileSelect} onError={handleFileError} />
        <button
          onClick={() => setShowAnalyzePanel(true)}
          className="px-3 py-1.5 bg-accent-purple hover:bg-accent-purple/80 text-white rounded text-sm font-medium transition-colors"
        >
          Analyze
        </button>
        {currentScan && currentScan.stats.totalWarnings > 0 && (
          <button
            onClick={() => setShowWarningPanel(true)}
            className="px-3 py-1.5 bg-surface-3 hover:bg-surface-3/80 rounded text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4 text-status-warning" />
            <span>{currentScan.stats.totalWarnings}</span>
          </button>
        )}
        {currentScan && (
          <span className="text-sm text-text-secondary">
            {currentScan.projectName} - {currentScan.stats.totalFiles} files
            {currentScan.stats.analyzedCount ? ` (${currentScan.stats.analyzedCount} analyzed)` : ''}
          </span>
        )}
        <SearchBar className="w-64" />
        <ViewToggle />
        <Breadcrumb className="ml-auto" />
      </header>
      <main className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <Canvas scanData={currentScan} />
        </div>
        <NodeDetailPanel />
      </main>
      <ScanPanel isOpen={showScanPanel} onClose={() => setShowScanPanel(false)} />
      <AnalyzePanel isOpen={showAnalyzePanel} onClose={() => setShowAnalyzePanel(false)} />
      <WarningPanel isOpen={showWarningPanel} onClose={() => setShowWarningPanel(false)} />
    </div>
  );
}

export default App;
