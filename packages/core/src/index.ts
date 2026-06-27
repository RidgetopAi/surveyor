/**
 * @surveyor/core
 * Parser and analysis engine for Surveyor
 */

export const VERSION = '0.1.0';

// Types
export * from './types/index.js';

// Parser
export * from './parser/index.js';

// Resolver
export * from './resolver/index.js';

// Analyzer
export * from './analyzer/index.js';

// Detection engines (knip + dependency-cruiser → Warning model)
export * from './detection/index.js';
