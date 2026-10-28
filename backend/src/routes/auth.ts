import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { setSessionCookie, clearSessionCookie } from '../auth/session.js';
import { requireAuth } from '../auth/middleware.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export const authRouter = Router();

// Rate limiter for authentication endpoints: max 20 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    });
  },
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address format.'),
  password: z.string().min(10, 'Password must be at least 10 characters long.'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters.'),
  organisation: z.string().min(2, 'Organisation must be at least 2 characters.'),
  role: z.enum(['SUPPLIER', 'BUYER', 'FINANCIER']),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format.'),
  password: z.string().min(1, 'Password is required.'),
});

// POST /auth/register
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, displayName, organisation, role } = req.body;
      const cleanEmail = email.trim().toLowerCase();

      // Check if email already registered
      const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
      if (existing.rows.length > 0) {
        throw new AppError('CONFLICT', 'An account with this email address already exists.', 409);
      }

      const passwordHash = await hashPassword(password);
      const insertRes = await query(
        `INSERT INTO users (email, password_hash, display_name, organisation, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, display_name, organisation, role, created_at`,
        [cleanEmail, passwordHash, displayName.trim(), organisation.trim(), role]
      );

      const user = insertRes.rows[0];
      const sessionPayload = {
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        organisation: user.organisation,
        role: user.role,
      };

      setSessionCookie(res, sessionPayload);

      res.status(201).json({
        data: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          organisation: user.organisation,
          role: user.role,
          createdAt: new Date(user.created_at).toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const cleanEmail = email.trim().toLowerCase();

      const userRes = await query(
        `SELECT id, email, password_hash, display_name, organisation, role, created_at 
         FROM users 
         WHERE email = $1`,
        [cleanEmail]
      );

      // Generic error message preventing user enumeration
      const GENERIC_AUTH_ERROR = new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);

      if (userRes.rows.length === 0) {
        throw GENERIC_AUTH_ERROR;
      }

      const user = userRes.rows[0];
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        throw GENERIC_AUTH_ERROR;
      }

      const sessionPayload = {
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        organisation: user.organisation,
        role: user.role,
      };

      setSessionCookie(res, sessionPayload);

      res.json({
        data: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          organisation: user.organisation,
          role: user.role,
          createdAt: new Date(user.created_at).toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/logout
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

// GET /auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    data: req.user,
  });
});
