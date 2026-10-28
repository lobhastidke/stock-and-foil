/**
 * routes.tsx
 *
 * Central map of all route paths.
 * Import ROUTES everywhere instead of writing "/supplier/..." inline.
 */

export const ROUTES = {
  // Public
  login: '/login',
  register: '/register',
  about: '/about',

  // Supplier
  supplierDashboard: '/supplier/dashboard',
  invoiceCreate: '/supplier/invoices/new',
  invoiceDetail: (id: string) => `/supplier/invoices/${id}`,

  // Buyer
  buyerDashboard: '/buyer/dashboard',
  acknowledgeInvoice: (id: string) => `/buyer/invoices/${id}`,

  // Financier
  financierDashboard: '/financier/dashboard',
  pledgeReview: (id: string) => `/financier/invoices/${id}`,
  pledgeStatus: (id: string) => `/financier/pledges/${id}`,
} as const;
