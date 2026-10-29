/**
 * components/CommitmentView/CommitmentView.tsx
 * Shows the cryptographic commitment hash + "Verify commitment" button.
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
        <div className={styles.labelWrapper}>
          <span className={styles.label}>🔐 Keccak-256 Commitment</span>
          <span className={styles.proofBadge}>MST Anchor</span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { void handleCopy(); }}
            aria-label="Copy commitment hash"
          >
            {copied ? '✓ Copied' : '📋 Copy Hash'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => { void handleVerify(); }}
            disabled={verifying}
            aria-busy={verifying}
          >
            {verifying ? '⚡ Verifying on Chain…' : '🛡️ Verify Cryptographic Proof'}
          </button>
        </div>
      </div>

      <div className={styles.hashBox}>
        <code className={`code-block ${styles.hash}`}>{commitment}</code>
      </div>

      {verified === true && (
        <p className={styles.valid}>
          <span>✓</span>
          <span>Commitment verified — on-chain state perfectly matches the canonical invoice hash</span>
        </p>
      )}
      {verified === false && (
        <p className={styles.invalid}>
          <span>✗</span>
          <span>Commitment mismatch detected — hash does not match current state</span>
        </p>
      )}
    </div>
  );
}
