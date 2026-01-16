import { User } from './user';

export interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface AuthError {
  code: 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED' | 'UNAUTHORIZED';
  message: string;
}
