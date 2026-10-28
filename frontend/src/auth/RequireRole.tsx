/**
 * auth/RequireRole.tsx
 *
 * Route guard that:
 *  - Redirects to /login if not authenticated
 *  - Redirects to the user's own dashboard if they have the wrong role
 *  - Renders children only when the role matches
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.js';
import { ROUTES } from '../routes.js';
import type { Role } from '../api/types.js';

interface Props {
  role: Role;
  children: React.ReactNode;
}

/** Maps a role to its dashboard path (for wrong-role redirect). */
function dashboardFor(role: Role): string {
  switch (role) {
    case 'SUPPLIER':   return ROUTES.supplierDashboard;
    case 'BUYER':      return ROUTES.buyerDashboard;
    case 'FINANCIER':  return ROUTES.financierDashboard;
  }
}

export function RequireRole({ role, children }: Props) {
  const { user, initialising } = useAuth();

  // While the initial /auth/me call is in progress, render nothing (avoids flash)
  if (initialising) return null;

  // Not logged in → go to login
  if (!user) return <Navigate to={ROUTES.login} replace />;

  // Wrong role → go to their own dashboard
  if (user.role !== role) return <Navigate to={dashboardFor(user.role)} replace />;

  return <>{children}</>;
}
