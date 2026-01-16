# Surveyor

## Design Document v0.1

---

## What Is Surveyor?

Surveyor is a codebase mapping and visualization tool that gives developers architectural awareness of their projects. It crawls source code, extracts structural and behavioral information, and renders an interactive visual map that makes the invisible architecture visible.

**The Problem It Solves:**

When building with AI assistance, codebases grow fast. Developers—especially those who think visually or are building technical intuition—lose track of what they've built. They can't easily answer questions like:

- What does this function actually do?
- Why are there two services doing the same thing?
- Where does data flow through my system?
- Is my architecture clean, or is it spaghetti?

Existing tools (like Madge) show you a dependency graph, but they're overwhelming and don't help you *understand*. You see a mess; you don't see *where* the mess is or *why*.

**What Surveyor Does Differently:**

Surveyor provides three layers of insight:

1. **Structural Map** — The skeleton. What files exist, what they import/export, how they connect.
2. **Behavioral Map** — What functions actually do. One-line summaries. Flags for HTTP calls, database writes, side effects.
3. **Intent Map** — Emergent patterns a human can recognize through the visualization. Duplicate services, orphaned code, architectural clusters.

Surveyor integrates into the development workflow—run it after completing a phase, see what you built, catch problems early, build confidence in your architecture.

---

## Target User

Developers who:
- Build iteratively with AI assistance
- Think visually and need to *see* systems to understand them
- Are building technical intuition and can't yet hold large codebases in their head
- Want confidence that their code is solid before shipping

**Primary Use Case:**

"I just finished phase 1 of my project. Before I move on, I want to see what I built—verify the architecture is clean, understand how pieces connect, catch any duplication or weird coupling."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SURVEYOR CORE                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  LANGUAGE ADAPTERS                        │  │
│  │                                                           │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │   │ TypeScript  │  │    Rust     │  │   Python    │ ...  │  │
│  │   │  (ts-morph) │  │    (syn)    │  │   (ast)     │      │  │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │  │
│  │          │                │                │              │  │
│  │          └────────────────┼────────────────┘              │  │
│  │                           ▼                               │  │
│  │              STANDARDIZED JSON SCHEMA                     │  │
│  │         (Same output regardless of language)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 BEHAVIORAL ANALYZER                       │  │
│  │            (Cheap LLM - Grok 4.1 Fast)                   │  │
│  │                                                           │  │
│  │   For each function/class:                                │  │
│  │   - One-line summary of what it does                      │  │
│  │   - Flags: HTTP calls, DB writes, file I/O, side effects │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    OUTPUT LAYER                           │  │
│  │                                                           │  │
│  │   - JSON files (standalone operation)                     │  │
│  │   - POST to Mandrel PostgreSQL (integrated operation)     │  │
│  │   - WebSocket for live updates (future)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   VISUALIZATION ENGINE                          │
│                      (React Flow)                               │
│                                                                 │
│   Interactive, zoomable, clickable map                          │
│                                                                 │
│   Views:                                                        │
│   - File/module dependency graph                                │
│   - Function relationship map                                   │
│   - Data flow visualization                                     │
│   - Behavioral clusters (HTTP handlers, DB operations, etc.)    │
│                                                                 │
│   Interactions:                                                 │
│   - Click node → see function summary, code snippet             │
│   - Zoom → progressive detail (files → functions → code)        │
│   - Filter → show only HTTP endpoints, DB operations, etc.      │
│   - Highlight → trace data flow through system                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Three Layers

### Layer 1: Structural Map

**What it captures:**
- Files and their locations
- Import/export relationships
- Function and class definitions
- Type definitions and interfaces
- Module boundaries

**How it's extracted:**
- TypeScript: `ts-morph` (wraps TypeScript compiler API)
- Deterministic parsing—no AI needed
- Outputs standardized JSON regardless of source language

**Example output:**
```json
{
  "file": "src/services/userService.ts",
  "imports": [
    { "from": "./database", "items": ["db", "query"] },
    { "from": "../types", "items": ["User"] }
  ],
  "exports": [
    { "name": "createUser", "type": "function" },
    { "name": "getUserById", "type": "function" }
  ],
  "functions": [
    { "name": "createUser", "params": ["userData: CreateUserInput"], "returns": "Promise<User>" },
    { "name": "getUserById", "params": ["id: string"], "returns": "Promise<User | null>" }
  ]
}
```

### Layer 2: Behavioral Map

**What it captures:**
- What each function actually does (one-line summary)
- Side effect flags:
  - Makes HTTP/API calls
  - Reads/writes to database
  - File system operations
  - Sends emails/notifications
  - Modifies global state

**How it's extracted:**
- Cheap, fast LLM (Grok 4.1 Fast or similar)
- Bounded task: "Given this function, provide a one-line summary and flag any side effects"
- Results can be validated and cached

**Example output:**
```json
{
  "function": "createUser",
  "file": "src/services/userService.ts",
  "summary": "Creates a new user record in the database with hashed password",
  "flags": {
    "database_write": true,
    "http_call": false,
    "file_io": false,
    "side_effects": ["password hashing", "timestamp generation"]
  }
}
```

