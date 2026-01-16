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

export interface UIState {
  viewMode: ViewMode;
  zoomLevel: number;
  reducedMotion: boolean;
  warningPanelState: PanelState;
}

export const useUIStore = create<UIState>(() => ({
  viewMode: ViewMode.Folder,
  zoomLevel: 1,
  reducedMotion: false,
  warningPanelState: PanelState.Collapsed,
}));
