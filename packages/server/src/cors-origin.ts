/**
 * CORS origin matching — exact allowlist + explicit suffix rules.
 *
 * Replaces the old `origin.includes('ridgetopai.net')` substring check, which
 * also accepted hostile origins like `https://ridgetopai.net.evil.com` or
 * `https://evil-ridgetopai.net`. Here:
 *   - an allowlist entry beginning with `.` (e.g. `.ridgetopai.net`) matches that
 *     domain and any subdomain via a host-boundary suffix check (NOT substring);
 *   - any other entry must match the origin EXACTLY.
 */

export function isOriginAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) return false; // non-browser / same-origin callers don't send Origin

  let host: string;
  try {
    host = new URL(origin).host; // includes port if present
  } catch {
    return false;
  }

  for (const entry of allowlist) {
    if (entry.startsWith('.')) {
      const domain = entry.slice(1);
      // host-boundary suffix: exactly the domain, or `<sub>.<domain>`
      if (host === domain || host.endsWith(entry)) return true;
    } else if (origin === entry) {
      return true;
    }
  }
  return false;
}
