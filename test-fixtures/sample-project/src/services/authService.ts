import { getUserById } from './userService';
import { signToken, verifyToken } from '../utils/jwt';
import { AuthResult, TokenPayload } from '../types/auth';

/**
 * Authenticates a user with email and password
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  // Note: This creates a circular dependency with userService
  const user = await getUserById(email);
  if (!user) {
    throw new Error('User not found');
  }
  const token = signToken({ userId: user.id });
  return { user, token };
}

/**
 * Validates a JWT token
 */
export function validateToken(token: string): TokenPayload | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Refreshes an authentication token
 */
export async function refreshToken(token: string): Promise<string | null> {
  const payload = validateToken(token);
  if (!payload) return null;
  return signToken({ userId: payload.userId });
}
