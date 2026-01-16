# Surveyor Requirements Document

## Generated from Design Interview — January 2026

---

## Anti-Patterns to Avoid

These are explicit failures of existing tools that Surveyor must not repeat:

| Anti-Pattern | Description |
|--------------|-------------|
| Visual overload | Too many nodes shown at once, no progressive disclosure |
| No hierarchy | Flat graphs with no grouping or clustering |
| Context-free connections | Lines between nodes with no meaning or explanation |
| Spaghetti layouts | Poor layout algorithms creating visual chaos |
| Dated styling | Ugly, utilitarian, hard-to-read interfaces |
| Poor readability | Small text, low contrast, cluttered information |
| Modal overload | Popups for every action, confirmations everywhere |
| Tooltip spam | Hover hints constantly appearing on every element |

---

## Core UX Decisions

### Navigation Model

| Decision | Choice |
|----------|--------|
| Starting view | Zoomed out, see high-level clusters |
| Default grouping | Folder structure (mirrors file system) |
| Alternate view | Smart clustering by architectural concern (toggle) |
| Drill-down method | Smooth camera zoom into cluster |
| External connections | Stay visible but faded when zoomed into cluster |
| Guided mode | Secondary feature highlighting interesting/problematic areas |

### Smart Clustering Categories

When toggled to smart view, group by:
- Backend systems
- Frontend systems
- Data flow paths
- API endpoints / schemas
- Authentication layer
- (Additional categories inferred from codebase)

**Key insight**: This is educational — Surveyor teaches users about their own architecture.

### Information Density

**Zoomed-out clusters show:**
- Label with name
- Quick stats (file count, function count, notable behaviors)
- Subtle health indicator (color coding for issues)

**Function detail card shows (immediately visible):**
- Function name + file location
- One-line behavioral summary
- What calls this function (incoming connections)
- Link to open in editor

**Function detail card (tucked away/expandable):**
- Side effect flags
- Parameters and return type
- Code snippet
- What this function calls (outgoing)
- Related functions

### Connection Lines

Lines communicate:
- **Direction**: arrows showing call direction / data flow
- **Type**: different styles for imports vs function calls vs data flow vs API
- **Weight**: thickness indicates usage frequency
- **Health**: color coding (normal = neutral, circular dep = warning)

**On hover/select**: all other connections fade out, isolating focus

---

## Visual Design

### Color Palette

