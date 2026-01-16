/**
 * Custom React Flow node for displaying files
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { FileNode as FileNodeData } from '@surveyor/core';

export interface FileNodeDataProps {
  label: string;
  filePath: string;
  fileData: FileNodeData;
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

/**
 * Basic file node component for React Flow
 * Shows file name with connection handles
 * Supports hover highlighting/fading
 */
function FileNodeComponent({ data }: { data: FileNodeDataProps }) {
  const functionCount = data.fileData.functions.length;
  const exportCount = data.fileData.exports.length;
  const { isFaded, isHighlighted } = data;

  return (
    <div
      className={`
        bg-surface-2 border rounded-lg px-3 py-2 min-w-[140px] shadow-md shadow-black/20
        transition-all duration-150
        ${isFaded ? 'opacity-30' : 'opacity-100'}
        ${isHighlighted ? 'border-accent-primary ring-1 ring-accent-primary/50' : 'border-surface-3'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-accent-primary !w-2 !h-2"
      />

      <div className="flex flex-col gap-1">
        <span className="text-text-primary text-sm font-medium truncate">
          {data.label}
        </span>
        <span className="text-text-muted text-xs truncate">
          {data.filePath}
        </span>
        {(functionCount > 0 || exportCount > 0) && (
          <div className="flex gap-2 text-xs text-text-secondary">
            {functionCount > 0 && <span>{functionCount} fn</span>}
            {exportCount > 0 && <span>{exportCount} exp</span>}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-accent-primary !w-2 !h-2"
      />
    </div>
  );
}

export const FileNode = memo(FileNodeComponent);
