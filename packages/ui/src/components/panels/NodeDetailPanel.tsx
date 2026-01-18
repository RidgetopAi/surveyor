/**
 * Panel showing details for selected node
 * Phase 3: Shows file name, path, functions, imports
 * Phase 4: Shows behavioral summaries and flags for functions
 */

import { useState } from 'react';
import { useScanStore } from '../../stores/scan-store';
import type { FileNode, FunctionNode, NodeType, BehavioralFlags } from '@surveyor/core';

interface NodeDetailPanelProps {
  className?: string;
}

/**
 * Open file in nvim via server API
 * Returns { success: boolean, error?: string }
 */
async function openFileInEditor(
  projectPath: string,
  filePath: string,
  line?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/v1/open-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, filePath, line }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Right-side detail panel showing information about selected node
 */
export function NodeDetailPanel({ className = '' }: NodeDetailPanelProps) {
  const { selectedNodeId, currentScan, selectNode } = useScanStore();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleOpenFile = async (projectPath: string, filePath: string, line?: number) => {
    const result = await openFileInEditor(projectPath, filePath, line);
    if (result.success) {
      setToast({ message: 'Opened in nvim', type: 'success' });
    } else {
      setToast({ message: result.error || 'Failed to open', type: 'error' });
    }
    setTimeout(() => setToast(null), 2000);
  };

  if (!selectedNodeId || !currentScan) {
    return null;
  }

  const node = currentScan.nodes[selectedNodeId];
  if (!node) {
    return null;
  }

  // Type guard for FileNode
  const isFileNode = (n: typeof node): n is FileNode => n.type === ('file' as NodeType);

  if (!isFileNode(node)) {
    return null; // Phase 3 only handles file nodes
  }

  const handleClose = () => {
    selectNode(null);
  };

  return (
    <div
      className={`w-80 bg-surface-2 border-l border-surface-3 flex flex-col overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
        <h2 className="text-text-primary font-semibold truncate">{node.name}</h2>
        <button
          onClick={handleClose}
          className="text-text-muted hover:text-text-primary transition-colors p-1"
          aria-label="Close panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* File Path - clickable to open in editor */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">Path</h3>
          <button
            onClick={() => handleOpenFile(currentScan.projectPath, node.filePath, node.line)}
            className="text-left text-accent-primary text-sm font-mono block break-all hover:text-accent-secondary hover:underline transition-colors cursor-pointer"
            title="Open in editor"
          >
            {node.filePath}
          </button>
        </section>

        {/* Toast notification */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-opacity ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Line Range */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">Lines</h3>
          <span className="text-text-primary text-sm">
            {node.line} - {node.endLine}
          </span>
        </section>

        {/* Functions */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">
            Functions ({node.functions.length})
          </h3>
          {node.functions.length > 0 ? (
            <ul className="space-y-3">
              {node.functions.map((fnId) => {
                const fnNode = currentScan.nodes[fnId] as FunctionNode | undefined;
                const fnName = fnNode?.name || fnId;
                const behavioral = fnNode?.behavioral;

                return (
                  <li
                    key={fnId}
                    className="text-sm bg-surface-1 rounded p-2"
                  >
                    <div className="font-mono text-text-primary">
                      {fnName}()
                      {fnNode?.isAsync && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-accent-secondary/20 text-accent-secondary rounded">
                          async
                        </span>
                      )}
                    </div>

                    {/* Behavioral Summary */}
                    {behavioral && (
                      <div className="mt-2 space-y-2">
                        <p className="text-text-secondary text-xs leading-relaxed">
                          {behavioral.summary}
                        </p>

                        {/* Side Effect Flags */}
                        <FlagBadges flags={behavioral.flags} />

                        {/* Source Indicator */}
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <SourceIcon source={behavioral.source} />
                          <span>
                            {behavioral.source === 'ai' ? 'AI-generated' :
                             behavioral.source === 'docstring' ? 'From docstring' :
                             'Manual'}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="text-text-muted text-sm italic">No functions</span>
          )}
        </section>

        {/* Imports */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">
            Imports ({node.imports.length})
          </h3>
          {node.imports.length > 0 ? (
            <ul className="space-y-2">
              {node.imports.map((imp, idx) => (
                <li key={idx} className="text-sm">
                  <code className="text-accent-primary font-mono">{imp.source}</code>
                  {imp.items.length > 0 && (
                    <ul className="ml-3 mt-1 space-y-0.5">
                      {imp.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="text-text-secondary text-xs font-mono">
                          {item.isDefault ? '(default)' : ''}{' '}
                          {item.name}
                          {item.alias ? ` as ${item.alias}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-text-muted text-sm italic">No imports</span>
          )}
        </section>

        {/* Exports */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">
            Exports ({node.exports.length})
          </h3>
          {node.exports.length > 0 ? (
            <ul className="space-y-1">
              {node.exports.map((exp, idx) => (
                <li
                  key={idx}
                  className="text-text-primary text-sm font-mono py-1 px-2 bg-surface-1 rounded flex items-center gap-2"
                >
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      exp.isDefault
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'bg-surface-3 text-text-secondary'
                    }`}
                  >
                    {exp.kind}
                  </span>
                  {exp.name}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-text-muted text-sm italic">No exports</span>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Display behavioral flags as colored badges
 */
function FlagBadges({ flags }: { flags: BehavioralFlags }) {
  const activeFlags: { key: string; label: string; color: string }[] = [];

  if (flags.databaseRead) activeFlags.push({ key: 'dbr', label: 'DB Read', color: 'bg-blue-500/20 text-blue-400' });
  if (flags.databaseWrite) activeFlags.push({ key: 'dbw', label: 'DB Write', color: 'bg-orange-500/20 text-orange-400' });
  if (flags.httpCall) activeFlags.push({ key: 'http', label: 'HTTP', color: 'bg-purple-500/20 text-purple-400' });
  if (flags.fileRead) activeFlags.push({ key: 'fr', label: 'File Read', color: 'bg-cyan-500/20 text-cyan-400' });
  if (flags.fileWrite) activeFlags.push({ key: 'fw', label: 'File Write', color: 'bg-yellow-500/20 text-yellow-400' });
  if (flags.sendsNotification) activeFlags.push({ key: 'notif', label: 'Notification', color: 'bg-pink-500/20 text-pink-400' });
  if (flags.modifiesGlobalState) activeFlags.push({ key: 'global', label: 'Global State', color: 'bg-red-500/20 text-red-400' });

  if (activeFlags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activeFlags.map((flag) => (
        <span
          key={flag.key}
          className={`text-xs px-1.5 py-0.5 rounded ${flag.color}`}
        >
          {flag.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Icon indicating the source of the summary
 */
function SourceIcon({ source }: { source: string }) {
  if (source === 'ai') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent-primary"
      >
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <path d="M9 17h6" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}
