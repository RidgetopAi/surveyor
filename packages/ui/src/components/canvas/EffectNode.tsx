/**
 * Effect node — a function in the data-flow view, accented by the side-effect
 * group it belongs to (DB / HTTP / file / …). The accent color and effect label
 * are computed by the data-flow view strategy and passed in via node data.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { EffectGroup } from '../../config/view.config';

export interface EffectNodeDataProps {
  label: string;
  filePath: string;
  effectGroup: EffectGroup;
  effectLabel: string;
  color: string;
  isAsync?: boolean;
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

function EffectNodeComponent({ data }: { data: EffectNodeDataProps }) {
  const { isFaded, isHighlighted, color, effectLabel, label, filePath, isAsync } = data;

  return (
    <div
      className={`
        bg-surface-2 border rounded-lg px-3 py-2 min-w-[160px] shadow-md shadow-black/20
        transition-all duration-150
        ${isFaded ? 'opacity-30' : 'opacity-100'}
        ${isHighlighted ? 'ring-1 ring-accent-primary/60' : ''}
      `}
      style={{ borderLeft: `4px solid ${color}`, borderColor: isHighlighted ? color : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" style={{ background: color }} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-text-primary text-sm font-medium truncate">{label}</span>
          {isAsync && <span className="text-text-muted text-[10px] uppercase">async</span>}
        </div>
        <span className="text-text-muted text-xs truncate">{filePath}</span>
        <span className="text-xs font-medium" style={{ color }}>
          {effectLabel}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2" style={{ background: color }} />
    </div>
  );
}

export const EffectNode = memo(EffectNodeComponent);
