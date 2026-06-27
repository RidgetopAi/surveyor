/**
 * Server connection configuration (configs-not-hardcoded).
 *
 * The API server URL is env-driven via Vite: set `VITE_SERVER_URL` at build/dev
 * time to point the UI at a non-default server. Falls back to the local dev
 * default. This replaces the URL that was hardcoded inline in ScanPanel.
 */

const DEFAULT_SERVER_URL = 'http://localhost:4000';

function readServerUrl(): string {
  // import.meta.env is injected by Vite (and by Vitest's vite pipeline).
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_SERVER_URL as string | undefined)
      : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SERVER_URL;
}

export const SERVER_CONFIG = {
  /** Base URL of the @surveyor/server API (env: VITE_SERVER_URL). */
  baseUrl: readServerUrl(),
} as const;
