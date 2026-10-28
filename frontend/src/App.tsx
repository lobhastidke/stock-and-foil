/**
 * App.tsx — Route tree.
 * All protected routes are wrapped in RequireRole.
 * Public routes (login, register, about) are accessible without auth.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './routes.js';
import { RequireRole } from './auth/RequireRole.js';
import { useAuth } from './auth/AuthContext.js';

// Pages (lazy-loaded for faster initial paint)
import LoginPage from './pages/Login/index.js';
import RegisterPage from './pages/Register/index.js';
import AboutPage from './pages/About/index.js';
import SupplierDashboard from './pages/SupplierDashboard/index.js';
import InvoiceCreate from './pages/InvoiceCreate/index.js';
import InvoiceDetail from './pages/InvoiceDetail/index.js';
import BuyerDashboard from './pages/BuyerDashboard/index.js';
import AcknowledgeInvoice from './pages/AcknowledgeInvoice/index.js';
import FinancierDashboard from './pages/FinancierDashboard/index.js';
import PledgeReview from './pages/PledgeReview/index.js';
import PledgeStatus from './pages/PledgeStatus/index.js';

/** Root redirect: send logged-in users to their dashboard. */
function RootRedirect() {
  const { user, initialising } = useAuth();
  if (initialising) return null;
  if (!user) return <Navigate to={ROUTES.login} replace />;
  switch (user.role) {
    case 'SUPPLIER':  return <Navigate to={ROUTES.supplierDashboard} replace />;
    case 'BUYER':     return <Navigate to={ROUTES.buyerDashboard} replace />;
    case 'FINANCIER': return <Navigate to={ROUTES.financierDashboard} replace />;
  }
}

export default function App() {
  return (
    <Routes>
      {/* Root → role dashboard */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public */}
      <Route path={ROUTES.login}    element={<LoginPage />} />
      <Route path={ROUTES.register} element={<RegisterPage />} />
      <Route path={ROUTES.about}    element={<AboutPage />} />

      {/* Supplier */}
      <Route
        path={ROUTES.supplierDashboard}
        element={<RequireRole role="SUPPLIER"><SupplierDashboard /></RequireRole>}
      />
      <Route
        path={ROUTES.invoiceCreate}
        element={<RequireRole role="SUPPLIER"><InvoiceCreate /></RequireRole>}
      />
      <Route
        path="/supplier/invoices/:id"
        element={<RequireRole role="SUPPLIER"><InvoiceDetail /></RequireRole>}
      />

      {/* Buyer */}
      <Route
        path={ROUTES.buyerDashboard}
        element={<RequireRole role="BUYER"><BuyerDashboard /></RequireRole>}
      />
      <Route
        path="/buyer/invoices/:id"
        element={<RequireRole role="BUYER"><AcknowledgeInvoice /></RequireRole>}
      />

      {/* Financier */}
      <Route
        path={ROUTES.financierDashboard}
        element={<RequireRole role="FINANCIER"><FinancierDashboard /></RequireRole>}
      />
      <Route
        path="/financier/invoices/:id"
        element={<RequireRole role="FINANCIER"><PledgeReview /></RequireRole>}
      />
      <Route
        path="/financier/pledges/:id"
        element={<RequireRole role="FINANCIER"><PledgeStatus /></RequireRole>}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
