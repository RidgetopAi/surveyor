import { describe, it, expect } from 'vitest';
import { isOriginAllowed } from './cors-origin.js';

describe('isOriginAllowed', () => {
  const suffix = ['.ridgetopai.net'];
  const exact = ['http://localhost:5173', 'https://app.ridgetopai.net'];

  it('rejects an undefined origin (non-browser caller)', () => {
    expect(isOriginAllowed(undefined, suffix)).toBe(false);
  });

  it('allows the apex domain via a suffix rule', () => {
    expect(isOriginAllowed('https://ridgetopai.net', suffix)).toBe(true);
  });

  it('allows a subdomain via a suffix rule', () => {
    expect(isOriginAllowed('https://app.ridgetopai.net', suffix)).toBe(true);
    expect(isOriginAllowed('https://command.ridgetopai.net', suffix)).toBe(true);
  });

  it('REJECTS the substring-attack origins the old includes() check allowed', () => {
    expect(isOriginAllowed('https://ridgetopai.net.evil.com', suffix)).toBe(false);
    expect(isOriginAllowed('https://evil-ridgetopai.net', suffix)).toBe(false);
    expect(isOriginAllowed('https://notridgetopai.net', suffix)).toBe(false);
  });

  it('matches exact entries only when identical', () => {
    expect(isOriginAllowed('http://localhost:5173', exact)).toBe(true);
    expect(isOriginAllowed('http://localhost:9999', exact)).toBe(false);
    expect(isOriginAllowed('https://app.ridgetopai.net', exact)).toBe(true);
  });

  it('rejects everything when the allowlist is empty', () => {
    expect(isOriginAllowed('https://app.ridgetopai.net', [])).toBe(false);
  });

  it('rejects malformed origins', () => {
    expect(isOriginAllowed('not-a-url', suffix)).toBe(false);
  });
});
