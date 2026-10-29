import { Router, Request, Response } from 'express';
import { config } from '../config.js';

export const systemRouter = Router();

// GET /system/status
systemRouter.get('/system/status', (_req: Request, res: Response) => {
  res.json({
    data: {
      chainMode: config.CHAIN_MODE,
      chainConfigured: config.CHAIN_MODE !== 'MOCK' && Boolean(config.CONTRACT_ADDRESS),
      contractAddress: config.CONTRACT_ADDRESS || null,
      chainId: config.CHAIN_ID || null,
    },
  });
});

// GET /health
systemRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ data: { ok: true } });
});
