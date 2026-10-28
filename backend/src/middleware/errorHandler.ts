import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { InvalidTransitionError } from '../domain/invoiceStateMachine.js';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_PLEDGE'
  | 'COMMITMENT_MISMATCH'
  | 'RATE_LIMITED'
  | 'CHAIN_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Global Express Error Handler:
 * Produces uniform Block A Error Envelope:
 * { "error": { "code": "...", "message": "...", "details": optional } }
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed.',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  // Handle invoice state machine errors
  if (err instanceof InvalidTransitionError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: {
          fromStatus: err.fromStatus,
          toStatus: err.toStatus,
        },
      },
    });
    return;
  }

  // Handle typed AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Handle unique violation from database (Postgres error 23505)
  if (err?.code === '23505') {
    if (err.constraint?.includes('pledge_marker') || err.message?.includes('idx_pledges_pledge_marker')) {
      res.status(409).json({
        error: {
          code: 'DUPLICATE_PLEDGE',
          message: 'This invoice commitment has already received a financing pledge.',
        },
      });
      return;
    }
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A duplicate record already exists.',
      },
    });
    return;
  }

  // Fallback for unexpected internal errors
  // We log the error internally but NEVER expose stack traces or internal secrets to client
  console.error('Unhandled Server Error:', err?.message || err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
    },
  });
}
