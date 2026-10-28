/**
 * api/client.ts
 *
 * Fetch wrapper that:
 *  - Always sends credentials: 'include' (httpOnly cookie auth)
 *  - Adds Content-Type: application/json AND X-SF-CSRF: 1 on mutations
 *  - Unwraps the {data} success envelope
 *  - Throws ApiError on {error} envelope
 *  - Routes through the in-memory mock when VITE_USE_MOCK=true
 */

import { mockFetch } from './mock/index.js';

// -----------------------------------------------------------------------
// Config — resolved at build time by Vite
// -----------------------------------------------------------------------
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

// -----------------------------------------------------------------------
// ApiError — typed error thrown on every non-2xx response
// -----------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** Per-field details from VALIDATION_ERROR; pledgeMarker from DUPLICATE_PLEDGE, etc. */
    public readonly details?: unknown,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// -----------------------------------------------------------------------
// Internal request helper
// -----------------------------------------------------------------------
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Shape of every response body the server sends.
 * Either {data:T} on success or {error:{code,message,details?}} on failure.
 */
type Envelope<T> =
  | { data: T; error?: never }
  | { error: { code: string; message: string; details?: unknown }; data?: never };

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isMutation = method !== 'GET';
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {};
  if (isMutation) {
    headers['Content-Type'] = 'application/json';
    headers['X-SF-CSRF'] = '1'; // CSRF header required by the contract
  }

  const init: RequestInit = {
    method,
    credentials: 'include', // send the sf_session httpOnly cookie
    headers,
    body: isMutation && body !== undefined ? JSON.stringify(body) : undefined,
  };

  // In mock mode we skip the network entirely and call the in-memory mock
  const doFetch: typeof fetch = USE_MOCK ? (mockFetch as typeof fetch) : fetch;
  const response = await doFetch(url, init);

  // The server always returns JSON (even errors)
  const json = (await response.json()) as Envelope<T>;

  if (json.error != null) {
    throw new ApiError(
      json.error.code,
      json.error.message,
      json.error.details,
      response.status,
    );
  }

  if (!response.ok) {
    // Shouldn't happen (server always provides error envelope), but guard it
    throw new ApiError('INTERNAL_ERROR', 'Unexpected response from server', undefined, response.status);
  }

  return json.data as T;
}

// -----------------------------------------------------------------------
// Public API surface
// -----------------------------------------------------------------------
export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
