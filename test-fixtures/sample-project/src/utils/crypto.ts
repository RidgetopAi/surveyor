/**
 * Hashes a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  // Mock implementation
  return `hashed_${password}`;
}

/**
 * Compares a password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return hash === `hashed_${password}`;
}

/**
 * Generates a random string
 */
export function generateRandomString(length: number): string {
  return Math.random().toString(36).substring(2, 2 + length);
}
