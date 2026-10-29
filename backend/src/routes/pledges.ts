import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { getPledgeById, getMyPledges, getPledgeMarkerStatus } from '../services/pledges.js';

export const pledgesRouter = Router();

// GET /pledges (Financier: my pledges)
pledgesRouter.get('/', requireAuth, requireRole('FINANCIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getMyPledges(req.user!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /pledges/:id
pledgesRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pledge = await getPledgeById(req.params.id, req.user!);
    res.json({ data: pledge });
  } catch (err) {
    next(err);
  }
});

// Route for pledge-markers inspection
export const pledgeMarkersRouter = Router();

// GET /pledge-markers/:marker (any signed-in user)
pledgeMarkersRouter.get('/:marker', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getPledgeMarkerStatus(req.params.marker, req.user!);
    res.json({ data: status });
  } catch (err) {
    next(err);
  }
});
