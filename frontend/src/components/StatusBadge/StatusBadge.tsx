/**
 * components/StatusBadge/StatusBadge.tsx
 *
 * Maps every InvoiceStatus exactly per the contract enum.
 * Colors per the design system — do NOT add statuses not in the contract.
 */

import React from 'react';
import type { InvoiceStatus } from '../../api/types.js';
import styles from './StatusBadge.module.css';

interface Props {
  status: InvoiceStatus;
}

const CONFIG: Record<
  InvoiceStatus,
  { label: string; cssClass: string }
> = {
  DRAFT:        { label: 'Draft',           cssClass: styles.draft },
  PENDING_ACK:  { label: 'Awaiting Buyer',  cssClass: styles.pendingAck },
  ACKNOWLEDGED: { label: 'Acknowledged',    cssClass: styles.acknowledged },
  REJECTED:     { label: 'Rejected',        cssClass: styles.rejected },
  AVAILABLE:    { label: 'Available',       cssClass: styles.available },
  PLEDGED:      { label: 'Pledged',         cssClass: styles.pledged },
  SETTLED:      { label: 'Settled',         cssClass: styles.settled },
};

export function StatusBadge({ status }: Props) {
  const { label, cssClass } = CONFIG[status];
  return (
    <span className={`badge ${cssClass}`} aria-label={`Invoice status: ${label}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
