# Behavioral Summary Prompt — design reference

> **Source of truth is CODE, not this file.** The runtime prompt, the structured
> `{summary, flags}` JSON schema, and the response normalizer all live in
> [`packages/core/src/llm/prompt.ts`](../packages/core/src/llm/prompt.ts) so they
> cannot drift from what actually ships (the npm package ships only `dist`, and the
> prompt is overridable via `LLMConfig.systemPrompt` / `SURVEYOR_LLM_SYSTEM_PROMPT`).
> This document is design reference only.

## Purpose

Generate a one-line summary and side-effect flags for a single TypeScript/JavaScript
function.

## Output contract

```json
{
  "summary": "One-line description of what the function does (max 100 chars)",
  "flags": {
    "databaseRead": false,
    "databaseWrite": false,
    "httpCall": false,
    "fileRead": false,
    "fileWrite": false,
    "sendsNotification": false,
    "modifiesGlobalState": false,
    "hasSideEffects": false
  }
}
```

- **Anthropic** (default) enforces this SHAPE via a forced tool call whose
  `input_schema` is `ANALYSIS_JSON_SCHEMA` (structured output — no fence-strip parse).
- **OpenAI-compatible** (incl. local Ollama) requests JSON via
  `response_format: { type: 'json_object' }`, with a tolerant fence-strip fallback.
- Both converge through the single `normalizeAnalysis()` normalizer (coerce flags to
  booleans; `hasSideEffects` is implied by any concrete effect).

## Flag semantics

| flag | meaning |
|------|---------|
| `databaseRead` | Reads from a database (SELECT, find, get queries) |
| `databaseWrite` | Writes to a database (INSERT, UPDATE, DELETE, save, create) |
| `httpCall` | Makes outbound HTTP/network requests (fetch, axios, http client) |
| `fileRead` | Reads from the filesystem |
| `fileWrite` | Writes to the filesystem |
| `sendsNotification` | Sends email, push notification, or SMS |
| `modifiesGlobalState` | Mutates global/singleton/module-level state |
| `hasSideEffects` | True if any other flag is true OR external state is mutated |

## Cost follow-up (NOT built in P2)

The Anthropic **Message Batches API** offers ~50% cheaper bulk analysis. It is a
known cost optimization for the worker-pool path and is deliberately deferred — see
the P2 return notes.
