/**
 * components/LimitationsNotice/LimitationsNotice.tsx
 *
 * HONEST LIMITS footer — must appear on every page, never contradicted.
 * Content copied verbatim from docs/AGENTS.md.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes.js';
import styles from './LimitationsNotice.module.css';

export function LimitationsNotice() {
  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.inner}>
        <p className={styles.brand}>◈ Stock &amp; Foil — Finance the invoice. Not the fraud.</p>
        <p className={styles.text}>
          <strong>Demo system:</strong> Duplicate prevention works only within this registry.
          A hash or acknowledgement does not guarantee authenticity, payment, or legal
          enforceability. Auth is demonstration-only — not identity verification.
          Funding is simulated; no real loans or bank transfers.
          ZK proofs are a future enhancement not present in this build.
          Local/mock records are not on-chain.{' '}
          <Link to={ROUTES.about} className={styles.link}>Full limitations →</Link>
        </p>
      </div>
    </footer>
  );
}
