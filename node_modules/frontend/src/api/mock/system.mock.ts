/**
 * api/mock/system.mock.ts
 *
 * Handles:
 *   GET /system/status
 *   GET /health
 */

import { ok } from './index.js';

export async function handleSystem(method: string, path: string): Promise<Response> {
  if (path === '/health' && method === 'GET') {
    return ok({ ok: true });
  }

  if (path === '/system/status' && method === 'GET') {
    return ok({
      chainMode: 'MOCK',
      chainConfigured: false,
      contractAddress: null,
      chainId: null,
    });
  }

  // /internal/reconcile is a cron-only route, not called from frontend
  return ok({ ok: true });
}
