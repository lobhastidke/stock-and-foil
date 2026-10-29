import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { initDb, closeDb, query } from '../db/index.js';

describe('Auth & Session API (/api/v1/auth)', () => {
  const app = createApp();

  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects mutations missing X-SF-CSRF header with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'attacker@test.com',
        password: 'password1234',
        displayName: 'Attacker',
        organisation: 'Evil Corp',
        role: 'SUPPLIER',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('registers a new user, hashes password, and sets httpOnly session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'alice.test@supplier.com',
        password: 'password12345',
        displayName: 'Alice Supplier',
        organisation: 'Alice Manufacturing',
        role: 'SUPPLIER',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.email).toBe('alice.test@supplier.com');
    expect(res.body.data.role).toBe('SUPPLIER');
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();

    // Verify session cookie was set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('sf_session=');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Strict');

    // Verify DB stored bcrypt hash, never plaintext
    const dbUser = await query('SELECT password_hash FROM users WHERE email = $1', ['alice.test@supplier.com']);
    expect(dbUser.rows[0].password_hash).toMatch(/^\$2[aby]\$\d+\$/);
  });

  it('rejects registration with short password (< 10 chars)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'short@test.com',
        password: 'short',
        displayName: 'Short Pass',
        organisation: 'Test Org',
        role: 'BUYER',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in successfully and returns user details without credentials leakage', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'alice.test@supplier.com',
        password: 'password12345',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('alice.test@supplier.com');
    expect(res.body.data.displayName).toBe('Alice Supplier');

    const cookies = res.headers['set-cookie'];
    expect(cookies[0]).toContain('sf_session=');
  });

  it('rejects invalid password with generic error to prevent user enumeration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'alice.test@supplier.com',
        password: 'wrong_password_xyz',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects non-existent email with the EXACT same generic error (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'ghost_user@nonexistent.com',
        password: 'any_password',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('GET /auth/me returns authenticated user identity from cookie', async () => {
    // Login to get cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-SF-CSRF', '1')
      .send({
        email: 'alice.test@supplier.com',
        password: 'password12345',
      });

    const cookie = loginRes.headers['set-cookie'][0];

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('alice.test@supplier.com');
    expect(meRes.body.data.role).toBe('SUPPLIER');
  });

  it('POST /auth/logout clears session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('X-SF-CSRF', '1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);

    const cookies = res.headers['set-cookie'];
    expect(cookies[0]).toMatch(/sf_session=;/);
  });
});
