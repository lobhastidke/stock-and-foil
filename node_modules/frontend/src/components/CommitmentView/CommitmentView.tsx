/**
 * components/CommitmentView/CommitmentView.tsx
 * Shows the commitment hash + "Verify commitment" button.
 */

import React, { useState } from 'react';
import { verifyCommitment } from '../../api/endpoints.js';
import styles from './CommitmentView.module.css';

interface Props {
  commitment: string;
  invoiceId: string;
}

export function CommitmentView({ commitment, invoiceId }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    setVerified(null);
    try {
      const res = await verifyCommitment(invoiceId);
      setVerified(res.valid);
    } catch {
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(commitment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Commitment hash</span>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { void handleCopy(); }}
            aria-label="Copy commitment hash"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { void handleVerify(); }}
            disabled={verifying}
            aria-busy={verifying}
          >
            {verifying ? 'Verifying…' : 'Verify commitment'}
          </button>
        </div>
      </div>
      <code className={`code-block ${styles.hash}`}>{commitment}</code>
      {verified === true && (
        <p className={styles.valid}>✓ Commitment verified — data matches the hash</p>
      )}
      {verified === false && (
        <p className={styles.invalid}>✗ Commitment mismatch — contact support</p>
      )}
    </div>
  );
}
