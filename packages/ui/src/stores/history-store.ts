/**
 * Scan history store
 */

import { create } from 'zustand';

interface HistoryState {
  scanHistory: string[];
  activeDiffId: string | null;
}

export const useHistoryStore = create<HistoryState>(() => ({
  scanHistory: [],
  activeDiffId: null,
}));
