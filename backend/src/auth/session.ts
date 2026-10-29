import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from '../config.js';
import { Role } from '../domain/permissions.js';

export const COOKIE_NAME = 'sf_session';
const JWT_EXPIRY = '12h';

export interface SessionPayload {
  userId: string;
  email: string;
  displayName: string;
  organisation: string;
  role: Role;
}

/**
 * Signs a JWT token with 12h validity.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Verifies and decodes a session JWT token. Throws if invalid or expired.
 */
export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as SessionPayload;
}

/**
 * Attaches the httpOnly session cookie to an Express response.
 */
export function setSessionCookie(res: Response, payload: SessionPayload): void {
  const token = signSessionToken(payload);
  const isProd = config.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000, // 12 hours in milliseconds
  });
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(res: Response): void {
  const isProd = config.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
  });
}
