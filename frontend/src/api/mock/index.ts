/**
 * api/mock/index.ts
 *
 * The mock "fetch" function. When VITE_USE_MOCK=true, api/client.ts calls
 * this instead of the real window.fetch. It routes the request to the
 * correct handler based on the URL path.
 */

import { handleAuth } from './auth.mock.js';
import { handleInvoices } from './invoices.mock.js';
import { handlePledges } from './pledges.mock.js';
import { handleSystem } from './system.mock.js';

// -----------------------------------------------------------------------
// Helpers exported to handlers
// -----------------------------------------------------------------------

/** Build a JSON Response with the success envelope {data:T}. */
export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a 201 Created JSON Response. */
export function created<T>(data: T): Response {
  return ok(data, 201);
}

/** Build a JSON Response with the error envelope. */
export function err(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return new Response(JSON.stringify({ error: { code, message, details } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// -----------------------------------------------------------------------
// Body parser
// -----------------------------------------------------------------------
function parseBody(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
}

// -----------------------------------------------------------------------
// Main mock fetch — matches the signature of window.fetch
// -----------------------------------------------------------------------
export async function mockFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  // Normalise the URL to a string
  let rawUrl: string;
  if (typeof input === 'string') {
    rawUrl = input;
  } else if (input instanceof URL) {
    rawUrl = input.href;
  } else {
    rawUrl = (input as Request).url;
  }

  const method = ((init?.method ?? (input instanceof Request ? input.method : 'GET')) as string).toUpperCase();
  const body = parseBody(init);

  // Strip origin prefix and query string for routing
  const withoutOrigin = rawUrl.replace(/^https?:\/\/[^/]+/, '');
  const qIndex = withoutOrigin.indexOf('?');
  const pathWithBase = qIndex >= 0 ? withoutOrigin.slice(0, qIndex) : withoutOrigin;
  const queryString = qIndex >= 0 ? withoutOrigin.slice(qIndex + 1) : '';
  const params = new URLSearchParams(queryString);

  // Strip the /api/v1 prefix to get the relative path
  const API_PREFIX = '/api/v1';
  const relative = pathWithBase.startsWith(API_PREFIX)
    ? pathWithBase.slice(API_PREFIX.length)
    : pathWithBase;

  try {
    // Auth + users
    if (relative.startsWith('/auth') || relative.startsWith('/users')) {
      return await handleAuth(method, relative, body);
    }
    // Invoices + pledge-markers (pledge-markers are conceptually related)
    if (relative.startsWith('/invoices') || relative.startsWith('/pledge-markers')) {
      return await handleInvoices(method, relative, body, params);
    }
    // Pledges
    if (relative.startsWith('/pledges')) {
      return await handlePledges(method, relative);
    }
    // System + health
    if (relative.startsWith('/system') || relative.startsWith('/health')) {
      return await handleSystem(method, relative);
    }

    return err(404, 'NOT_FOUND', `Mock: unknown route ${method} ${relative}`);
  } catch (e) {
    console.error('[Mock] Unhandled error in mockFetch:', e);
    return err(500, 'INTERNAL_ERROR', 'Mock: unexpected internal error');
  }
}
