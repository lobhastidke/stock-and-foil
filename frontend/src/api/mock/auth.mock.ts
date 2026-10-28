/**
 * api/mock/auth.mock.ts
 *
 * Handles:
 *   POST /auth/register
 *   POST /auth/login
 *   POST /auth/logout
 *   GET  /auth/me
 *   GET  /users/buyers
 */

import { db, uuid, now } from './db.js';
import { ok, err } from './index.js';
import type { User } from '../types.js';

export async function handleAuth(
  method: string,
  path: string,
  body: unknown,
): Promise<Response> {
  // ---------- GET /auth/me ----------
  if (path === '/auth/me' && method === 'GET') {
    if (!db.currentSession) {
      return err(401, 'UNAUTHENTICATED', 'Not logged in');
    }
    return ok({ user: db.currentSession });
  }

  // ---------- POST /auth/logout ----------
  if (path === '/auth/logout' && method === 'POST') {
    db.currentSession = null;
    return ok({ ok: true });
  }

  // ---------- POST /auth/register ----------
  if (path === '/auth/register' && method === 'POST') {
    const b = body as {
      email?: string;
      password?: string;
      displayName?: string;
      organisation?: string;
      role?: string;
    };

    if (!b.email || !b.password || !b.displayName || !b.organisation || !b.role) {
      return err(400, 'VALIDATION_ERROR', 'All fields are required');
    }
    if (b.password.length < 10) {
      return err(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters', {
        password: 'Password must be at least 10 characters',
      });
    }
    if (!['SUPPLIER', 'BUYER', 'FINANCIER'].includes(b.role)) {
      return err(400, 'VALIDATION_ERROR', 'Invalid role');
    }
    if (db.users.some((u) => u.email === b.email)) {
      return err(409, 'CONFLICT', 'Email already registered');
    }

    const user: User = {
      id: uuid(),
      email: b.email,
      displayName: b.displayName,
      organisation: b.organisation,
      role: b.role as User['role'],
      createdAt: now(),
    };

    db.users.push(user);
    db.passwords.set(b.email, b.password);
    db.currentSession = user;

    return ok({ user }, 201);
  }

  // ---------- POST /auth/login ----------
  if (path === '/auth/login' && method === 'POST') {
    const b = body as { email?: string; password?: string };

    if (!b.email || !b.password) {
      return err(400, 'VALIDATION_ERROR', 'Email and password are required');
    }

    const user = db.users.find((u) => u.email === b.email);
    const storedPass = db.passwords.get(b.email ?? '');

    if (!user || storedPass !== b.password) {
      return err(401, 'UNAUTHENTICATED', 'Invalid email or password');
    }

    db.currentSession = user;
    return ok({ user });
  }

  // ---------- GET /users/buyers ----------
  if (path === '/users/buyers' && method === 'GET') {
    if (!db.currentSession) {
      return err(401, 'UNAUTHENTICATED', 'Not logged in');
    }
    const buyers = db.users
      .filter((u) => u.role === 'BUYER')
      .map((u) => ({ id: u.id, displayName: u.displayName, organisation: u.organisation }));
    return ok(buyers);
  }

  return err(404, 'NOT_FOUND', `Mock: no auth route for ${method} ${path}`);
}
