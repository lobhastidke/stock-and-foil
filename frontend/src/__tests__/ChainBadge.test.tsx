import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChainBadge } from '../components/ChainBadge/ChainBadge.js';

describe('ChainBadge component', () => {
  it('renders grey local record for LOCAL_ONLY', () => {
    render(<ChainBadge chainStatus="LOCAL_ONLY" chainMode="MOCK" />);
    expect(screen.getByText('Local record (not on-chain)')).toBeInTheDocument();
  });

  it('renders pending for PENDING', () => {
    render(<ChainBadge chainStatus="PENDING" chainMode="HARDHAT" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders confirmed (mock) without link when MOCK mode', () => {
    render(
      <ChainBadge
        chainStatus="CONFIRMED"
        chainMode="MOCK"
        txHash="0x1234567890abcdef"
      />,
    );
    expect(screen.getByText('Confirmed (mock)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders failed for FAILED', () => {
    render(<ChainBadge chainStatus="FAILED" chainMode="MST_TESTNET" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
