import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAME, verifySessionToken } from './session.js';
import { AuthUser, Role } from '../domain/permissions.js';

// Extend Express Request type with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware: Requires a valid session cookie.
 * Fails with 401 UNAUTHENTICATED if missing, expired, or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Please sign in to access this resource.',
      },
    });
    return;
  }

  try {
    const payload = verifySessionToken(token);
    req.user = {
      id: payload.userId,
      email: payload.email,
      displayName: payload.displayName,
      organisation: payload.organisation,
      role: payload.role,
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired session. Please sign in again.',
      },
    });
    return;
  }
}

/**
 * Middleware: Requires the authenticated user to possess one of the allowed roles.
 * Fails with 403 FORBIDDEN if role mismatch.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Forbidden: role '${req.user.role}' is not authorized to perform this action.`,
        },
      });
      return;
    }

    next();
  };
}
