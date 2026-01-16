/**
 * Scan data store
 */

import { create } from 'zustand';

export interface ScanState {
  currentScanId: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
}

export const useScanStore = create<ScanState>(() => ({
  currentScanId: null,
  selectedNodeId: null,
  hoveredNodeId: null,
}));
