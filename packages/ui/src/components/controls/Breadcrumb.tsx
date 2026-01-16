/**
 * Breadcrumb navigation component
 * Shows current navigation path and enables navigation back
 */

import { useScanStore } from '../../stores/scan-store';

interface BreadcrumbProps {
  className?: string;
}

/**
 * Breadcrumb showing navigation path through folder hierarchy
 */
export function Breadcrumb({ className = '' }: BreadcrumbProps) {
  const { navigationPath, drillToPath } = useScanStore();

  // Don't show if at root
  if (navigationPath.length === 0) {
    return null;
  }

  const handleRootClick = () => {
    drillToPath(-1); // Go to root
  };

  const handlePathClick = (index: number) => {
    drillToPath(index);
  };

  return (
    <nav
      className={`flex items-center gap-1 text-sm ${className}`}
      aria-label="Breadcrumb"
    >
      {/* Root button */}
      <button
        onClick={handleRootClick}
        className="text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-surface-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>

      {/* Path segments */}
      {navigationPath.map((folder, index) => {
        const isLast = index === navigationPath.length - 1;
        const folderName = folder.split('/').pop() || folder;

        return (
          <span key={folder} className="flex items-center gap-1">
            <span className="text-text-muted">/</span>
            {isLast ? (
              <span className="text-text-primary font-medium px-2 py-1">
                {folderName}
              </span>
            ) : (
              <button
                onClick={() => handlePathClick(index)}
                className="text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-surface-3"
              >
                {folderName}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
