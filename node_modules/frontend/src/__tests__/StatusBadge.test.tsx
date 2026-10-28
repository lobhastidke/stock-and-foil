import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from '../components/StatusBadge/StatusBadge.js';
import type { InvoiceStatus } from '../api/types.js';

describe('StatusBadge component', () => {
  const statuses: { status: InvoiceStatus; expectedText: string }[] = [
    { status: 'DRAFT', expectedText: 'Draft' },
    { status: 'PENDING_ACK', expectedText: 'Awaiting Buyer' },
    { status: 'ACKNOWLEDGED', expectedText: 'Acknowledged' },
    { status: 'REJECTED', expectedText: 'Rejected' },
    { status: 'AVAILABLE', expectedText: 'Available' },
    { status: 'PLEDGED', expectedText: 'Pledged' },
    { status: 'SETTLED', expectedText: 'Settled' },
  ];

  statuses.forEach(({ status, expectedText }) => {
    it(`renders correct label for status: ${status}`, () => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  });
});
