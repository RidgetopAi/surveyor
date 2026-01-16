# Fix Suggestion Prompt

## Purpose
Generate actionable fix suggestions for detected code warnings.

---

## System Prompt

```
You are a senior software engineer reviewing code issues. Your job is to:
1. Explain why the issue matters
2. Suggest a concrete fix
3. Provide reasoning for the suggestion

Be practical, not pedantic. Focus on real impact, not theoretical purity.
```

---

## User Prompt Template

```
Analyze this code warning and suggest a fix:

**Warning type:** {{warningCategory}}
**Title:** {{warningTitle}}
**Affected files:**
{{#each affectedNodes}}
- {{filePath}}:{{line}} ({{name}})
{{/each}}

**Relevant code:**
```{{language}}
{{codeSnippet}}
```

Return JSON in this format:
{
  "explanation": "Why this issue matters (2-3 sentences)",
  "suggestion": "What to do to fix it (1-2 sentences)",
  "reasoning": "Why this fix is the right approach (1-2 sentences)",
  "codeExample": "Optional code snippet showing the fix (or null)",
  "effort": "low|medium|high",
  "risk": "low|medium|high"
}

Rules:
- Be specific to THIS code, not generic advice
- If multiple valid fixes exist, suggest the simplest one
- codeExample should be minimal, showing only the relevant change
- effort = how much work to implement
- risk = likelihood of breaking something
```

---

## Warning-Specific Context

### Circular Dependency

```
Additional context: This creates a circular import chain:
{{#each cycle}}
{{this}} imports →
{{/each}}
{{first}}

Consider: Which module should "own" the shared functionality?
```

### Orphaned Code

```
Additional context: This function has no callers in the codebase.
Last modified: {{lastModified}}
Exported: {{isExported}}

Consider: Is this dead code, or is it called externally?
```

### Unused Export

```
Additional context: This export is not imported anywhere in the codebase.
Export type: {{exportKind}}

Consider: Is this part of a public API, or truly unused?
```

---

## Example Input

```
**Warning type:** circular_dependency
**Title:** Circular import between userService and authService
**Affected files:**
- src/services/userService.ts:1 (import)
- src/services/authService.ts:3 (import)

**Relevant code:**
// userService.ts
import { validateToken } from './authService';

// authService.ts
import { getUserById } from './userService';
```

---

## Example Output

```json
{
  "explanation": "Circular dependencies make code harder to test and can cause runtime issues in some bundlers. Here, userService and authService depend on each other, creating tight coupling that will become problematic as the codebase grows.",
  "suggestion": "Extract the shared functionality into a third module that both services can import, or move validateToken into userService if it's primarily used there.",
  "reasoning": "Breaking the cycle with a shared module maintains separation of concerns while eliminating the circular import. This is the lowest-risk refactor.",
  "codeExample": "// shared/tokenUtils.ts\nexport function validateToken(token: string): boolean { ... }\n\n// Both services import from shared/tokenUtils",
  "effort": "medium",
  "risk": "low"
}
```

---

## Fallback Response

If unable to generate meaningful suggestion:

```json
{
  "explanation": "This issue was detected but requires manual review to understand the full context.",
  "suggestion": "Review the affected code to determine if this is intentional or needs refactoring.",
  "reasoning": "Automated analysis cannot determine intent in this case.",
  "codeExample": null,
  "effort": "unknown",
  "risk": "unknown"
}
```
