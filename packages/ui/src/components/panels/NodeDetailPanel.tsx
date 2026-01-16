/**
 * Panel showing details for selected node
 * Phase 3: Shows file name, path, functions, imports
 */

import { useScanStore } from '../../stores/scan-store';
import type { FileNode, NodeType } from '@surveyor/core';

interface NodeDetailPanelProps {
  className?: string;
}

/**
 * Right-side detail panel showing information about selected node
 */
export function NodeDetailPanel({ className = '' }: NodeDetailPanelProps) {
  const { selectedNodeId, currentScan, selectNode } = useScanStore();

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
        {/* File Path */}
        <section>
          <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-2">Path</h3>
          <code className="text-text-primary text-sm font-mono block break-all">
            {node.filePath}
          </code>
        </section>

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
            <ul className="space-y-1">
              {node.functions.map((fnId) => {
                const fnNode = currentScan.nodes[fnId];
                const fnName = fnNode?.name || fnId;
                return (
                  <li
                    key={fnId}
                    className="text-text-primary text-sm font-mono py-1 px-2 bg-surface-1 rounded"
                  >
                    {fnName}()
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
