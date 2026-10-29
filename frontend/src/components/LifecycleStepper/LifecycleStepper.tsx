/**
 * components/LifecycleStepper/LifecycleStepper.tsx
 * Visual blockchain pipeline showing the 5 stages of an invoice lifecycle.
 */

import React from 'react';
import type { InvoiceStatus } from '../../api/types.js';
import styles from './LifecycleStepper.module.css';

interface Props {
  status: InvoiceStatus;
  compact?: boolean;
}

const STAGES = [
  { key: 'DRAFT', label: '1. Draft' },
  { key: 'PENDING_ACK', label: '2. Committed' },
  { key: 'ACKNOWLEDGED', label: '3. Buyer Signed' },
  { key: 'AVAILABLE', label: '4. Released' },
  { key: 'PLEDGED', label: '5. Funded' },
];

export function LifecycleStepper({ status, compact = false }: Props) {
  if (status === 'REJECTED') {
    return (
      <div className={styles.stepper} aria-label="Invoice status: Rejected">
        <span className={`${styles.step} ${styles.rejected}`}>
          <span className={styles.dot} />
          <span>❌ Disputed &amp; Rejected by Buyer</span>
        </span>
      </div>
    );
  }

  // Determine stage index
  const stageOrder: Record<InvoiceStatus, number> = {
    DRAFT: 0,
    PENDING_ACK: 1,
    ACKNOWLEDGED: 2,
    AVAILABLE: 3,
    PLEDGED: 4,
    SETTLED: 4,
    REJECTED: -1,
  };

  const currentIndex = stageOrder[status] ?? 0;

  return (
    <div className={styles.stepper} aria-label="Invoice lifecycle stage">
      {STAGES.map((s, idx) => {
        const isCompleted = idx < currentIndex || status === 'SETTLED';
        const isActive = idx === currentIndex && status !== 'SETTLED';

        let itemClass = styles.step;
        if (isCompleted) itemClass += ` ${styles.completed}`;
        else if (isActive) itemClass += ` ${styles.active}`;

        return (
          <React.Fragment key={s.key}>
            <span className={itemClass}>
              <span className={styles.dot} />
              <span>{compact ? s.label.split('. ')[1] : s.label}</span>
            </span>
            {idx < STAGES.length - 1 && <span className={styles.arrow}>→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
