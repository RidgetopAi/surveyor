/**
 * Panel showing list of warnings grouped by severity
 */

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useScanStore } from '../../stores/scan-store';

// Local type definition to avoid importing Node.js deps from @surveyor/core
type WarningLevel = 'info' | 'warning' | 'error';

interface Warning {
  id: string;
  category: string;
  level: WarningLevel;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion: { summary: string; reasoning: string } | null;
}

interface WarningPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const levelConfig: Record<WarningLevel, { icon: typeof AlertCircle; color: string; label: string }> = {
  error: { icon: AlertCircle, color: 'text-status-error', label: 'Errors' },
  warning: { icon: AlertTriangle, color: 'text-status-warning', label: 'Warnings' },
  info: { icon: Info, color: 'text-accent-primary', label: 'Info' },
};

const levelOrder: WarningLevel[] = ['error', 'warning', 'info'];

export function WarningPanel({ isOpen, onClose }: WarningPanelProps) {
  const { currentScan, selectNode, setHighlightedNodes } = useScanStore();
  const [expandedLevels, setExpandedLevels] = useState<Set<WarningLevel>>(
    new Set<WarningLevel>(['error', 'warning'])
  );
  const [selectedWarningId, setSelectedWarningId] = useState<string | null>(null);

  if (!isOpen || !currentScan) return null;

  // Cast to local Warning type (compatible structure)
  const warnings = currentScan.warnings as unknown as Warning[];
  const warningsByLevel = warnings.reduce((acc, warning) => {
    const level = warning.level;
    if (!acc[level]) acc[level] = [];
    acc[level].push(warning);
    return acc;
  }, {} as Record<WarningLevel, Warning[]>);

  const toggleLevel = (level: WarningLevel) => {
    const newExpanded = new Set(expandedLevels);
    if (newExpanded.has(level)) {
      newExpanded.delete(level);
    } else {
      newExpanded.add(level);
    }
    setExpandedLevels(newExpanded);
  };

  const handleWarningClick = (warning: Warning) => {
    setSelectedWarningId(warning.id);
    // Highlight all affected nodes
    setHighlightedNodes(warning.affectedNodes);
    // Select the first affected node
    const firstNode = warning.affectedNodes[0];
    if (firstNode) {
      selectNode(firstNode);
    }
  };

  const handleClose = () => {
    // Clear highlights when closing
    setHighlightedNodes([]);
    setSelectedWarningId(null);
    onClose();
  };

  return (
    <div className="fixed inset-y-0 left-0 w-80 bg-surface-2 border-r border-surface-3 shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-surface-3 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-status-warning" />
          <h2 className="font-semibold">Warnings</h2>
          <span className="text-text-muted text-sm">({warnings.length})</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-surface-3 rounded transition-colors"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {warnings.length === 0 ? (
          <div className="p-4 text-center text-text-secondary">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No warnings detected</p>
          </div>
        ) : (
          <div className="py-2">
            {levelOrder.map((level) => {
              const levelWarnings = warningsByLevel[level] || [];
              if (levelWarnings.length === 0) return null;

              const config = levelConfig[level];
              const Icon = config.icon;
              const isExpanded = expandedLevels.has(level);

              return (
                <div key={level} className="mb-1">
                  {/* Level header */}
                  <button
                    onClick={() => toggleLevel(level)}
                    className="w-full px-4 py-2 flex items-center gap-2 hover:bg-surface-3 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    )}
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="font-medium">{config.label}</span>
                    <span className="text-text-muted text-sm">({levelWarnings.length})</span>
                  </button>

                  {/* Warning list */}
                  {isExpanded && (
                    <div className="ml-4">
                      {levelWarnings.map((warning) => (
                        <WarningItem
                          key={warning.id}
                          warning={warning}
                          isSelected={selectedWarningId === warning.id}
                          onClick={() => handleWarningClick(warning)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected warning details */}
      {selectedWarningId && (
        <SelectedWarningDetails
          warning={warnings.find((w) => w.id === selectedWarningId) || null}
        />
      )}
    </div>
  );
}

interface WarningItemProps {
  warning: Warning;
  isSelected: boolean;
  onClick: () => void;
}

function WarningItem({ warning, isSelected, onClick }: WarningItemProps) {
  const categoryLabels: Record<string, string> = {
    circular_dependency: 'Circular',
    orphaned_code: 'Orphaned',
    unused_export: 'Unused',
    large_file: 'Large File',
    duplicate_code: 'Duplicate',
    deep_nesting: 'Deep Nest',
    missing_types: 'No Types',
    security_concern: 'Security',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2 text-left hover:bg-surface-3 transition-colors border-l-2 ${
        isSelected ? 'border-accent-primary bg-surface-3' : 'border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">
          {categoryLabels[warning.category] || warning.category}
        </span>
      </div>
      <p className="text-sm mt-1 truncate">{warning.title}</p>
    </button>
  );
}

interface SelectedWarningDetailsProps {
  warning: Warning | null;
}

function SelectedWarningDetails({ warning }: SelectedWarningDetailsProps) {
  const { getNodeById } = useScanStore();

  if (!warning) return null;

  return (
    <div className="border-t border-surface-3 bg-surface-1 p-4 max-h-64 overflow-y-auto">
      <h3 className="font-medium text-sm mb-2">{warning.title}</h3>
      <p className="text-text-secondary text-sm mb-3">{warning.description}</p>

      {warning.suggestion && (
        <div className="bg-surface-2 rounded p-3 mb-3">
          <p className="text-sm font-medium text-accent-primary mb-1">Suggestion</p>
          <p className="text-text-secondary text-sm">{warning.suggestion.summary}</p>
        </div>
      )}

      {warning.affectedNodes.length > 0 && (
        <div>
          <p className="text-xs text-text-muted mb-1">Affected:</p>
          <div className="flex flex-wrap gap-1">
            {warning.affectedNodes.slice(0, 5).map((nodeId) => {
              const node = getNodeById(nodeId);
              return (
                <span
                  key={nodeId}
                  className="text-xs px-2 py-0.5 bg-surface-3 rounded truncate max-w-[150px]"
                  title={node?.name || nodeId}
                >
                  {node?.name || nodeId}
                </span>
              );
            })}
            {warning.affectedNodes.length > 5 && (
              <span className="text-xs text-text-muted">
                +{warning.affectedNodes.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
