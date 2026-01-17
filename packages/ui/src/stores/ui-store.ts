/**
 * UI state store
 */

import { create } from 'zustand';

export enum ViewMode {
  Folder = 'folder',
  Smart = 'smart',
}

export enum PanelState {
  Collapsed = 'collapsed',
  Expanded = 'expanded',
}

// Detect system preference for reduced motion
const getSystemReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export interface UIState {
  viewMode: ViewMode;
  zoomLevel: number;
  reducedMotion: boolean;
  warningPanelState: PanelState;
  setReducedMotion: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: ViewMode.Folder,
  zoomLevel: 1,
  reducedMotion: getSystemReducedMotion(),
  warningPanelState: PanelState.Collapsed,
  setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
}));
