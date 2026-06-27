/**
 * FindingsPanel — the actionable view of trustworthy analysis (the P1 payoff).
 *
 * Lists findings with category + severity, a SOURCE badge (knip /
 * dependency-cruiser / surveyor), a CONFIDENCE bar, the suggestion, and a
 * one-click DISMISS. Dismissals persist (localStorage, keyed by stable finding
 * identity) so they survive reloads and re-scans. A confidence-threshold slider
 * hides low-signal findings. Clicking a finding highlights + navigates to its
 * affected node(s) on the canvas.
 *
 * All selection logic is delegated to pure, unit-tested helpers in
 * `lib/findings/*`; this component only wires them to the store + DOM.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  RotateCcw,
  EyeOff,
} from 'lucide-react';
import { useScanStore } from '../../stores/scan-store';
import {
  filterFindings,
  countBelowThreshold,
} from '../../lib/findings/filter-findings';
import type { FindingLike } from '../../lib/findings/types';
import {
  loadDismissed,
  saveDismissed,
  withDismissed,
  withoutDismissed,
  getBrowserStorage,
} from '../../lib/findings/dismissed-store';
import {
  SOURCE_BADGES,
  UNKNOWN_SOURCE_BADGE,
  CONFIDENCE_THRESHOLD,
  type FindingLevel,
  type FindingSource,
} from '../../config/findings.config';
import { folderOf } from '../../views/graph-utils';

interface FindingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEVEL_UI: Record<FindingLevel, { icon: typeof AlertCircle; color: string }> = {
  error: { icon: AlertCircle, color: 'text-status-error' },
  warning: { icon: AlertTriangle, color: 'text-status-warning' },
  info: { icon: Info, color: 'text-accent-primary' },
};

const CATEGORY_LABELS: Record<string, string> = {
  circular_dependency: 'Circular',
  orphaned_code: 'Orphaned',
  unused_export: 'Unused Export',
  large_file: 'Large File',
  duplicate_code: 'Duplicate',
  deep_nesting: 'Deep Nesting',
  missing_types: 'No Types',
  security_concern: 'Security',
};

function sourceBadge(source: string) {
  return SOURCE_BADGES[source as FindingSource] ?? UNKNOWN_SOURCE_BADGE;
}

export function FindingsPanel({ isOpen, onClose }: FindingsPanelProps) {
  const { currentScan, selectNode, setHighlightedNodes, drillInto, getNodeById } =
    useScanStore();

  const storage = useMemo(() => getBrowserStorage(), []);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [minConfidence, setMinConfidence] = useState(CONFIDENCE_THRESHOLD.default);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);

  // Load persisted dismissals once when the panel first opens.
  useEffect(() => {
    if (isOpen && storage) {
      setDismissedIds(loadDismissed(storage));
    }
  }, [isOpen, storage]);

  // `currentScan.warnings` is a core Warning[] — structurally a FindingLike[].
  const findings = (currentScan?.warnings ?? []) as unknown as FindingLike[];

  const visible = useMemo(
    () => filterFindings(findings, { dismissedIds, minConfidence, showDismissed }),
    [findings, dismissedIds, minConfidence, showDismissed]
  );

  const hiddenByThreshold = useMemo(
    () => countBelowThreshold(findings, minConfidence),
    [findings, minConfidence]
  );

  const persist = useCallback(
    (next: Set<string>) => {
      setDismissedIds(next);
      if (storage) saveDismissed(storage, next);
    },
    [storage]
  );

  const handleDismiss = useCallback(
    (identity: string) => {
      persist(withDismissed(dismissedIds, identity));
      if (selectedIdentity === identity) {
        setSelectedIdentity(null);
        setHighlightedNodes([]);
      }
    },
    [persist, dismissedIds, selectedIdentity, setHighlightedNodes]
  );

  const handleRestore = useCallback(
    (identity: string) => persist(withoutDismissed(dismissedIds, identity)),
    [persist, dismissedIds]
  );

  // Click a finding → highlight its affected nodes + navigate the canvas to them.
  const handleSelect = useCallback(
    (finding: FindingLike, identity: string) => {
      setSelectedIdentity(identity);
      setHighlightedNodes(finding.affectedNodes);

      const firstNodeId = finding.affectedNodes[0];
      if (firstNodeId) {
        const node = getNodeById(firstNodeId);
        if (node) {
          drillInto(folderOf(node.filePath));
        }
        selectNode(firstNodeId);
      }
    },
    [setHighlightedNodes, getNodeById, drillInto, selectNode]
  );

  const handleClose = useCallback(() => {
    setHighlightedNodes([]);
    setSelectedIdentity(null);
    onClose();
  }, [setHighlightedNodes, onClose]);

  if (!isOpen || !currentScan) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-96 bg-surface-2 border-r border-surface-3 shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-surface-3 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-status-warning" />
          <h2 className="font-semibold">Findings</h2>
          <span className="text-text-muted text-sm">({visible.length})</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-surface-3 rounded transition-colors"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Controls */}
      <div className="shrink-0 border-b border-surface-3 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="confThreshold" className="text-text-secondary">
            Min confidence
          </label>
          <span className="text-text-primary font-mono">
            {Math.round(minConfidence * 100)}%
          </span>
        </div>
        <input
          id="confThreshold"
          type="range"
          min={CONFIDENCE_THRESHOLD.min}
          max={CONFIDENCE_THRESHOLD.max}
          step={CONFIDENCE_THRESHOLD.step}
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value))}
          className="w-full accent-accent-primary"
        />
        <div className="flex items-center justify-between">
          {hiddenByThreshold > 0 ? (
            <span className="text-text-muted text-xs">
              {hiddenByThreshold} below threshold
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={() => setShowDismissed((s) => !s)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              showDismissed
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            {showDismissed ? 'Hiding off' : 'Show dismissed'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-text-secondary">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{findings.length === 0 ? 'No findings detected' : 'No findings match the filter'}</p>
          </div>
        ) : (
          visible.map(({ finding, identity, isDismissed }) => (
            <FindingCard
              key={identity}
              finding={finding}
              identity={identity}
              isDismissed={isDismissed}
              isSelected={selectedIdentity === identity}
              affectedNames={finding.affectedNodes
                .slice(0, 4)
                .map((id) => getNodeById(id)?.name ?? id)}
              extraAffected={Math.max(0, finding.affectedNodes.length - 4)}
              onSelect={() => handleSelect(finding, identity)}
              onDismiss={() => handleDismiss(identity)}
              onRestore={() => handleRestore(identity)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FindingCardProps {
  finding: FindingLike;
  identity: string;
  isDismissed: boolean;
  isSelected: boolean;
  affectedNames: string[];
  extraAffected: number;
  onSelect: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}

function FindingCard({
  finding,
  isDismissed,
  isSelected,
  affectedNames,
  extraAffected,
  onSelect,
  onDismiss,
  onRestore,
}: FindingCardProps) {
  const level = (finding.level as FindingLevel) in LEVEL_UI
    ? (finding.level as FindingLevel)
    : 'info';
  const { icon: LevelIcon, color } = LEVEL_UI[level];
  const badge = sourceBadge(finding.source);
  const confidencePct = Math.round(finding.confidence * 100);

  return (
    <div
      className={`rounded border bg-surface-1 transition-colors ${
        isSelected ? 'border-accent-primary' : 'border-surface-3'
      } ${isDismissed ? 'opacity-50' : ''}`}
    >
      <button onClick={onSelect} className="w-full text-left p-3 space-y-2">
        {/* Top row: severity + category + source */}
        <div className="flex items-center gap-2 flex-wrap">
          <LevelIcon className={`w-4 h-4 ${color}`} />
          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
            {CATEGORY_LABELS[finding.category] ?? finding.category}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm text-text-primary leading-snug">{finding.title}</p>

        {/* Confidence bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-muted">
            <span>Confidence</span>
            <span className="font-mono">{confidencePct}%</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        {/* Suggestion */}
        {finding.suggestion && (
          <div className="bg-surface-2 rounded p-2">
            <p className="text-xs font-medium text-accent-primary mb-0.5">Suggestion</p>
            <p className="text-text-secondary text-xs leading-relaxed">
              {finding.suggestion.summary}
            </p>
          </div>
        )}

        {/* Affected */}
        {affectedNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {affectedNames.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="text-xs px-1.5 py-0.5 bg-surface-3 rounded truncate max-w-[140px]"
                title={name}
              >
                {name}
              </span>
            ))}
            {extraAffected > 0 && (
              <span className="text-xs text-text-muted px-1">+{extraAffected} more</span>
            )}
          </div>
        )}
      </button>

      {/* Dismiss / Restore footer */}
      <div className="px-3 pb-2 flex justify-end">
        {isDismissed ? (
          <button
            onClick={onRestore}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
        ) : (
          finding.dismissible && (
            <button
              onClick={onDismiss}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Dismiss
            </button>
          )
        )}
      </div>
    </div>
  );
}
