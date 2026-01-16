import { db, query } from '../database';
import { User, CreateUserInput } from '../types/user';
import { hashPassword } from '../utils/crypto';

/**
 * Creates a new user in the database
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const hashedPassword = await hashPassword(input.password);
  const user = await db.users.create({
    ...input,
    password: hashedPassword,
    createdAt: new Date(),
  });
  return user;
}

/**
 * Retrieves a user by their ID
 */
export async function getUserById(id: string): Promise<User | null> {
  return query<User>('SELECT * FROM users WHERE id = ?', [id]);
}

/**
 * Updates an existing user
 */
export async function updateUser(id: string, data: Partial<User>): Promise<User> {
  const user = await db.users.update(id, data);
  return user;
}

// Orphaned function - not called anywhere
export function deprecatedUserLookup(email: string): void {
  console.log('This function is deprecated');
}
