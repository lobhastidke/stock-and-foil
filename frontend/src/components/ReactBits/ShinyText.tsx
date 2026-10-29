/**
 * components/ReactBits/ShinyText.tsx
 *
 * Inspired by React Bits (reactbits.dev) ShinyText.
 * Adds a subtle, continuous metallic light sweep across text.
 */

import React, { type ReactNode } from 'react';
import styles from './ShinyText.module.css';

interface ShinyTextProps {
  children: ReactNode;
  disabled?: boolean;
  speed?: number; // seconds
  className?: string;
  as?: 'span' | 'p' | 'div';
}

export function ShinyText({
  children,
  disabled = false,
  speed = 4,
  className = '',
  as: Component = 'span',
}: ShinyTextProps) {
  return (
    <Component
      className={`${styles.shinyText} ${disabled ? styles.disabled : ''} ${className}`}
      style={{ animationDuration: `${speed}s` }}
    >
      {children}
    </Component>
  );
}
