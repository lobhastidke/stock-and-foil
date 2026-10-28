import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from '../auth/RequireRole.js';
import * as AuthContextModule from '../auth/AuthContext.js';
import type { User } from '../api/types.js';

describe('RequireRole route guard', () => {
  function renderWithRole(role: 'SUPPLIER' | 'BUYER' | 'FINANCIER', mockUser: User | null, initialising = false) {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      initialising,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    return render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/supplier/dashboard" element={<div>Supplier Dashboard</div>} />
          <Route path="/buyer/dashboard" element={<div>Buyer Dashboard</div>} />
          <Route path="/financier/dashboard" element={<div>Financier Dashboard</div>} />
          <Route
            path="/protected"
            element={
              <RequireRole role={role}>
                <div>Secret Protected Content</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders nothing while initialising', () => {
    renderWithRole('SUPPLIER', null, true);
    expect(screen.queryByText('Secret Protected Content')).toBeNull();
    expect(screen.queryByText('Login Page')).toBeNull();
  });

  it('redirects to /login when user is not authenticated', () => {
    renderWithRole('SUPPLIER', null, false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Protected Content')).toBeNull();
  });

  it('redirects to user dashboard when role does not match', () => {
    const buyerUser: User = {
      id: 'buyer-1',
      email: 'buyer@test.com',
      displayName: 'Test Buyer',
      organisation: 'Buyer Org',
      role: 'BUYER',
      createdAt: '2026-01-01T00:00:00Z',
    };

    renderWithRole('SUPPLIER', buyerUser, false);
    expect(screen.getByText('Buyer Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Secret Protected Content')).toBeNull();
  });

  it('renders children when role matches', () => {
    const supplierUser: User = {
      id: 'supplier-1',
      email: 'supplier@test.com',
      displayName: 'Test Supplier',
      organisation: 'Supplier Org',
      role: 'SUPPLIER',
      createdAt: '2026-01-01T00:00:00Z',
    };

    renderWithRole('SUPPLIER', supplierUser, false);
    expect(screen.getByText('Secret Protected Content')).toBeInTheDocument();
  });
});
