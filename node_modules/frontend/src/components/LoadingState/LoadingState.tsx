/**
 * components/LoadingState/LoadingState.tsx
 */
import React from 'react';
import styles from './LoadingState.module.css';

interface Props {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: Props) {
  return (
    <div className={styles.container} role="status" aria-label={message}>
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
