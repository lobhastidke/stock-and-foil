/**
 * api/mock/pledges.mock.ts
 *
 * Handles:
 *   GET /pledges/:id
 *   GET /pledges        (list mine)
 */

import { db } from './db.js';
import { ok, err } from './index.js';

export async function handlePledges(method: string, path: string): Promise<Response> {
  if (!db.currentSession) return err(401, 'UNAUTHENTICATED', 'Not logged in');
  const user = db.currentSession;

  // Only financiers use the /pledges endpoints
  if (user.role !== 'FINANCIER') return err(403, 'FORBIDDEN', 'Only financiers can view pledges');

  // GET /pledges (list mine)
  if (path === '/pledges' && method === 'GET') {
    const items = db.pledges.filter((p) => p.financierId === user.id);
    return ok({ items });
  }

  // GET /pledges/:id
  const match = /^\/pledges\/([^/]+)$/.exec(path);
  if (match && method === 'GET') {
    const pledgeId = match[1]!;
    const pledge = db.pledges.find((p) => p.id === pledgeId);
    if (!pledge) return err(404, 'NOT_FOUND', 'Pledge not found');
    if (pledge.financierId !== user.id) return err(403, 'FORBIDDEN', 'Not your pledge');
    return ok({ pledge });
  }

  return err(404, 'NOT_FOUND', `Mock: unknown pledge route ${method} ${path}`);
}
