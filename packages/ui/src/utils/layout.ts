/**
 * Layout utilities for node positioning
 */

import type { FileNode, NodeMap, NodeType } from '@surveyor/core';

export interface Position {
  x: number;
  y: number;
}

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
  groupPadding: number;
}

const DEFAULT_CONFIG: LayoutConfig = {
  nodeWidth: 180,
  nodeHeight: 80,
  horizontalGap: 250,
  verticalGap: 100,
  groupPadding: 40,
};

export interface LayoutNode {
  id: string;
  position: Position;
  data: {
    label: string;
    filePath: string;
    fileData: FileNode;
  };
  type: string;
}

export interface FolderGroup {
  path: string;
  files: FileNode[];
}

/**
 * Groups files by their parent directory
 */
export function groupFilesByFolder(nodes: NodeMap): FolderGroup[] {
  const groups = new Map<string, FileNode[]>();

  for (const node of Object.values(nodes)) {
    if (node.type !== ('file' as NodeType)) continue;
    const fileNode = node as FileNode;

    const folderPath = getFolderPath(fileNode.filePath);

    if (!groups.has(folderPath)) {
      groups.set(folderPath, []);
    }
    groups.get(folderPath)!.push(fileNode);
  }

  // Sort groups by path for consistent ordering
  const sortedPaths = Array.from(groups.keys()).sort();

  return sortedPaths.map(path => ({
    path,
    files: groups.get(path)!.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/**
 * Extracts the folder path from a file path
 */
function getFolderPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return '.';
  return parts.slice(0, -1).join('/');
}

/**
 * Calculates layout positions for all file nodes grouped by folder
 */
export function calculateFolderLayout(
  nodes: NodeMap,
  config: Partial<LayoutConfig> = {}
): LayoutNode[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const groups = groupFilesByFolder(nodes);
  const layoutNodes: LayoutNode[] = [];

  let currentX = cfg.groupPadding;

  for (const group of groups) {
    let currentY = cfg.groupPadding;

    for (const file of group.files) {
      layoutNodes.push({
        id: file.id,
        position: { x: currentX, y: currentY },
        data: {
          label: file.name,
          filePath: file.filePath,
          fileData: file,
        },
        type: 'file',
      });

      currentY += cfg.nodeHeight + cfg.verticalGap;
    }

    currentX += cfg.nodeWidth + cfg.horizontalGap;
  }

  return layoutNodes;
}

/**
 * Simple position calculator for legacy support
 */
export function calculateNodePosition(index: number, total: number): Position {
  const columns = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / columns);
  const col = index % columns;

  return {
    x: col * (DEFAULT_CONFIG.nodeWidth + DEFAULT_CONFIG.horizontalGap) + DEFAULT_CONFIG.groupPadding,
    y: row * (DEFAULT_CONFIG.nodeHeight + DEFAULT_CONFIG.verticalGap) + DEFAULT_CONFIG.groupPadding,
  };
}
