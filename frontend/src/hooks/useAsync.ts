/**
 * hooks/useAsync.ts
 *
 * A simple, reusable data-fetching hook.
 * We deliberately avoid TanStack Query to keep dependencies minimal
 * (HARD RULES in docs/AGENTS.md require minimal dependencies).
 *
 * Usage:
 *   const { data, loading, error, refetch } = useAsync(() => getInvoice(id), [id]);
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Call this to manually trigger a fresh fetch. */
  refetch: () => void;
}

/**
 * Fetches data by calling `fn` whenever `deps` change or `refetch` is called.
 * Cancels in-flight requests when the component unmounts or deps change.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  // We store fn in a ref so the effect doesn't need to include it in deps
  // (avoiding re-runs every render if fn is an inline arrow function)
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fnRef.current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, refetch };
}

/**
 * Like useAsync but automatically re-fetches on an interval
 * while shouldPoll() returns true.
 *
 * Used for polling invoice/pledge status while chainStatus === 'PENDING'.
 */
export function usePolling<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
  shouldPoll: (data: T | null) => boolean,
  intervalMs = 5000,
): AsyncState<T> {
  const state = useAsync(fn, deps);

  const { refetch, data } = state;
  const shouldPollRef = useRef(shouldPoll);
  shouldPollRef.current = shouldPoll;

  useEffect(() => {
    if (!shouldPollRef.current(data)) return;
    const id = setInterval(() => {
      if (shouldPollRef.current(data)) refetch();
    }, intervalMs);
    return () => clearInterval(id);
  }, [data, refetch, intervalMs]);

  return state;
}
