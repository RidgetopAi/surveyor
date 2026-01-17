/**
 * Custom React Flow node for displaying folder clusters
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export interface FolderNodeDataProps {
  label: string;
  folderPath: string;
  fileCount: number;
  functionCount: number;
  warningCount: number;
  isFaded?: boolean;
  isHighlighted?: boolean;
  onWarningBadgeClick?: (folderPath: string) => void;
  [key: string]: unknown;
}

/**
 * Folder cluster node component for React Flow
 * Shows folder name with file/function counts and warning badge
 * Click to drill down into the folder
 */
function FolderNodeComponent({ data }: { data: FolderNodeDataProps }) {
  const { isFaded, isHighlighted, warningCount, folderPath, onWarningBadgeClick } = data;

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent folder drill-in
    if (onWarningBadgeClick) {
      onWarningBadgeClick(folderPath);
    }
  };

  return (
    <div
      className={`
        relative bg-surface-1 border-2 border-dashed rounded-xl px-4 py-3 min-w-[160px]
        cursor-pointer hover:border-accent-primary hover:bg-surface-2
        transition-all duration-150
        ${isFaded ? 'opacity-30' : 'opacity-100'}
        ${isHighlighted ? 'border-accent-primary bg-surface-2' : 'border-surface-3'}
      `}
    >
      {/* Warning badge - clickable to show files with warnings */}
      {warningCount > 0 && (
        <button
          onClick={handleBadgeClick}
          className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-status-warning text-surface-0 text-xs font-semibold hover:bg-status-warning/80 hover:scale-110 transition-transform"
          title="Click to show files with warnings"
        >
          {warningCount}
        </button>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-accent-primary !w-2 !h-2 !opacity-50"
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent-primary"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-text-primary text-sm font-medium truncate">
            {data.label}
          </span>
        </div>
        <div className="flex gap-3 text-xs text-text-secondary">
          <span>{data.fileCount} files</span>
          <span>{data.functionCount} fn</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-accent-primary !w-2 !h-2 !opacity-50"
      />
    </div>
  );
}

export const FolderNode = memo(FolderNodeComponent);