| Element | Specification |
|---------|---------------|
| Background | Soft dark (#1a1a1a range) |
| Text | Muted whites/grays, easy on eyes |
| Palette | Monochrome primary |
| Accents | Semantic only (green/yellow/red for health) |
| Overall | Professional, restrained, not decorative |

### Persistent UI Elements

Always visible:
- Minimap (corner orientation)
- Search bar (quick jump to function/file)
- Filter chips (quick toggles)
- Breadcrumb (location: Project > Cluster > File > Function)

On-demand:
- View toggle (folder / smart clustering)
- Zoom controls (rely on scroll/pinch gestures)

### Filter Chip Categories

**By behavior:**
- DB writers
- HTTP handlers
- File I/O
- Auth-related

**By type:**
- Functions
- Classes
- Components
- Hooks
- Types/Interfaces

**By status:**
- Has warnings
- Orphaned (potential dead code)
- Recently changed
- AI-analyzed

---

## Interaction Patterns

### Input Model

**Hybrid approach:**
- Mouse primary for navigation (click, drag, scroll zoom)
- Keyboard shortcuts for actions (open in editor, toggle filters, search)

### Transitions

**Cinematic feel throughout:**
- Scan: nodes stream in progressively (visual feedback)
- Zoom/pan: butter-smooth 60fps
- Drill-down: animated transition (200-300ms)
- Overall: premium, crafted feel — not utilitarian

### Accessibility

- Mouse-first, keyboard as enhancement
- Reduced motion toggle available
- Design with semantic structure (full a11y implementation in later phase)

---

## Warning System

### Detection Display

- **Summary panel**: collapsible list of all warnings
- **Badge on cluster**: count indicator when zoomed out
- **Line coloring**: affected connections tinted

### Warning Click Flow

Progressive depth:
1. **Highlight** the offending code
2. **Explain** what's wrong and why it matters
3. **Suggest a fix** (planned from start, polished later)

### Circular Dependencies

Medium visibility approach:
- Badge on affected clusters
- Yellow-tinted connection lines when zoomed in
- Listed in warnings panel
- Informative, not alarming (may be intentional)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty folder | Show greyed out (visible but muted) |
| Orphaned function (no connections) | Highlight as potential dead code |
| Parse failure on file | Show warning, continue scan |
| Large codebase (1000+ files) | Smart limit + progressive loading |

---

## LLM Behavioral Analysis

### Execution Model

- **First scan**: full analysis of all functions
- **Subsequent**: cached, only re-analyze on manual trigger
- **Triggers**: per-function or full rescan

### User Control

- Summaries are editable (user can override)
- Source indicator shows: docstring / AI-generated / manually edited

### Performance

- Structural map appears immediately
- Behavioral summaries populate progressively as complete
- Visual "streaming" effect during population

---

## Scan History & Diff

### Persistence

- Keep last 5 scans per project
- Stored for comparison

### Visual Diff

- **New nodes**: green
- **Removed nodes**: red
- **Changed nodes**: yellow

### Comparison View

- Side-by-side comparison
- Planned into architecture now, polished in later phase

---

## Error Handling

| Aspect | Approach |
|--------|----------|
| Presentation | Inline error (no modals, no toasts) |
| Information | Show what succeeded vs what failed |
| Recovery | User-initiated retry |
| Debugging | Debug log accessible for troubleshooting |

---

## Project Management

### Standalone Mode (v1)

- Project switcher based on directory selection
- Recent projects on home screen
- Projects isolated (no cross-project comparison)

### First-Run Experience

- Blank canvas with smart prompt
- "Select your source folder" with file picker
- Auto-detect common patterns (src/, app/) and pre-fill suggestion
- One click to scan

### Post-Scan

- Map appears immediately
- "Insights" button available (not forced)
- User explores at their own pace

---

## Mandrel Integration (Planned)

### Trigger Model

- NOT auto-load on project switch
- Triggered from Claude Code or Mandrel Command UI
- Manual trigger always available

### Data Storage

- Scan results stored in Mandrel PostgreSQL
- Quick loading for visualization
- Searchable by Claude Code during conversations

### Claude Integration

- Claude can query the map ("What functions touch the database?")
- Provides architectural awareness during coding sessions

### Session Continuity

- Manual edits to summaries persist
- Architectural notes preserved across sessions

---

## Export

| Format | Purpose |
|--------|---------|
| PNG | Visual export for portfolio/marketing/sharing |
| JSON | Data portability, other tool consumption |

---

## Technical Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Vite + React | Fast, modern, no SSR overhead |
| Styling | Tailwind CSS | Dark theme tokens, consistent system |
| State | Zustand | Lightweight, TypeScript-native |
| Animation | Framer Motion | Cinematic transitions, gesture support |
| Visualization | React Flow | Node-based graphs, zoom/pan built-in |
| AST Parsing | ts-morph | TypeScript/JavaScript analysis |
| LLM | Grok 4.1 Fast (or similar) | Cost-effective behavioral analysis |

---

## Terminology

Consistent language throughout the UI:

| Concept | Term |
|---------|------|
| The action | Scan |
| Graph elements | Node |
| Grouped collections | Cluster |
| Detected concerns | Warnings |

---

## Screen Support

| Context | Support Level |
|---------|---------------|
| Desktop (full viewport) | Primary |
| Laptop (full viewport) | Primary |
| Side-by-side with editor | Planned for later (graceful collapse) |
| Tablet/mobile | Not supported |

---

## Success Criteria

v1 is complete when all four are true:

1. **Clarity**: "I can see my architecture clearly and it makes sense"
2. **Discovery**: "I found something I didn't know was there"
3. **Pride**: "I'd show this to someone else without embarrassment"
4. **Habit**: "I want to use this after every coding session"

---

## Phase Planning

### v1 Core (MVP)

- TypeScript/JavaScript parsing via ts-morph
- Full structural mapping (imports, exports, functions, classes)
- Behavioral summaries via LLM API
- CLI interface: `surveyor scan <path>`
- JSON output
- React Flow visualization with folder view
- Drill-down zoom with animated transitions
- Function detail cards
- Persistent UI (minimap, search, filters, breadcrumb)
- Warning detection and display (highlight + explain)
- Progressive scan loading (cinematic effect)
- Dark theme with monochrome palette

### v1 Polish

- Smart clustering view (toggle from folder view)
- Guided mode (highlight interesting areas)
- Fix suggestions for warnings
- Scan history (last 5)
- Visual diff (side-by-side)
- PNG/JSON export
- Reduced motion toggle

### Future (Post-v1)

- Mandrel PostgreSQL integration
- Claude Code MCP tool
- Multi-language support (Rust, Python, Go)
- Live watch mode
- Side-by-side responsive layout
- Cross-project comparison
- Full accessibility implementation

---

*Document generated: January 2026*
*Source: Design interview with Brian*
