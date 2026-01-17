/**
 * Main canvas component - React Flow wrapper
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ScanResult, FileNode as FileNodeType } from '@surveyor/core';
import { FileNode } from './FileNode';
import { FolderNode } from './FolderNode';
import { groupFilesByFolder, calculateFolderLayout, type FolderGroup } from '../../utils/layout';
import { generateImportEdges } from '../../utils/connections';
import { useScanStore } from '../../stores/scan-store';

export interface CanvasProps {
  scanData: ScanResult | null;
}

const nodeTypes: NodeTypes = {
  file: FileNode,
  folder: FolderNode,
};

// Style constants
const EDGE_NORMAL = { stroke: '#525252', strokeWidth: 1, opacity: 1 };
const EDGE_HIGHLIGHTED = { stroke: '#60a5fa', strokeWidth: 2, opacity: 1 };
const EDGE_FADED = { stroke: '#525252', strokeWidth: 1, opacity: 0.2 };

// Layout constants for folder view
const FOLDER_LAYOUT = {
  nodeWidth: 200,
  nodeHeight: 70,
  horizontalGap: 80,
  verticalGap: 40,
  columns: 4,
};

interface FolderLayoutNode {
  id: string;
  type: 'folder';
  position: { x: number; y: number };
  data: {
    label: string;
    folderPath: string;
    fileCount: number;
    functionCount: number;
    warningCount: number;
    onWarningBadgeClick?: (folderPath: string) => void;
  };
}

/**
 * Build a map of folder path -> warning count
 * by examining which folders contain affected nodes
 */
