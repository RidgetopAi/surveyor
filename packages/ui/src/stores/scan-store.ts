/**
 * Scan data store - Zustand v5
 */

import { create } from 'zustand';
import type { ScanResult, Node, Connection, Warning } from '@surveyor/core';

export type ScanPhase = 'idle' | 'scanning' | 'analyzing' | 'complete' | 'error';

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'progress';
  timestamp: number;
}

export interface ScanProgress {
  phase: ScanPhase;
  isAIEnabled: boolean;
  filesDiscovered: number;
  totalFiles: number;
  currentFile: string | null;
  analyzedCount: number;
  totalFunctions: number;
  logEntries: LogEntry[];
}

export interface ScanState {
  currentScan: ScanResult | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  highlightedNodeIds: string[]; // nodes highlighted by warning selection
  currentFolder: string | null; // null = root view (all folders), string = drilled into folder
  navigationPath: string[]; // breadcrumb path
  searchQuery: string; // search filter for nodes
  isLoading: boolean;
  error: Error | null;
  scanProgress: ScanProgress;
}

export interface ScanActions {
  setScan: (scan: ScanResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setHighlightedNodes: (nodeIds: string[]) => void;
  drillInto: (folder: string) => void;
  /** Drill into a folder and highlight the files in it that carry warnings. */
  highlightFolderWarnings: (folder: string) => void;
  drillOut: () => void;
  drillToPath: (pathIndex: number) => void;
  setSearchQuery: (query: string) => void;
  getNodeById: (id: string) => Node | undefined;
  getConnectionsForNode: (nodeId: string) => Connection[];
  getWarningsForNode: (nodeId: string) => Warning[];
  // Scan progress actions
  startScan: (isAIEnabled: boolean) => void;
  updateScanProgress: (update: Partial<ScanProgress>) => void;
  addLogEntry: (message: string, type: LogEntry['type']) => void;
  setScanPhase: (phase: ScanPhase) => void;
  resetScanProgress: () => void;
}

export type ScanStore = ScanState & ScanActions;

const initialScanProgress: ScanProgress = {
  phase: 'idle',
  isAIEnabled: false,
  filesDiscovered: 0,
  totalFiles: 0,
  currentFile: null,
  analyzedCount: 0,
  totalFunctions: 0,
  logEntries: [],
};

export const useScanStore = create<ScanStore>((set, get) => ({
  // State
  currentScan: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  highlightedNodeIds: [],
  currentFolder: null,
  navigationPath: [],
  searchQuery: '',
  isLoading: false,
  error: null,
  scanProgress: { ...initialScanProgress },

  // Actions
  setScan: (scan) => set({
    currentScan: scan,
    error: null,
    currentFolder: null,
    navigationPath: [],
    searchQuery: '',
    highlightedNodeIds: [],
    scanProgress: { ...initialScanProgress, phase: 'complete' },
  }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setHighlightedNodes: (nodeIds) => set({ highlightedNodeIds: nodeIds }),
  drillInto: (folder) => {
    const { navigationPath } = get();
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null, // Clear selection when drilling
    });
  },
  highlightFolderWarnings: (folder) => {
    const { currentScan, navigationPath } = get();
    const fileIds = new Set<string>();
    if (currentScan) {
      for (const warning of currentScan.warnings) {
        for (const nodeId of warning.affectedNodes) {
          const node = currentScan.nodes[nodeId];
          if (!node) continue;
          const parts = node.filePath.split('/');
          const nodeFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
          if (nodeFolder === folder) fileIds.add(nodeId);
        }
      }
    }
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null,
      highlightedNodeIds: Array.from(fileIds),
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

  // Scan progress actions
  startScan: (isAIEnabled) => set({
    scanProgress: {
      ...initialScanProgress,
      phase: 'scanning',
      isAIEnabled,
    },
    error: null,
  }),

  updateScanProgress: (update) => set((state) => ({
    scanProgress: { ...state.scanProgress, ...update },
  })),

  addLogEntry: (message, type) => set((state) => ({
    scanProgress: {
      ...state.scanProgress,
      logEntries: [
        ...state.scanProgress.logEntries,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          message,
          type,
          timestamp: Date.now(),
        },
      ],
    },
  })),

  setScanPhase: (phase) => set((state) => ({
    scanProgress: { ...state.scanProgress, phase },
  })),

  resetScanProgress: () => set({
    scanProgress: { ...initialScanProgress },
  }),
}));
