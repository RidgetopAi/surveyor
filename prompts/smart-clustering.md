# Smart Clustering Prompt

## Purpose
Classify files/functions into architectural categories for smart clustering view.

---

## System Prompt

```
You are a software architect analyzing codebase structure. Your job is to classify code into architectural categories based on its purpose and behavior.

Categories:
- backend: Server-side logic, API handlers, business logic
- frontend: UI components, React/Vue/etc, client-side code
- api: API route definitions, endpoint handlers, REST/GraphQL
- database: Database models, queries, migrations, ORM code
- auth: Authentication, authorization, security, tokens
- utils: Utility functions, helpers, shared logic
- types: Type definitions, interfaces, schemas
- config: Configuration, environment, constants
- tests: Test files, test utilities, mocks
- unknown: Cannot confidently categorize
```

---

## User Prompt Template

```
Classify this file into an architectural category:

**File:** {{filePath}}
**Imports:**
{{#each imports}}
- {{source}}
{{/each}}

**Exports:**
{{#each exports}}
- {{name}} ({{kind}})
{{/each}}

**Functions:**
{{#each functions}}
- {{name}}: {{summary}}
{{/each}}

Return JSON:
{
  "category": "backend|frontend|api|database|auth|utils|types|config|tests|unknown",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}

Rules:
- Use file path as a strong signal (e.g., /components/ → frontend)
- Use imports as signals (e.g., imports React → frontend)
- Use function behavior as signals (e.g., DB writes → database)
- If multiple categories apply, choose the primary one
- Set confidence low (< 0.5) if genuinely ambiguous
```

---

## Heuristic Pre-Classification

Before LLM, apply these rules (faster, cheaper):

| Signal | Category | Confidence |
|--------|----------|------------|
| Path contains `/components/` | frontend | 0.9 |
| Path contains `/pages/` or `/views/` | frontend | 0.9 |
| Path contains `/api/` or `/routes/` | api | 0.9 |
| Path contains `/models/` or `/entities/` | database | 0.8 |
| Path contains `/auth/` | auth | 0.9 |
| Path contains `/utils/` or `/helpers/` | utils | 0.8 |
| Path contains `/types/` or `/interfaces/` | types | 0.9 |
| Path contains `/config/` | config | 0.9 |
| Path contains `.test.` or `.spec.` | tests | 1.0 |
| Path contains `/__tests__/` | tests | 1.0 |
| Imports `react` or `vue` | frontend | 0.8 |
| Imports `express` or `fastify` or `hono` | backend | 0.8 |
| Imports `prisma` or `typeorm` or `mongoose` | database | 0.8 |
| File is `.d.ts` | types | 1.0 |

Only call LLM if confidence < 0.7 after heuristics.

---

## Batch Classification

For efficiency, classify multiple files at once:

```
Classify these files into architectural categories:

{{#each files}}
---
**File {{index}}:** {{filePath}}
Imports: {{imports}}
Exports: {{exports}}
{{/each}}

Return a JSON array with one classification per file in order.
```

---

## Example Input

```
**File:** src/services/userService.ts
**Imports:**
- ./database
- ../types/user
- bcrypt

**Exports:**
- createUser (function)
- getUserById (function)
- updateUser (function)

**Functions:**
- createUser: Creates user with hashed password
- getUserById: Fetches user by ID from database
- updateUser: Updates user record in database
```

---

## Example Output

```json
{
  "category": "backend",
  "confidence": 0.85,
  "reasoning": "Service file with business logic, database operations, no UI components"
}
```
