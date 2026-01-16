import { useEffect } from 'react';
import { Canvas } from './components/canvas';
import { Breadcrumb, SearchBar } from './components/controls';
import { NodeDetailPanel } from './components/panels';
import { useScanStore } from './stores/scan-store';

function App() {
  const { currentScan, isLoading, error, setScan, setLoading, setError } = useScanStore();

  useEffect(() => {
    async function loadSampleData() {
      setLoading(true);
      try {
        const response = await fetch('/sample-scan.json');
        if (!response.ok) {
          throw new Error(`Failed to load: ${response.status}`);
        }
        const data = await response.json();
        setScan(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    }

    loadSampleData();
  }, [setScan, setLoading, setError]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-1 text-text-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading scan data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-1 text-text-primary flex items-center justify-center">
        <div className="text-status-error">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface-1 text-text-primary flex flex-col">
      <header className="h-12 shrink-0 bg-surface-2 border-b border-surface-3 flex items-center px-4 gap-4">
        <h1 className="text-lg font-semibold">Surveyor</h1>
        {currentScan && (
          <span className="text-sm text-text-secondary">
            {currentScan.projectName} - {currentScan.stats.totalFiles} files
          </span>
        )}
        <SearchBar className="w-64" />
        <Breadcrumb className="ml-auto" />
      </header>
      <main className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <Canvas scanData={currentScan} />
        </div>
        <NodeDetailPanel />
      </main>
    </div>
  );
}

export default App;
