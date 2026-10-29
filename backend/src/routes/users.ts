import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';

export const usersRouter = Router();

// GET /users/buyers
usersRouter.get('/buyers', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT id, display_name, organisation 
       FROM users 
       WHERE role = 'BUYER' 
       ORDER BY display_name ASC`
    );

    const buyers = rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      organisation: r.organisation,
    }));

    res.json({ data: buyers });
  } catch (err) {
    next(err);
  }
});
