# Surveyor Contracts & Schemas

## Purpose

This document defines all data structures, naming conventions, API patterns, and folder structure for Surveyor. **Every session must reference this document before writing code.** Consistency is non-negotiable.

---

## Table of Contents

1. [Dependencies](#dependencies)
2. [Naming Conventions](#naming-conventions)
3. [Folder Structure](#folder-structure)
4. [Core Data Schemas](#core-data-schemas)
5. [State Management](#state-management)
6. [API Endpoints](#api-endpoints)
7. [Component Patterns](#component-patterns)
8. [Event Names](#event-names)
9. [CSS/Styling Conventions](#cssstyling-conventions)

---

## Dependencies

### Pinned Versions

**Use these exact versions. Do not upgrade without explicit decision.**

#### Core Package (`packages/core`)

```json
{
  "dependencies": {
    "ts-morph": "^24.0.0",
    "commander": "^12.1.0",
    "glob": "^11.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "@types/uuid": "^10.0.0"
  }
}
```

#### UI Package (`packages/ui`)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xyflow/react": "^12.3.0",
    "zustand": "^5.0.0",
    "framer-motion": "^11.11.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

#### Workspace Root

```json
{
  "devDependencies": {
    "typescript": "^5.6.0",
    "prettier": "^3.4.0",
    "eslint": "^9.15.0"
  }
}
```

### Runtime Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >=20.0.0 |
| pnpm | >=9.0.0 |

### Notes

- **React Flow**: Package renamed to `@xyflow/react` in v12
- **Zustand**: v5 has breaking changes from v4, use v5 patterns
- **Tailwind**: v3.4, not v4 (v4 is in alpha)
- **Vite**: v6 for latest features

---

## Naming Conventions

### Files & Directories

| Type | Convention | Example |
|------|------------|---------|
| Directories | kebab-case | `scan-engine/`, `ui-components/` |
| React components | PascalCase.tsx | `NodeCard.tsx`, `ClusterView.tsx` |
| Hooks | use-kebab-case.ts | `use-scan-store.ts`, `use-keyboard-nav.ts` |
| Utilities | kebab-case.ts | `parse-imports.ts`, `format-summary.ts` |
| Types/Schemas | kebab-case.types.ts | `scan.types.ts`, `node.types.ts` |
| Constants | kebab-case.constants.ts | `colors.constants.ts` |
| Tests | *.test.ts / *.test.tsx | `parse-imports.test.ts` |

### Code Identifiers

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase, verb prefix | `getScanResult`, `parseFileNode`, `renderCluster` |
| React components | PascalCase | `NodeCard`, `WarningPanel`, `MiniMap` |
| Hooks | camelCase, use prefix | `useScanStore`, `useKeyboardNav` |
| Interfaces/Types | PascalCase, noun-based | `ScanResult`, `FileNode`, `Warning` |
| Type props | PascalCase + Props | `NodeCardProps`, `ClusterViewProps` |
| Enums | PascalCase | `NodeType`, `WarningLevel`, `ScanStatus` |
| Enum values | PascalCase | `NodeType.Function`, `NodeType.File` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SCAN_HISTORY`, `DEFAULT_ZOOM_LEVEL` |
| CSS classes | Tailwind utilities | No custom class names |
| Store slices | camelCase + Store | `scanStore`, `uiStore`, `historyStore` |

### Verb Prefixes for Functions

| Prefix | Usage | Example |
|--------|-------|---------|
| `get` | Retrieve/compute value | `getScanById`, `getNodeConnections` |
| `set` | Update state | `setSelectedNode`, `setZoomLevel` |
| `parse` | Transform raw data | `parseImports`, `parseFunction` |
| `render` | Return JSX | `renderNode`, `renderConnection` |
| `handle` | Event handlers | `handleNodeClick`, `handleZoom` |
| `fetch` | Async data retrieval | `fetchBehavioralSummary` |
| `create` | Construct new object | `createScanResult`, `createWarning` |
| `update` | Modify existing | `updateNodePosition`, `updateSummary` |
| `delete` | Remove | `deleteScan`, `deleteWarning` |
| `toggle` | Boolean flip | `toggleFilter`, `toggleClusterExpanded` |
| `is/has/can` | Boolean check | `isOrphaned`, `hasWarnings`, `canExpand` |

---

## Folder Structure

```
surveyor/
├── docs/
│   ├── surveyor-design-doc.md
│   └── surveyor-requirements.md
├── CONTRACTS.md                    # This file
├── README.md
│
├── packages/
│   ├── core/                       # Scan engine (CLI + library)
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── index.ts
│   │   │   │   ├── typescript-parser.ts
│   │   │   │   ├── parse-imports.ts
│   │   │   │   ├── parse-exports.ts
│   │   │   │   ├── parse-functions.ts
│   │   │   │   └── parse-classes.ts
│   │   │   ├── analyzer/
│   │   │   │   ├── index.ts
│   │   │   │   ├── behavioral-analyzer.ts
│   │   │   │   ├── connection-builder.ts
│   │   │   │   └── warning-detector.ts
│   │   │   ├── clustering/
│   │   │   │   ├── index.ts
│   │   │   │   ├── folder-clustering.ts
│   │   │   │   └── smart-clustering.ts
│   │   │   ├── types/
│   │   │   │   ├── index.ts
│   │   │   │   ├── scan.types.ts
│   │   │   │   ├── node.types.ts
│   │   │   │   ├── connection.types.ts
│   │   │   │   └── warning.types.ts
│   │   │   ├── cli/
│   │   │   │   ├── index.ts
│   │   │   │   └── commands/
│   │   │   │       └── scan.ts
│   │   │   └── index.ts            # Public API exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                         # React visualization app
│       ├── src/
│       │   ├── components/
│       │   │   ├── canvas/
│       │   │   │   ├── Canvas.tsx
│       │   │   │   ├── CustomNode.tsx
│       │   │   │   ├── CustomEdge.tsx
│       │   │   │   └── MiniMap.tsx
│       │   │   ├── panels/
│       │   │   │   ├── NodeDetailPanel.tsx
│       │   │   │   ├── WarningPanel.tsx
│       │   │   │   └── InsightsPanel.tsx
│       │   │   ├── controls/
│       │   │   │   ├── SearchBar.tsx
│       │   │   │   ├── FilterChips.tsx
│       │   │   │   ├── Breadcrumb.tsx
│       │   │   │   └── ViewToggle.tsx
│       │   │   ├── overlays/
│       │   │   │   └── ScanProgress.tsx
│       │   │   └── shared/
│       │   │       ├── Badge.tsx
│       │   │       ├── Button.tsx
│       │   │       └── Icon.tsx
│       │   ├── hooks/
│       │   │   ├── use-scan-store.ts
│       │   │   ├── use-ui-store.ts
│       │   │   ├── use-keyboard-nav.ts
│       │   │   └── use-canvas-controls.ts
│       │   ├── stores/
│       │   │   ├── scan-store.ts
│       │   │   ├── ui-store.ts
│       │   │   └── history-store.ts
│       │   ├── utils/
│       │   │   ├── layout.ts
│       │   │   ├── colors.ts
│       │   │   └── animations.ts
│       │   ├── types/
│       │   │   └── ui.types.ts
│       │   ├── constants/
│       │   │   ├── colors.constants.ts
│       │   │   ├── layout.constants.ts
│       │   │   └── keys.constants.ts
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── index.css
│       ├── public/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.js
│       └── vite.config.ts
│
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Core Data Schemas

### Scan Types (`packages/core/src/types/scan.types.ts`)

```typescript
/**
 * Status of a scan operation
 */
export enum ScanStatus {
  Pending = 'pending',
  Parsing = 'parsing',
  Analyzing = 'analyzing',
  Complete = 'complete',
  Failed = 'failed',
}

/**
 * Result of a complete scan operation
 */
export interface ScanResult {
  id: string;                       // UUID
  projectPath: string;              // Absolute path scanned
  projectName: string;              // Derived from folder name or package.json
  status: ScanStatus;
  createdAt: string;                // ISO 8601
  completedAt: string | null;       // ISO 8601
  stats: ScanStats;
  nodes: NodeMap;                   // Record<nodeId, Node>
  connections: Connection[];
  warnings: Warning[];
  clusters: Cluster[];
  errors: ScanError[];              // Parse failures, etc.
}

/**
 * Aggregate statistics for a scan
 */
export interface ScanStats {
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConnections: number;
  totalWarnings: number;
  warningsByLevel: Record<WarningLevel, number>;
  nodesByType: Record<NodeType, number>;
  analyzedCount: number;            // Functions with behavioral summary
  pendingAnalysis: number;          // Functions awaiting LLM analysis
}

/**
 * Error encountered during scan
 */
export interface ScanError {
  filePath: string;
  line: number | null;
  message: string;
  recoverable: boolean;
}

/**
 * Scan comparison result
 */
export interface ScanDiff {
  baseId: string;
  compareId: string;
  added: string[];                  // Node IDs
  removed: string[];                // Node IDs
  modified: string[];               // Node IDs
  stats: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
}
```

### Node Types (`packages/core/src/types/node.types.ts`)

```typescript
/**
 * Types of nodes in the graph
 */
export enum NodeType {
  File = 'file',
  Function = 'function',
  Class = 'class',
  Cluster = 'cluster',
}

/**
 * Source of a behavioral summary
 */
export enum SummarySource {
  Docstring = 'docstring',
  AI = 'ai',
  Manual = 'manual',
}

/**
 * Base properties shared by all nodes
 */
export interface BaseNode {
  id: string;                       // Unique identifier (file path + name hash)
  type: NodeType;
  name: string;                     // Display name
  filePath: string;                 // Relative to project root
  line: number;                     // Starting line number
  endLine: number;                  // Ending line number
}

/**
 * File-level node
 */
export interface FileNode extends BaseNode {
  type: NodeType.File;
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: string[];              // Function node IDs in this file
  classes: string[];                // Class node IDs in this file
}

/**
 * Function node with behavioral analysis
 */
export interface FunctionNode extends BaseNode {
  type: NodeType.Function;
  parentFileId: string;             // FileNode ID
  parentClassId: string | null;     // ClassNode ID if method
  params: ParameterInfo[];
  returnType: string | null;
  isExported: boolean;
  isAsync: boolean;
  behavioral: BehavioralSummary | null;
}

/**
 * Class node
 */
export interface ClassNode extends BaseNode {
  type: NodeType.Class;
  parentFileId: string;
  methods: string[];                // FunctionNode IDs
  properties: PropertyInfo[];
  isExported: boolean;
  extends: string | null;
  implements: string[];
}

/**
 * Union type for all nodes
 */
export type Node = FileNode | FunctionNode | ClassNode;

/**
 * Map of node ID to node
 */
export type NodeMap = Record<string, Node>;

/**
 * Import statement info
 */
export interface ImportInfo {
  source: string;                   // Module path
  items: ImportItem[];
  isTypeOnly: boolean;
}

export interface ImportItem {
  name: string;
  alias: string | null;
  isDefault: boolean;
  isNamespace: boolean;             // import * as X
}

/**
 * Export statement info
 */
export interface ExportInfo {
  name: string;
  alias: string | null;
  isDefault: boolean;
  isTypeOnly: boolean;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'reexport';
}

/**
 * Function parameter info
 */
export interface ParameterInfo {
  name: string;
  type: string | null;
  isOptional: boolean;
  defaultValue: string | null;
}

/**
 * Class property info
 */
export interface PropertyInfo {
  name: string;
  type: string | null;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isReadonly: boolean;
}

/**
 * Behavioral analysis result
 */
export interface BehavioralSummary {
  summary: string;                  // One-line description
  source: SummarySource;
  analyzedAt: string;               // ISO 8601
  flags: BehavioralFlags;
}

/**
 * Side effect flags
 */
export interface BehavioralFlags {
  databaseRead: boolean;
  databaseWrite: boolean;
  httpCall: boolean;
  fileRead: boolean;
  fileWrite: boolean;
  sendsNotification: boolean;
  modifiesGlobalState: boolean;
  hasSideEffects: boolean;          // Catch-all
}
```

### Connection Types (`packages/core/src/types/connection.types.ts`)

```typescript
/**
 * Type of connection between nodes
 */
export enum ConnectionType {
  Import = 'import',                // File imports another file
  FunctionCall = 'function_call',   // Function calls another function
  Inheritance = 'inheritance',      // Class extends another
  Implementation = 'implementation',// Class implements interface
  TypeReference = 'type_reference', // References a type
}

/**
 * Connection between two nodes
 */
export interface Connection {
  id: string;                       // Unique identifier
  sourceId: string;                 // Node ID
  targetId: string;                 // Node ID
  type: ConnectionType;
  weight: number;                   // Usage frequency (1-10 scale)
  metadata: ConnectionMetadata;
}

/**
 * Additional connection metadata
 */
export interface ConnectionMetadata {
  isCircular: boolean;              // Part of circular dependency
  callCount: number;                // Times this connection occurs
  locations: ConnectionLocation[];  // Where in code this connection exists
}

/**
 * Specific location of a connection in source
 */
export interface ConnectionLocation {
  filePath: string;
  line: number;
  column: number;
}
```

### Warning Types (`packages/core/src/types/warning.types.ts`)

```typescript
/**
 * Severity level of a warning
 */
export enum WarningLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

/**
 * Category of warning
 */
export enum WarningCategory {
  CircularDependency = 'circular_dependency',
  OrphanedCode = 'orphaned_code',
  DuplicateCode = 'duplicate_code',
  LargeFile = 'large_file',
  DeepNesting = 'deep_nesting',
  MissingTypes = 'missing_types',
  UnusedExport = 'unused_export',
  SecurityConcern = 'security_concern',
}

/**
 * A detected warning/issue in the codebase
 */
export interface Warning {
  id: string;
  category: WarningCategory;
  level: WarningLevel;
  title: string;                    // Short description
  description: string;              // Detailed explanation
  affectedNodes: string[];          // Node IDs involved
  suggestion: WarningSuggestion | null;
  detectedAt: string;               // ISO 8601
}

/**
 * Suggested fix for a warning
 */
export interface WarningSuggestion {
  summary: string;                  // What to do
  reasoning: string;                // Why this helps
  codeExample: string | null;       // Optional code snippet
  autoFixable: boolean;             // Can Surveyor fix this automatically?
}
```

### Cluster Types (`packages/core/src/types/cluster.types.ts`)

```typescript
/**
 * Method used to create cluster
 */
export enum ClusteringMethod {
  Folder = 'folder',                // Based on file system
  Smart = 'smart',                  // AI/heuristic based
  Manual = 'manual',                // User defined
}

/**
 * Smart cluster category
 */
export enum SmartClusterCategory {
  Backend = 'backend',
  Frontend = 'frontend',
  API = 'api',
  Database = 'database',
  Auth = 'auth',
  Utils = 'utils',
  Types = 'types',
  Config = 'config',
  Tests = 'tests',
  Unknown = 'unknown',
}

/**
 * Health status of a cluster
 */
export enum ClusterHealth {
  Healthy = 'healthy',
  Warning = 'warning',
  Critical = 'critical',
}

/**
 * A grouping of nodes
 */
export interface Cluster {
  id: string;
  name: string;
  method: ClusteringMethod;
  category: SmartClusterCategory | null;  // Only for smart clustering
  nodeIds: string[];                // Nodes in this cluster
  childClusterIds: string[];        // Nested clusters
  parentClusterId: string | null;
  stats: ClusterStats;
  health: ClusterHealth;
  warningCount: number;
}

/**
 * Statistics for a cluster
 */
export interface ClusterStats {
  fileCount: number;
  functionCount: number;
  classCount: number;
  externalConnectionCount: number;  // Connections to nodes outside cluster
  internalConnectionCount: number;  // Connections within cluster
}
```

---

## State Management

### Scan Store (`packages/ui/src/stores/scan-store.ts`)

```typescript
import { create } from 'zustand';
import type { ScanResult, Node, Connection, Warning, Cluster, ScanDiff } from '@surveyor/core';

interface ScanState {
  // Data
  currentScan: ScanResult | null;
  scanHistory: ScanResult[];        // Last 5 scans
  activeDiff: ScanDiff | null;

  // Selection
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  expandedClusterIds: Set<string>;

  // Actions
  setScan: (scan: ScanResult) => void;
  addToHistory: (scan: ScanResult) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  toggleClusterExpanded: (clusterId: string) => void;
  setDiff: (diff: ScanDiff | null) => void;

  // Computed (via selectors)
  getNodeById: (id: string) => Node | undefined;
  getConnectionsForNode: (nodeId: string) => Connection[];
  getWarningsForNode: (nodeId: string) => Warning[];
  getClusterForNode: (nodeId: string) => Cluster | undefined;
}
```

### UI Store (`packages/ui/src/stores/ui-store.ts`)

```typescript
import { create } from 'zustand';

export enum ViewMode {
  Folder = 'folder',
  Smart = 'smart',
}

export enum PanelState {
  Collapsed = 'collapsed',
  Expanded = 'expanded',
}

interface FilterState {
  // By behavior
  showDbWriters: boolean;
  showHttpHandlers: boolean;
  showFileIO: boolean;
  showAuth: boolean;

  // By type
  showFunctions: boolean;
  showClasses: boolean;
  showComponents: boolean;
  showHooks: boolean;
  showTypes: boolean;

  // By status
  showWithWarnings: boolean;
  showOrphaned: boolean;
  showRecentlyChanged: boolean;
  showAIAnalyzed: boolean;
}

interface UIState {
  // View
  viewMode: ViewMode;
  zoomLevel: number;
  panPosition: { x: number; y: number };

  // Panels
  warningPanelState: PanelState;
  insightsPanelState: PanelState;
  detailPanelState: PanelState;

  // Filters
  filters: FilterState;

  // UI preferences
  reducedMotion: boolean;

  // Breadcrumb
  breadcrumb: BreadcrumbItem[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setZoomLevel: (level: number) => void;
  setPanPosition: (pos: { x: number; y: number }) => void;
  togglePanel: (panel: 'warning' | 'insights' | 'detail') => void;
  setFilter: (key: keyof FilterState, value: boolean) => void;
  resetFilters: () => void;
  setReducedMotion: (enabled: boolean) => void;
  pushBreadcrumb: (item: BreadcrumbItem) => void;
  popBreadcrumb: () => void;
  navigateToBreadcrumb: (index: number) => void;
}

interface BreadcrumbItem {
  id: string;
  label: string;
  type: 'project' | 'cluster' | 'file' | 'function';
}
```

---

## API Endpoints

### CLI Commands

```bash
# Scan a directory
surveyor scan <path> [options]
  --output, -o <dir>        Output directory (default: .surveyor/)
  --format, -f <type>       Output format: json (default: json)
  --no-analyze              Skip behavioral analysis
  --verbose, -v             Verbose output

# View scan history
surveyor history [options]
  --limit, -l <n>           Number of scans (default: 5)

# Compare scans
surveyor diff <scan-id-1> <scan-id-2>

# Open visualization
surveyor view [scan-id]
  # Opens browser with visualization
  # If no scan-id, shows most recent
```

### REST API (Future: Mandrel Integration)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/scans` | Trigger new scan |
| `GET` | `/api/v1/scans` | List scans (paginated) |
| `GET` | `/api/v1/scans/:id` | Get scan result |
| `DELETE` | `/api/v1/scans/:id` | Delete scan |
| `GET` | `/api/v1/scans/:id/nodes` | Get nodes for scan |
| `GET` | `/api/v1/scans/:id/nodes/:nodeId` | Get single node |
| `PATCH` | `/api/v1/scans/:id/nodes/:nodeId/summary` | Update behavioral summary |
| `GET` | `/api/v1/scans/:id/connections` | Get connections |
| `GET` | `/api/v1/scans/:id/warnings` | Get warnings |
| `GET` | `/api/v1/scans/:id/clusters` | Get clusters |
| `GET` | `/api/v1/scans/diff` | Compare two scans |

#### Request/Response Shapes

```typescript
// POST /api/v1/scans
interface CreateScanRequest {
  projectPath: string;
  options?: {
    skipAnalysis?: boolean;
  };
}

interface CreateScanResponse {
  scanId: string;
  status: ScanStatus;
}

// PATCH /api/v1/scans/:id/nodes/:nodeId/summary
interface UpdateSummaryRequest {
  summary: string;
}

interface UpdateSummaryResponse {
  nodeId: string;
  behavioral: BehavioralSummary;
}

// GET /api/v1/scans/diff?base=<id>&compare=<id>
interface DiffResponse {
  diff: ScanDiff;
}
```

---

## Component Patterns

### Component Props Interface

Always define props interfaces in the component file:

```typescript
// NodeCard.tsx
interface NodeCardProps {
  node: FunctionNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  onOpenInEditor: (filePath: string, line: number) => void;
}

export function NodeCard({
  node,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onOpenInEditor,
}: NodeCardProps) {
  // ...
}
```

### Event Handler Naming

```typescript
// In component
const handleNodeClick = () => { ... }
const handleMouseEnter = () => { ... }

// In props
onSelect: (nodeId: string) => void;
onHover: (nodeId: string | null) => void;
```

### Animation Variants (Framer Motion)

Define in `utils/animations.ts`:

```typescript
export const nodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2 }
  },
  selected: {
    scale: 1.02,
    transition: { duration: 0.15 }
  },
};

export const panelVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25 }
  },
};

export const connectionVariants = {
  normal: { opacity: 0.6, strokeWidth: 1 },
  highlighted: { opacity: 1, strokeWidth: 2 },
  faded: { opacity: 0.15, strokeWidth: 1 },
};
```

---

## Event Names

### Custom Events

| Event | Payload | Description |
|-------|---------|-------------|
| `scan:started` | `{ scanId: string }` | Scan operation began |
| `scan:progress` | `{ scanId: string, phase: string, progress: number }` | Scan progress update |
| `scan:complete` | `{ scanId: string, result: ScanResult }` | Scan finished |
| `scan:error` | `{ scanId: string, error: ScanError }` | Scan encountered error |
| `analysis:progress` | `{ nodeId: string, total: number, completed: number }` | LLM analysis progress |
| `node:selected` | `{ nodeId: string }` | Node was selected |
| `cluster:expanded` | `{ clusterId: string }` | Cluster drill-down |
| `cluster:collapsed` | `{ clusterId: string }` | Cluster zoom-out |

---

## CSS/Styling Conventions

### Tailwind Only

No custom CSS classes. Use Tailwind utilities exclusively.

### Color Tokens (tailwind.config.js)

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'surface-0': '#0f0f0f',     // Deepest background
        'surface-1': '#1a1a1a',     // Primary background
        'surface-2': '#242424',     // Elevated surfaces
        'surface-3': '#2e2e2e',     // Hover states

        // Text
        'text-primary': '#e5e5e5',
        'text-secondary': '#a3a3a3',
        'text-muted': '#737373',

        // Accents (semantic only)
        'accent-primary': '#60a5fa',   // Selection, focus
        'status-healthy': '#4ade80',
        'status-warning': '#facc15',
        'status-error': '#f87171',

        // Connections
        'connection-normal': '#525252',
        'connection-highlighted': '#60a5fa',
        'connection-circular': '#facc15',
      },
    },
  },
};
```

### Spacing Scale

Use Tailwind's default scale. Common patterns:
- Card padding: `p-4`
- Section gaps: `gap-6`
- Inline spacing: `gap-2`
- Panel margins: `m-4`

### Border Radius

- Cards/Panels: `rounded-lg`
- Buttons: `rounded-md`
- Badges/Chips: `rounded-full`

### Shadows

Minimal shadows on dark theme:
- Elevated panels: `shadow-lg shadow-black/20`
- Hover effects: `shadow-md shadow-black/10`

---

## Checklist for New Code

Before writing any code, verify:

- [ ] File name follows convention (`kebab-case.ts` or `PascalCase.tsx`)
- [ ] Types are defined in appropriate `*.types.ts` file
- [ ] Component has `Props` interface defined
- [ ] Functions use correct verb prefix
- [ ] Enums use PascalCase for both name and values
- [ ] State updates go through Zustand store
- [ ] Animations use predefined variants from `animations.ts`
- [ ] Colors use semantic tokens from Tailwind config
- [ ] No custom CSS classes (Tailwind only)

---

*Last Updated: January 2026*
*Version: 1.0*