### Layer 3: Intent Map

**What it captures:**
- Architectural patterns (authentication flow, data pipeline, etc.)
- Duplicate or redundant code
- Orphaned/dead code
- Coupling issues
- Security concerns (exposed endpoints without auth)

**How it's extracted:**
- Emerges from visualization—humans recognize patterns
- Optional: LLM analysis across the full map to suggest clusters
- User can annotate/tag areas as they learn the codebase

---

## Integration Points

### 1. CLI (Primary Interface for v1)

```bash
# Basic crawl
surveyor crawl ./src

# Output to specific location
surveyor crawl ./src --output ./reports/

# Watch mode (re-crawl on changes)
surveyor crawl ./src --watch

# Specific language override
surveyor crawl ./src --lang typescript
```

### 2. API Endpoint (For Mandrel Integration)

```
POST /api/surveyor/crawl
{
  "path": "./src",
  "projectId": "squire-main"
}

GET /api/surveyor/map/:projectId
Returns the full structural/behavioral map as JSON

GET /api/surveyor/visualization/:projectId
Returns data formatted for React Flow rendering
```

### 3. MCP Tool (For Claude Integration)

```typescript
// Claude can invoke during conversation
{
  "tool": "surveyor_crawl",
  "params": {
    "path": "./src",
    "focus": "src/services/"  // Optional: limit scope
  }
}

// Returns map data as context
// Claude can then reason about architecture
```

### 4. Mandrel Command UI

- Button: "Map Project" → triggers crawl
- Visualization panel renders React Flow graph
- Click-through to code snippets
- Filter controls for different views

---

## Technical Decisions

### Language: TypeScript

- Consistency with Mandrel and Squire
- `ts-morph` provides excellent AST access
- Same language for crawler and visualization

### AST Parsing: ts-morph

- Wraps TypeScript compiler API
- Handles JSX/TSX
- Provides clean traversal methods
- Well-maintained, good documentation

### Behavioral Analysis: Grok 4.1 Fast (via API)

- Cheap enough for per-function calls
- Fast enough for reasonable crawl times
- Good enough for one-line summaries
- Fallback: can batch functions to reduce API calls

### Visualization: React Flow

- Built for node-based interactive graphs
- Handles zoom/pan/selection out of the box
- Customizable node and edge rendering
- Active development, good community

### Storage

**Standalone mode:**
- JSON files in `.surveyor/` directory
- One file per crawl, timestamped
- Easy to diff between runs

**Integrated mode:**
- POST to Mandrel's PostgreSQL
- Becomes part of project context
- Available to Claude during sessions

---

## V1 Scope

### In Scope

- [ ] TypeScript/JavaScript parsing via ts-morph
- [ ] Layer 1: Full structural mapping (imports, exports, functions, classes)
- [ ] Layer 2: Behavioral summaries via Grok 4.1 Fast API
- [ ] CLI interface: `surveyor crawl <path>`
- [ ] JSON output to file
- [ ] Basic React Flow visualization (file-level graph)
- [ ] Click-to-expand: file → functions
- [ ] Function summary display on click

### Out of Scope (Future Versions)

- [ ] Multi-language support (Rust, Python, Go)
- [ ] Live watch mode
- [ ] Mandrel PostgreSQL integration
- [ ] MCP tool implementation
- [ ] Layer 3 automated intent analysis
- [ ] Diff between crawls ("what changed")
- [ ] Security vulnerability flagging
- [ ] Performance hotspot detection

---

## Success Criteria

**V1 is done when:**

1. Running `surveyor crawl ./src` on Squire produces a complete structural map
2. Every function has a one-line behavioral summary
3. The React Flow visualization renders and is navigable
4. Brian can look at the output and answer: "Is my architecture clean?"

---

## First Target: Squire

**Why Squire:**
- Known architecture—Brian designed the memory and generative systems
- Running in production—it's a real codebase, not a toy
- Validation opportunity—if Surveyor shows clean architecture, it builds confidence
- If it shows problems—even better, Brian catches them before pushing harder

**Expected discoveries:**
- Clear separation between memory system and generative components
- API layer connecting frontend to backend services
- Any duplicate services or redundant code
- Data flow from user input through processing to storage

---

## Open Questions

1. **Caching strategy**: How long are behavioral summaries valid? Invalidate on file change?

2. **Large codebases**: How do we handle 1000+ file projects? Progressive loading? Sampling?

3. **Monorepo support**: Multiple packages in one repo—separate maps or unified?

4. **Visualization performance**: React Flow with 500+ nodes—do we need virtualization?

5. **Cost management**: Grok API costs at scale—batch vs. per-function tradeoffs?

---

## Next Steps

1. Set up project structure (TypeScript, ts-morph, basic CLI)
2. Implement Layer 1 parser for TypeScript
3. Define JSON schema for structural output
4. Test on small codebase (single service from Squire)
5. Add Grok 4.1 Fast integration for Layer 2
6. Build minimal React Flow visualization
7. Full crawl of Squire
8. Iterate on visualization UX

---

*Document version: 0.1*
*Created: January 2026*
*Author: Brian + Claude*
