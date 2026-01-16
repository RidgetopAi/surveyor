# Surveyor Implementation Plan

## The Rule

**One phase at a time. No skipping. No "while we're here" additions.**

Each phase has:
- Explicit scope (what we build)
- Explicit exclusions (what we don't touch yet)
- Validation criteria (how we know it's done)
- Stop point (we pause and review before moving on)

If something isn't in the current phase, it doesn't exist yet. Period.

---

## Phase Overview

| Phase | Name | Focus |
|-------|------|-------|
| 0 | Foundation | Project setup, tooling, empty shell |
| 1 | Parser | Extract structure from TypeScript files |
| 2 | Basic Visualization | Render nodes on screen, folder view |
| 3 | Interactions | Click, zoom, drill-down, detail panel |
| 4 | Behavioral Analysis | LLM summaries, side effect flags |
| 5 | Warnings | Detection, display, explanation |
| 6 | Polish | Cinematic feel, transitions, streaming |
| 7 | Smart Clustering | Intelligent grouping toggle |
| 8 | History & Diff | Scan storage, comparison |
| 9 | Advanced | Guided mode, fix suggestions, export |
| 10 | Integration | Mandrel connection |

---

## Phase 0: Foundation

### Scope
- Initialize monorepo structure (pnpm workspaces)
- Set up `packages/core` with TypeScript config
- Set up `packages/ui` with Vite + React + Tailwind
- Install dependencies (ts-morph, react-flow, zustand, framer-motion)
- Configure Tailwind with color tokens from CONTRACTS.md
- Create placeholder files matching folder structure
- Basic CLI entry point that prints "Surveyor v0.1"
- Basic UI that renders "Surveyor" on a dark background

### Exclusions
- No parsing logic
- No visualization logic
- No state management beyond boilerplate
- No components beyond App.tsx shell

### Validation
- [ ] `pnpm install` succeeds
- [ ] `pnpm --filter @surveyor/core build` succeeds
- [ ] `pnpm --filter @surveyor/ui dev` opens browser with dark screen
- [ ] `surveyor` CLI prints version
- [ ] All TypeScript compiles without errors

### Stop Point
Review folder structure. Confirm it matches CONTRACTS.md. Proceed only when foundation is solid.

---

## Phase 1: Parser

### Scope
- Implement TypeScript parser using ts-morph
- Parse single file → extract imports, exports, functions, classes
- Parse directory → walk all .ts/.tsx files
- Output JSON matching `ScanResult` schema from CONTRACTS.md
- CLI command: `surveyor scan <path>` outputs JSON to stdout or file
- Unit tests for parser functions

### Exclusions
- No behavioral analysis (LLM)
- No visualization
- No clusters (just flat file list)
- No warnings detection
- No connections between functions (only file-level imports)

### Validation
- [ ] `surveyor scan ./test-project` produces valid JSON
- [ ] JSON matches `ScanResult` schema exactly
- [ ] All files in directory are parsed
- [ ] Parse errors are captured in `errors` array, don't crash
- [ ] Tests pass

### Stop Point
Run parser on a real codebase (small one). Review JSON output. Is the structure right? Are we capturing what we need? Adjust schema if necessary before moving on.

---

## Phase 2: Basic Visualization

### Scope
- Load JSON scan result into UI
- Render file nodes using React Flow
- Basic node component showing file name
- Folder-based layout (files grouped by directory)
- Connection lines for imports between files
- Minimap visible
- Pan and zoom working (React Flow defaults)

### Exclusions
- No custom node styling beyond basic
- No function-level nodes (files only)
- No drill-down into files
- No detail panel
- No filters
- No search
- No animations
- No breadcrumb

### Validation
- [ ] UI loads scan JSON
- [ ] All files appear as nodes
- [ ] Import connections render as lines
- [ ] Minimap shows overview
- [ ] Can pan and zoom
- [ ] Doesn't crash on 50+ file project

### Stop Point
Look at the visualization. Does it show structure? Can you see the shape of the codebase? What's confusing? What's missing? This is the skeleton — make sure it's right.

---

## Phase 3: Interactions

### Scope
- Click node → opens detail panel (right side)
- Detail panel shows: file name, path, list of functions, list of imports
- Hover node → highlight its connections, fade others
- Click cluster (folder group) → zoom into it (drill-down)
- Breadcrumb appears showing navigation path
- Click breadcrumb → zoom back out
- Search bar → filter/highlight nodes by name

### Exclusions
- No behavioral summaries in detail panel
- No warnings display
- No filter chips (beyond search)
- No smooth animations (just functional transitions)
- No function-level nodes yet

### Validation
- [ ] Clicking node opens detail panel with correct info
- [ ] Hovering fades unrelated connections
- [ ] Can drill into folder cluster
- [ ] Breadcrumb updates correctly
- [ ] Can navigate back via breadcrumb
- [ ] Search finds and highlights nodes

### Stop Point
Use it. Navigate around. Does it feel like exploring a codebase? What's frustrating? What's missing? Don't add features — note them for later phases.

---

## Phase 4: Behavioral Analysis

### Scope
- Integrate LLM API (Grok or similar)
- For each function: send code, receive one-line summary + flags
- Store summaries in scan result JSON
- Display summary in detail panel when function selected
- Show source indicator (AI-generated)
- Caching: store analyzed results, skip on re-scan if unchanged
- Progress indicator during analysis
- CLI flag: `--no-analyze` to skip LLM calls

### Exclusions
- No manual editing of summaries
- No docstring extraction (AI only for now)
- No streaming/progressive display in UI
- No fix suggestions

### Validation
- [ ] Functions get one-line summaries
- [ ] Side effect flags populated (database, http, etc.)
- [ ] Summaries display in detail panel
- [ ] Cached results are reused
- [ ] `--no-analyze` skips LLM calls
- [ ] Progress shown during analysis

### Stop Point
Review the summaries. Are they accurate? Useful? Too verbose? Adjust the prompt. This is where quality matters — don't proceed until summaries are good.

---

## Phase 5: Warnings

### Scope
- Detect circular dependencies (from import graph)
- Detect orphaned code (functions with no incoming calls)
- Detect unused exports
- Warning panel (collapsible) showing list
- Badge on clusters showing warning count
- Click warning → highlight affected nodes
- Warning detail: title, description, affected nodes

### Exclusions
- No fix suggestions
- No explanation of "why this matters"
- No large file detection
- No security concern detection
- No warning severity levels (all equal for now)

### Validation
- [ ] Circular deps detected and listed
- [ ] Orphaned functions detected
- [ ] Unused exports detected
- [ ] Warning panel displays list
- [ ] Cluster badges show counts
- [ ] Clicking warning highlights nodes

### Stop Point
Run on a real codebase. Did it find real issues? False positives? Tune the detection algorithms before moving on.

---

## Phase 6: Polish

### Scope
- Smooth zoom transitions (Framer Motion)
- Smooth drill-down animation
- Node entrance animations (stagger in)
- Connection line animations on hover
- Scan progress: nodes stream in as parsed
- Analysis progress: summaries appear as completed
- Reduced motion toggle
- Refine colors, spacing, typography
- Loading states

### Exclusions
- No new features
- No new functionality
- This is purely visual/feel refinement

### Validation
- [ ] Zoom feels smooth (60fps)
- [ ] Drill-down animates cleanly
- [ ] Nodes animate in during scan
- [ ] Reduced motion toggle disables animations
- [ ] UI feels "crafted" not "utilitarian"

### Stop Point
Show it to someone. First impressions matter. Does it feel premium? What jars? Polish until it doesn't.

---

## Phase 7: Smart Clustering

### Scope
- Toggle between Folder view and Smart view
- Smart clustering algorithm:
  - Identify backend (API handlers, DB access)
  - Identify frontend (React components, hooks)
  - Identify auth-related code
  - Identify utilities/shared
  - Identify types/interfaces
- Clusters display with category label
- Cluster stats on collapsed view

### Exclusions
- No data flow visualization
- No custom user-defined clusters
- No cluster editing

### Validation
- [ ] Toggle switches between folder and smart view
- [ ] Smart clusters are reasonably accurate
- [ ] Categories make sense for the codebase
- [ ] Cluster stats display correctly

### Stop Point
Test on multiple codebases. Does smart clustering help or confuse? Is it better than folder view? Iterate on algorithm if needed.

---

## Phase 8: History & Diff

### Scope
- Store last 5 scans per project
- List previous scans with timestamps
- Select two scans to compare
- Visual diff: green (new), red (removed), yellow (changed)
- Side-by-side comparison view
- Clear old scans beyond limit

### Exclusions
- No automatic diff on every scan
- No timeline visualization
- No "what changed since yesterday" shortcuts

### Validation
- [ ] Scans persist to `.surveyor/` directory
- [ ] Can load previous scan
- [ ] Diff shows correct changes
- [ ] Side-by-side renders both versions
- [ ] Old scans cleaned up

### Stop Point
Create intentional changes, verify diff catches them. Is the diff useful? Does side-by-side help or overwhelm?

---

## Phase 9: Advanced Features

### Scope
- Guided mode: highlight interesting areas (most connections, most warnings)
- Warning explanations: "why this matters"
- Fix suggestions: LLM-generated recommendations
- Manual summary editing with "manual" source indicator
- Docstring extraction as summary source
- Filter chips: by behavior, by type, by status
- PNG export
- JSON export

### Exclusions
- No auto-fix implementation
- No Mandrel integration
- No multi-language support

### Validation
- [ ] Guided mode highlights useful nodes
- [ ] Warning explanations are helpful
- [ ] Fix suggestions are reasonable (not perfect)
- [ ] Manual edits persist
- [ ] Filters work correctly
- [ ] Exports produce valid files

### Stop Point
Full feature validation. Use Surveyor on Squire. Can you answer "is my architecture clean?"

---

## Phase 10: Mandrel Integration

### Scope
- Store scan results in Mandrel PostgreSQL
- Trigger scan from Mandrel Command UI
- MCP tool for Claude Code queries
- Session continuity: edits persist in Mandrel

### Exclusions
- Out of scope for standalone Surveyor v1
- Separate planning document needed

### Validation
- Defined when we reach this phase

---

## Enforcement Rules

### For Claude (me)

1. **Before writing any code**, state which phase we're in
2. **If a feature isn't in current phase**, say "that's Phase X, we're in Phase Y"
3. **No "quick additions"** — even small features wait for their phase
4. **No "while we're here"** — stick to scope
5. **When phase is complete**, stop and ask for review before proceeding

### For Brian (you)

1. **If I start building out of scope**, pull the reins: "That's not in this phase"
2. **At each stop point**, actually review before approving next phase
3. **It's okay to extend a phase** if validation isn't met
4. **It's okay to adjust future phases** based on learnings
5. **The plan is a living document** — update it as we learn

---

## Current Status

| Phase | Status |
|-------|--------|
| 0 - Foundation | **COMPLETE** ✓ |
| 1 - Parser | **COMPLETE** ✓ |
| 2 - Basic Visualization | **COMPLETE** ✓ |
| 3 - Interactions | **COMPLETE** ✓ |
| 4 - Behavioral Analysis | **COMPLETE** ✓ |
| 5 - Warnings | Not started |
| 6 - Polish | Not started |
| 7 - Smart Clustering | Not started |
| 8 - History & Diff | Not started |
| 9 - Advanced | Not started |
| 10 - Integration | Not started |

---

*This plan is the leash. Hold it tight.*

*Last Updated: January 2026*
