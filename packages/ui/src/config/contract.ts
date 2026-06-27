/**
 * UI-local, typed mirror of the @surveyor/core data-contract enum VALUES.
 *
 * Why this exists: `@surveyor/core` is a Node-only package — its entry point
 * re-exports the parser, the LLM SDK and the detection engines (ts-morph, knip,
 * dependency-cruiser), which depend on Node builtins. Importing core's *runtime*
 * enums into the browser bundle drags all of that into Vite/Rollup and breaks
 * the build. The UI therefore imports core as TYPES only and uses these typed
 * string constants for runtime comparisons.
 *
 * The string values ARE the serialized wire contract (the same JSON the server
 * emits). The `as` casts are checked against the core enum *types*, and the view
 * unit tests run against fixtures built from the REAL core enums — so a drift
 * between this mirror and the contract surfaces as a failing view test.
 */

import type { NodeType, ConnectionType } from '@surveyor/core';

export const NODE_TYPE = {
  File: 'file' as NodeType,
  Function: 'function' as NodeType,
  Class: 'class' as NodeType,
  Cluster: 'cluster' as NodeType,
} as const;

export const CONNECTION_TYPE = {
  Import: 'import' as ConnectionType,
  FunctionCall: 'function_call' as ConnectionType,
  Inheritance: 'inheritance' as ConnectionType,
  Implementation: 'implementation' as ConnectionType,
  TypeReference: 'type_reference' as ConnectionType,
} as const;
