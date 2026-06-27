/**
 * Segmented control to switch the active canvas view.
 *
 * Reads/writes `viewMode` on the UI store; the Canvas renders whatever view is
 * active via the ViewStrategy seam. Views are driven by the VIEWS config.
 */

import { useUIStore, ViewMode } from '../../stores/ui-store';
import { VIEWS } from '../../config/view.config';

export interface ViewToggleProps {
  className?: string;
}

export function ViewToggle({ className = '' }: ViewToggleProps) {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div
      className={`inline-flex items-center rounded-md bg-surface-1 border border-surface-3 p-0.5 ${className}`}
      role="tablist"
      aria-label="Canvas view"
    >
      {VIEWS.map((view) => {
        const active = viewMode === (view.id as ViewMode);
        return (
          <button
            key={view.id}
            role="tab"
            aria-selected={active}
            title={view.description}
            onClick={() => setViewMode(view.id as ViewMode)}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              active
                ? 'bg-accent-blue text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
