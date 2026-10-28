import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { verifyCsrf } from './auth/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { invoicesRouter } from './routes/invoices.js';
import { pledgesRouter, pledgeMarkersRouter } from './routes/pledges.js';
import { systemRouter } from './routes/system.js';
import { internalRouter } from './routes/internal.js';

export function createApp(): express.Application {
  const app = express();

  // Hardened HTTP security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Managed by frontend hosting
    })
  );

  // Cross-Origin Resource Sharing with credentials for cookie auth
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Cookie parser for reading httpOnly sf_session cookie
  app.use(cookieParser());

  // JSON body parser with 4MB limit to comfortably fit <= 3MB base64 documents
  app.use(express.json({ limit: '4mb' }));

  // CSRF verification on state-changing requests (POST, PATCH, PUT, DELETE)
  app.use(verifyCsrf);

  // Top-level health check
  app.get('/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });

  // Base API v1 routers
  const apiV1 = express.Router();
  apiV1.use('/auth', authRouter);
  apiV1.use('/users', usersRouter);
  apiV1.use('/invoices', invoicesRouter);
  apiV1.use('/pledges', pledgesRouter);
  apiV1.use('/pledge-markers', pledgeMarkersRouter);
  apiV1.use('/internal', internalRouter);
  apiV1.use('/', systemRouter);

  app.use('/api/v1', apiV1);

  // 404 handler for undefined API routes
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found.',
      },
    });
  });

  // Global uniform error handling middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
