/**
 * components/AuditTimeline/AuditTimeline.tsx
 * Shows the append-only audit log for an invoice.
 */

import React from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { getAuditEvents } from '../../api/endpoints.js';
import { LoadingState } from '../LoadingState/LoadingState.js';
import styles from './AuditTimeline.module.css';

interface Props {
  invoiceId: string;
}

const ACTION_ICONS: Record<string, string> = {
  INVOICE_CREATED: '📄',
  INVOICE_UPDATED: '✏️',
  COMMITMENT_GENERATED: '🔐',
  ACK_SUBMITTED: '✅',
  INVOICE_REJECTED: '❌',
  INVOICE_RELEASED: '🚀',
  PLEDGE_REQUESTED: '💰',
  PLEDGE_REGISTERED: '⛓️',
  PLEDGE_DUPLICATE_REJECTED: '🛡️',
  PLEDGE_FAILED: '⚠️',
  INVOICE_SETTLED: '🏁',
  CHAIN_TX_SUBMITTED: '📡',
  CHAIN_TX_CONFIRMED: '✔️',
  CHAIN_TX_FAILED: '💔',
};

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function AuditTimeline({ invoiceId }: Props) {
  const { data: events, loading, error } = useAsync(
    () => getAuditEvents(invoiceId),
    [invoiceId],
  );

  if (loading) return <LoadingState message="Loading audit log…" />;
  if (error) return <p className="text-muted text-sm">Could not load audit log.</p>;
  if (!events?.length) return <p className="text-muted text-sm">No events recorded yet.</p>;

  return (
    <ol className={styles.timeline} aria-label="Audit timeline">
      {events.map((event) => (
        <li key={event.id} className={styles.event}>
          <div className={styles.iconCol}>
            <span className={styles.icon} aria-hidden="true">
              {ACTION_ICONS[event.action] ?? '📌'}
            </span>
            <div className={styles.line} aria-hidden="true" />
          </div>
          <div className={styles.content}>
            <div className={styles.eventHeader}>
              <span className={styles.actionName}>{formatAction(event.action)}</span>
              <span className={styles.source} data-source={event.source}>{event.source}</span>
            </div>
            <div className={styles.meta}>
              {event.actor && (
                <span className={styles.actor}>{event.actor.displayName}</span>
              )}
              <time className={styles.time} dateTime={event.at}>
                {new Date(event.at).toLocaleString()}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
