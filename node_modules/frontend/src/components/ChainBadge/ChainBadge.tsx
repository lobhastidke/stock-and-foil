/**
 * components/ChainBadge/ChainBadge.tsx
 *
 * Display rules (exact per the plan / contract):
 *
 * LOCAL_ONLY  (any mode)        → grey  "Local record (not on-chain)"
 * PENDING     (any mode)        → amber "Pending"
 * CONFIRMED   + MOCK            → green "Confirmed (mock)" — NO tx link
 * CONFIRMED   + HARDHAT         → green "Confirmed on Hardhat" — link only if env var set
 * CONFIRMED   + MST_TESTNET     → green "Confirmed on MST Testnet" — link only if env var set
 * FAILED      (any mode)        → red   "Failed"
 *
 * NEVER label a MOCK / LOCAL_ONLY record as on-chain.
 * NEVER hardcode an explorer URL — read VITE_EXPLORER_TX_URL.
 */

import React from 'react';
import type { ChainStatus, ChainMode } from '../../api/types.js';
import styles from './ChainBadge.module.css';

interface Props {
  chainStatus: ChainStatus;
  chainMode: ChainMode;
  txHash?: string | null;
  /** Label prefix, e.g. "Registration" or "Pledge" */
  label?: string;
}

const EXPLORER_URL = (import.meta.env.VITE_EXPLORER_TX_URL as string | undefined) ?? '';

function modeLabel(mode: ChainMode): string {
  switch (mode) {
    case 'MOCK':        return 'mock';
    case 'HARDHAT':     return 'Hardhat';
    case 'MST_TESTNET': return 'MST Testnet';
  }
}

export function ChainBadge({ chainStatus, chainMode, txHash, label }: Props) {
  const prefix = label ? `${label}: ` : '';

  // Determine display
  let badgeClass: string;
  let text: string;
  let showLink = false;

  switch (chainStatus) {
    case 'LOCAL_ONLY':
      badgeClass = styles.localOnly;
      text = `${prefix}Local record (not on-chain)`;
      break;
    case 'PENDING':
      badgeClass = styles.pending;
      text = `${prefix}Pending`;
      break;
    case 'CONFIRMED':
      badgeClass = styles.confirmed;
      if (chainMode === 'MOCK') {
        text = `${prefix}Confirmed (mock)`;
        showLink = false; // never link mock tx hashes
      } else {
        text = `${prefix}Confirmed on ${modeLabel(chainMode)}`;
        // Only show a tx link if the explorer URL is configured AND we have a hash
        showLink = Boolean(EXPLORER_URL && txHash);
      }
      break;
    case 'FAILED':
      badgeClass = styles.failed;
      text = `${prefix}Failed`;
      break;
    default:
      badgeClass = styles.localOnly;
      text = `${prefix}Unknown`;
  }

  const txUrl = showLink && txHash ? `${EXPLORER_URL}${txHash}` : null;

  return (
    <div className={`${styles.badge} ${badgeClass}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{text}</span>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.txLink}
          aria-label="View transaction on blockchain explorer"
        >
          ↗ View tx
        </a>
      )}
    </div>
  );
}
