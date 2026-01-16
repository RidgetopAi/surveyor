/**
 * Scan data store - Zustand v5
 */

import { create } from 'zustand';
import type { ScanResult, Node, Connection, Warning } from '@surveyor/core';

export interface ScanState {
  currentScan: ScanResult | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  currentFolder: string | null; // null = root view (all folders), string = drilled into folder
  navigationPath: string[]; // breadcrumb path
  searchQuery: string; // search filter for nodes
  isLoading: boolean;
  error: Error | null;
}

export interface ScanActions {
  setScan: (scan: ScanResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  drillInto: (folder: string) => void;
  drillOut: () => void;
  drillToPath: (pathIndex: number) => void;
  setSearchQuery: (query: string) => void;
  getNodeById: (id: string) => Node | undefined;
  getConnectionsForNode: (nodeId: string) => Connection[];
  getWarningsForNode: (nodeId: string) => Warning[];
}

export type ScanStore = ScanState & ScanActions;

export const useScanStore = create<ScanStore>((set, get) => ({
  // State
  currentScan: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  currentFolder: null,
  navigationPath: [],
  searchQuery: '',
  isLoading: false,
  error: null,

  // Actions
  setScan: (scan) => set({ currentScan: scan, error: null, currentFolder: null, navigationPath: [], searchQuery: '' }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  drillInto: (folder) => {
    const { navigationPath } = get();
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null, // Clear selection when drilling
    });
  },
  drillOut: () => {
    const { navigationPath } = get();
    const newPath = navigationPath.slice(0, -1);
    set({
      currentFolder: newPath.length > 0 ? newPath[newPath.length - 1] : null,
      navigationPath: newPath,
    });
  },
  drillToPath: (pathIndex) => {
    const { navigationPath } = get();
    if (pathIndex < 0) {
      set({ currentFolder: null, navigationPath: [] });
    } else {
      const newPath = navigationPath.slice(0, pathIndex + 1);
      set({
        currentFolder: newPath[newPath.length - 1],
        navigationPath: newPath,
      });
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Selectors
  getNodeById: (id) => {
    const { currentScan } = get();
    return currentScan?.nodes[id];
  },

  getConnectionsForNode: (nodeId) => {
    const { currentScan } = get();
    if (!currentScan) return [];
    return currentScan.connections.filter(
      (c) => c.sourceId === nodeId || c.targetId === nodeId
    );
  },

  getWarningsForNode: (nodeId) => {
    const { currentScan } = get();
    if (!currentScan) return [];
    return currentScan.warnings.filter((w) =>
      w.affectedNodes.includes(nodeId)
    );
  },
}));
