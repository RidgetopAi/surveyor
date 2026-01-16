/**
 * UI-specific type definitions
 */

export interface BreadcrumbItem {
  id: string;
  label: string;
  type: 'project' | 'cluster' | 'file' | 'function';
}

export interface FilterState {
  showDbWriters: boolean;
  showHttpHandlers: boolean;
  showFileIO: boolean;
  showAuth: boolean;
  showFunctions: boolean;
  showClasses: boolean;
  showComponents: boolean;
  showHooks: boolean;
  showTypes: boolean;
  showWithWarnings: boolean;
  showOrphaned: boolean;
  showRecentlyChanged: boolean;
  showAIAnalyzed: boolean;
}
