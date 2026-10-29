import { Router, Request, Response, NextFunction } from 'express';
import { verifyCronSecret, reconcilePendingTransactions } from '../services/reconcile.js';
import { AppError } from '../middleware/errorHandler.js';

export const internalRouter = Router();

// POST /internal/reconcile
internalRouter.post('/reconcile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');
    if (!verifyCronSecret(authHeader)) {
      throw new AppError('UNAUTHENTICATED', 'Invalid or missing CRON_SECRET authorization token.', 401);
    }

    const result = await reconcilePendingTransactions();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
