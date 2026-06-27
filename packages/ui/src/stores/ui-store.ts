/**
 * UI state store
 */

import { create } from 'zustand';
import type { ViewId } from '../config/view.config';

/**
 * The active canvas view. Values are the canonical `ViewId`s and are passed
 * straight to `buildGraph` — the store IS the source of truth for which view
 * strategy renders.
 */
export enum ViewMode {
  FileStructure = 'file-structure',
  Dependency = 'dependency',
  DataFlow = 'data-flow',
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
  setViewMode: (mode: ViewMode) => void;
  setReducedMotion: (enabled: boolean) => void;
}

/** The active view as a `ViewId` (what `buildGraph` expects). */
export const viewModeToId = (mode: ViewMode): ViewId => mode as ViewId;

export const useUIStore = create<UIState>((set) => ({
  viewMode: ViewMode.FileStructure,
  zoomLevel: 1,
  reducedMotion: getSystemReducedMotion(),
  warningPanelState: PanelState.Collapsed,
  setViewMode: (mode) => set({ viewMode: mode }),
  setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
}));
