/**
 * components/EmptyState/EmptyState.tsx
 */
import React, { type ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, description, action, icon = '📋' }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.icon} aria-hidden="true">{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
