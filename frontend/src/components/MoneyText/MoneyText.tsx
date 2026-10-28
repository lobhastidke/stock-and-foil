/**
 * components/MoneyText/MoneyText.tsx
 * Renders a minor-unit string as a formatted currency amount.
 * Uses lib/money.ts — never parseFloat.
 */

import React from 'react';
import { formatMoney } from '../../lib/money.js';

interface Props {
  minorUnits: string;
  currency?: string;
  className?: string;
}

export function MoneyText({ minorUnits, currency = 'INR', className }: Props) {
  return (
    <span className={className} aria-label={`${formatMoney(minorUnits, currency)}`}>
      {formatMoney(minorUnits, currency)}
    </span>
  );
}
