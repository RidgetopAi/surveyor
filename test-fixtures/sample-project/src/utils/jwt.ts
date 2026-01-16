import { TokenPayload } from '../types/auth';

const SECRET = 'test-secret';

/**
 * Signs a JWT token
 */
export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  // Mock implementation
  return `token_${payload.userId}`;
}

/**
 * Verifies a JWT token
 */
export function verifyToken(token: string): TokenPayload {
  // Mock implementation
  if (!token.startsWith('token_')) {
    throw new Error('Invalid token');
  }
  return {
    userId: token.replace('token_', ''),
    iat: Date.now(),
    exp: Date.now() + 3600000,
  };
}
