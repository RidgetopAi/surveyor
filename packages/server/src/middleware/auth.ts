/**
 * Bearer-token auth middleware.
 *
 * Only Mandrel (holding the shared-service token) may call the API. The token
 * comes from named config (`config.auth.token`, env `SURVEYOR_AUTH_TOKEN`).
 *
 * FAIL-CLOSED: if no token is configured, every protected route returns 503
 * rather than silently running open. A shared sandboxed service must never be
 * reachable without a token by accident.
 *
 * The health endpoint is mounted OUTSIDE this middleware and stays open.
 */

import type { MiddlewareHandler } from 'hono';
import type { AuthConfig } from '../config.js';

/** Constant-time-ish comparison to avoid trivial timing oracles on the token. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function bearerAuth(auth: AuthConfig): MiddlewareHandler {
  return async (c, next) => {
    if (!auth.token) {
      return c.json(
        { error: 'Service misconfigured: auth token not set (SURVEYOR_AUTH_TOKEN)' },
        503,
      );
    }

    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match || !safeEqual(match[1]!.trim(), auth.token)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}
