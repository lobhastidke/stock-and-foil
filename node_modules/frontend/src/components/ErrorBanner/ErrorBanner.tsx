/**
 * components/ErrorBanner/ErrorBanner.tsx
 *
 * Maps ApiError codes → friendly user messages.
 * UNAUTHENTICATED is not shown here — RequireRole handles the redirect.
 */

import React from 'react';
import { ApiError } from '../../api/client.js';
import styles from './ErrorBanner.module.css';

interface Props {
  error: unknown;
  /** Optional override message (skips code mapping). */
  message?: string;
}

function toFriendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return "You don't have permission to do this.";
      case 'NOT_FOUND':
        return 'The requested item was not found.';
      case 'DUPLICATE_PLEDGE':
        return 'A pledge already exists for this commitment. Duplicate prevention is working!';
      case 'INVALID_TRANSITION':
        return "This action isn't allowed at this stage of the invoice lifecycle.";
      case 'CONFLICT':
        return error.message;
      case 'CHAIN_UNAVAILABLE':
        return 'Blockchain unavailable — operating in local demo mode.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment and try again.';
      case 'COMMITMENT_MISMATCH':
        return 'Commitment verification failed. The invoice data may have changed.';
      case 'VALIDATION_ERROR':
        return error.message || 'Please check the form for errors.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

export function ErrorBanner({ error, message }: Props) {
  if (!error) return null;

  const text = message ?? toFriendlyMessage(error);
  const isDuplicate = error instanceof ApiError && error.code === 'DUPLICATE_PLEDGE';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`${styles.banner} ${isDuplicate ? styles.duplicate : styles.error}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {isDuplicate ? '🛡️' : '⚠️'}
      </span>
      <div>
        {isDuplicate && (
          <strong className={styles.title}>Duplicate pledge detected</strong>
        )}
        <p className={styles.text}>{text}</p>
        {Boolean(isDuplicate && error instanceof ApiError && error.details) && (
          <p className={styles.detail}>
            Marker: <code className={styles.code}>
              {(error as ApiError).details && typeof (error as ApiError).details === 'object' && 'pledgeMarker' in ((error as ApiError).details as object)
                ? String(((error as ApiError).details as { pledgeMarker?: unknown }).pledgeMarker ?? '')
                : ''}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
