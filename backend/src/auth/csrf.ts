import { Request, Response, NextFunction } from 'express';

const MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * CSRF Protection Middleware:
 * Every state-changing request (POST, PATCH, PUT, DELETE) must supply:
 * 1. Header `X-SF-CSRF: 1`
 * 2. Header `Content-Type: application/json`
 * If missing or invalid, reject with 403 FORBIDDEN per Contract Section 5.
 *
 * Exemption: Internal server-to-server webhook endpoints (/internal/*)
 * authenticated via Bearer CRON_SECRET.
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATION_METHODS.includes(req.method.toUpperCase())) {
    return next();
  }

  // Exempt internal cron webhooks that authenticate via Bearer CRON_SECRET
  if (req.path.includes('/internal/')) {
    return next();
  }

  const csrfHeader = req.header('X-SF-CSRF');
  const contentType = req.header('Content-Type') || '';

  if (csrfHeader !== '1' || !contentType.toLowerCase().startsWith('application/json')) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'CSRF verification failed: state-changing requests require X-SF-CSRF: 1 and Content-Type: application/json.',
      },
    });
    return;
  }

  next();
}