function buildFolderWarningCounts(
  groups: FolderGroup[],
  warnings: ScanResult['warnings'],
  nodes: ScanResult['nodes']
): Map<string, number> {
  const counts = new Map<string, number>();

  // Initialize all folders with 0
  for (const group of groups) {
    counts.set(group.path, 0);
  }

  // Count warnings per folder based on affected nodes
  for (const warning of warnings) {
    const foldersAffected = new Set<string>();

    for (const nodeId of warning.affectedNodes) {
      const node = nodes[nodeId];
      if (node) {
        // Extract folder path from file path
        const parts = node.filePath.split('/');
        const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        foldersAffected.add(folderPath);
      }
    }

    // Increment count for each affected folder (once per warning)
    for (const folder of foldersAffected) {
      counts.set(folder, (counts.get(folder) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Get file IDs with warnings in a specific folder
 */
function getFilesWithWarningsInFolder(
  folderPath: string,
  warnings: ScanResult['warnings'],
  nodes: ScanResult['nodes']
): string[] {
  const fileIds = new Set<string>();

  for (const warning of warnings) {
    for (const nodeId of warning.affectedNodes) {
      const node = nodes[nodeId];
      if (node) {
        // Extract folder path from file path
        const parts = node.filePath.split('/');
        const nodeFolderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        if (nodeFolderPath === folderPath) {
          fileIds.add(nodeId);
        }
      }
    }
  }

  return Array.from(fileIds);
}

/**
 * Calculate layout for folder nodes in a grid
 */
function calculateFolderGridLayout(
  groups: FolderGroup[],
  warnings: ScanResult['warnings'],
  nodes: ScanResult['nodes'],
  onWarningBadgeClick?: (folderPath: string) => void
): FolderLayoutNode[] {
  const warningCounts = buildFolderWarningCounts(groups, warnings, nodes);

  return groups.map((group, index) => {
    const col = index % FOLDER_LAYOUT.columns;
    const row = Math.floor(index / FOLDER_LAYOUT.columns);

    const totalFunctions = group.files.reduce((sum, f) => sum + f.functions.length, 0);

    return {
      id: `folder:${group.path}`,
      type: 'folder' as const,
      position: {
        x: col * (FOLDER_LAYOUT.nodeWidth + FOLDER_LAYOUT.horizontalGap) + 40,
        y: row * (FOLDER_LAYOUT.nodeHeight + FOLDER_LAYOUT.verticalGap) + 40,
      },
      data: {
        label: group.path.split('/').pop() || group.path,
        folderPath: group.path,
        fileCount: group.files.length,
        functionCount: totalFunctions,
        warningCount: warningCounts.get(group.path) || 0,
        onWarningBadgeClick,
      },
    };
  });
}

/**
 * Inner canvas component that uses React Flow hooks
 */
function CanvasInner({ scanData }: CanvasProps) {
  const { fitView } = useReactFlow();
  const currentFolder = useScanStore((state) => state.currentFolder);
  const hoveredNodeId = useScanStore((state) => state.hoveredNodeId);
  const highlightedNodeIds = useScanStore((state) => state.highlightedNodeIds);
  const hoverNode = useScanStore((state) => state.hoverNode);
  const selectNode = useScanStore((state) => state.selectNode);
  const drillInto = useScanStore((state) => state.drillInto);
  const setHighlightedNodes = useScanStore((state) => state.setHighlightedNodes);
  const searchQuery = useScanStore((state) => state.searchQuery);

  // Handle warning badge click on folder nodes
  const handleWarningBadgeClick = useCallback((folderPath: string) => {
    if (!scanData) return;
    // Get files with warnings in this folder
    const filesWithWarnings = getFilesWithWarningsInFolder(
      folderPath,
      scanData.warnings,
      scanData.nodes
    );
    // Drill into the folder and highlight files with warnings
    drillInto(folderPath);
    setHighlightedNodes(filesWithWarnings);
  }, [scanData, drillInto, setHighlightedNodes]);

  // Track previous folder for fitView on change
  const prevFolderRef = useRef(currentFolder);

  const { displayNodes, displayEdges, edgeMap } = useMemo(() => {
    if (!scanData) {
      return {
        displayNodes: [] as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    const groups = groupFilesByFolder(scanData.nodes);

    // Root view: show folders
    if (currentFolder === null) {
      const folderNodes = calculateFolderGridLayout(
        groups,
        scanData.warnings,
        scanData.nodes,
        handleWarningBadgeClick
      );
      return {
        displayNodes: folderNodes as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    // Drilled-in view: show files in current folder
    const currentGroup = groups.find(g => g.path === currentFolder);
    if (!currentGroup) {
      return {
        displayNodes: [] as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    // Filter nodes to only include files in current folder
    const filteredNodes: Record<string, FileNodeType> = {};
    currentGroup.files.forEach(file => {
      filteredNodes[file.id] = file;
    });

    const layoutNodes = calculateFolderLayout(filteredNodes);
    const nodes: Node[] = layoutNodes.map(ln => ({
      id: ln.id,
      type: 'file',
      position: ln.position,
      data: ln.data,
    }));

    // Generate edges only between files in current folder
    const edges: Edge[] = generateImportEdges(filteredNodes, {
      animated: false,
      strokeWidth: 1,
    });

    // Build connection map for hover highlighting
    const connectionMap = new Map<string, Set<string>>();
    edges.forEach(edge => {
      if (!connectionMap.has(edge.source)) {
        connectionMap.set(edge.source, new Set());
      }
      if (!connectionMap.has(edge.target)) {
        connectionMap.set(edge.target, new Set());
      }
      connectionMap.get(edge.source)!.add(edge.target);
      connectionMap.get(edge.target)!.add(edge.source);
    });

    return {
      displayNodes: nodes,
      displayEdges: edges,
      edgeMap: connectionMap,
    };
  }, [scanData, currentFolder, handleWarningBadgeClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  // Update nodes when displayNodes changes
  useEffect(() => {
    setNodes(displayNodes);
  }, [displayNodes, setNodes]);

  // Update edges when displayEdges changes
  useEffect(() => {
    setEdges(displayEdges);
  }, [displayEdges, setEdges]);

  // Track last focused highlights to avoid duplicate focus
  const lastFocusedHighlights = useRef<string>('');

  // Fit view when folder changes (without highlights)
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      prevFolderRef.current = currentFolder;
      // Only do generic fitView if no highlights pending
      if (highlightedNodeIds.length === 0) {
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 200 });
        }, 50);
      }
    }
  }, [currentFolder, fitView, highlightedNodeIds.length]);

  // Focus on highlighted nodes whenever they change
  useEffect(() => {
    if (highlightedNodeIds.length === 0) {
      lastFocusedHighlights.current = '';
      return;
    }

    // Create a key to track if we've already focused on this exact set
    const highlightKey = highlightedNodeIds.sort().join(',');
    if (highlightKey === lastFocusedHighlights.current) {
      return; // Already focused on these
    }

    // Wait for nodes to render after folder navigation
    setTimeout(() => {
      const nodesToFocus = displayNodes.filter(n => highlightedNodeIds.includes(n.id));
      if (nodesToFocus.length > 0) {
        lastFocusedHighlights.current = highlightKey;
        fitView({
          nodes: nodesToFocus,
          padding: 0.5,
          duration: 300,
          maxZoom: 1.2,
          minZoom: 1.0,
        });
      }
    }, 100); // Slightly longer delay to ensure folder navigation completes
  }, [highlightedNodeIds, displayNodes, fitView]);

  // Get connected node IDs for highlighting
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = edgeMap.get(hoveredNodeId) || new Set();
    return new Set([hoveredNodeId, ...connected]);
  }, [hoveredNodeId, edgeMap]);

  // Apply hover highlighting to edges
  const styledEdges = useMemo(() => {
    if (!hoveredNodeId || currentFolder === null) {
      return edges.map(edge => ({
        ...edge,
        style: EDGE_NORMAL,
      }));
    }

    return edges.map(edge => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      return {
        ...edge,
        style: isConnected ? EDGE_HIGHLIGHTED : EDGE_FADED,
        zIndex: isConnected ? 10 : 0,
      };
    });
  }, [edges, hoveredNodeId, currentFolder]);

  // Check if node matches search query
  const matchesSearch = useCallback((node: Node) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const label = (node.data.label as string || '').toLowerCase();
    const folderPath = (node.data.folderPath as string || '').toLowerCase();
    const filePath = (node.data.filePath as string || '').toLowerCase();
    return label.includes(query) || folderPath.includes(query) || filePath.includes(query);
  }, [searchQuery]);

  // Apply hover, search, and warning highlighting to nodes
  const styledNodes = useMemo(() => {
    const highlightSet = new Set(highlightedNodeIds);
    const hasWarningHighlight = highlightedNodeIds.length > 0;

    return nodes.map(node => {
      const isSearchMatch = matchesSearch(node);
      const hasSearchQuery = searchQuery.length > 0;
      const isWarningHighlighted = highlightSet.has(node.id);

      // Warning highlighting takes top precedence
      if (hasWarningHighlight) {
        return {
          ...node,
          data: {
            ...node.data,
            isFaded: !isWarningHighlighted,
            isHighlighted: isWarningHighlighted,
          },
        };
      }

      // Search takes precedence over hover
      if (hasSearchQuery) {
        return {
          ...node,
          data: {
            ...node.data,
            isFaded: !isSearchMatch,
            isHighlighted: isSearchMatch,
          },
        };
      }

      // No search - use hover highlighting
      if (!hoveredNodeId) {
        return {
          ...node,
          data: { ...node.data, isFaded: false, isHighlighted: false },
        };
      }

      const isConnected = connectedNodeIds.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          isFaded: !isConnected,
          isHighlighted: node.id === hoveredNodeId,
        },
      };
    });
  }, [nodes, hoveredNodeId, connectedNodeIds, searchQuery, matchesSearch, highlightedNodeIds]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // If it's a folder node, drill into it
    if (node.type === 'folder') {
      const folderPath = (node.data as { folderPath: string }).folderPath;
      drillInto(folderPath);
    } else {
      // File node - select it
      selectNode(node.id);
    }
  }, [selectNode, drillInto]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_event, node) => {
    hoverNode(node.id);
  }, [hoverNode]);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    hoverNode(null);
  }, [hoverNode]);

  if (!scanData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-1 text-text-secondary">
        No scan data loaded
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        style: { stroke: '#525252', strokeWidth: 1 },
        type: 'smoothstep',
      }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#2e2e2e"
      />
      <MiniMap
        nodeStrokeColor="#525252"
        nodeColor="#242424"
        nodeBorderRadius={4}
        maskColor="rgba(15, 15, 15, 0.8)"
        className="!bg-surface-1 !border-surface-3"
      />
      <Controls
        showInteractive={false}
        className="!bg-surface-2 !border-surface-3 !shadow-md"
      />
    </ReactFlow>
  );
}

/**
 * Main visualization canvas using React Flow
 * Displays folder clusters or file nodes with import connections
 */
export function Canvas({ scanData }: CanvasProps) {
  return (
    <div className="w-full h-full">
      <ReactFlowProvider>
        <CanvasInner scanData={scanData} />
      </ReactFlowProvider>
    </div>
  );
}
