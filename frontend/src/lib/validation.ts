/**
 * lib/validation.ts
 *
 * Zod schemas for all forms.
 * Client validation mirrors server rules but is NEVER trusted as security.
 * The backend always re-validates.
 */

import { z } from 'zod';

// -----------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------

export const registerSchema = z
  .object({
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(10, 'Password must be at least 10 characters'),
    confirmPassword: z.string(),
    displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100),
    organisation: z.string().min(2, 'Organisation name required').max(200),
    role: z.enum(['SUPPLIER', 'BUYER', 'FINANCIER'], {
      errorMap: () => ({ message: 'Please select a role' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterForm = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginForm = z.infer<typeof loginSchema>;

// -----------------------------------------------------------------------
// Invoice
// -----------------------------------------------------------------------

/**
 * The form collects amount in major units (rupees with optional cents).
 * The page converts it to a minor-unit string before sending to the API.
 */
export const invoiceFormSchema = z
  .object({
    invoiceNumber: z
      .string()
      .min(1, 'Invoice number is required')
      .max(100)
      .regex(/^[A-Za-z0-9\-_/]+$/, 'Only letters, numbers, hyphens, underscores and slashes'),
    buyerId: z.string().min(1, 'Please select a buyer'),
    /** Major-unit string the user types, e.g. "5000.00" */
    amountMajor: z
      .string()
      .min(1, 'Amount is required')
      .regex(/^\d+(\.\d{0,2})?$/, 'Enter a valid positive amount (e.g. 5000.00)'),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
    issueDate: z.string().min(1, 'Issue date is required'),
    dueDate: z.string().min(1, 'Due date is required'),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'Due date must be on or after issue date',
    path: ['dueDate'],
  });

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;

// -----------------------------------------------------------------------
// Acknowledge / Reject
// -----------------------------------------------------------------------

export const acknowledgeSchema = z.object({
  decision: z.enum(['ACKNOWLEDGE', 'REJECT']),
  reason: z.string().optional(),
}).refine(
  (data) => data.decision !== 'REJECT' || (data.reason?.trim().length ?? 0) > 0,
  {
    message: 'Reason is required when rejecting',
    path: ['reason'],
  },
);

export type AcknowledgeForm = z.infer<typeof acknowledgeSchema>;

// -----------------------------------------------------------------------
// Pledge
// -----------------------------------------------------------------------

export const pledgeFormSchema = z
  .object({
    amountMajor: z
      .string()
      .regex(/^\d+(\.\d{0,2})?$/, 'Enter a valid positive amount')
      .optional(),
    advance: z
      .string()
      .regex(/^\d+(\.\d{0,2})?$/, 'Enter a valid positive amount')
      .optional(),
    note: z.string().max(500, 'Note must be under 500 characters').optional(),
  })
  .refine((data) => Boolean((data.advance && data.advance.length > 0) || (data.amountMajor && data.amountMajor.length > 0)), {
    message: 'Advance amount is required',
    path: ['advance'],
  });

export type PledgeForm = z.infer<typeof pledgeFormSchema>;

// -----------------------------------------------------------------------
// Document upload (client-side gate before calling the API)
// -----------------------------------------------------------------------
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const MAX_DOC_BYTES = 3 * 1024 * 1024; // 3 MB

export function validateDocumentFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return 'Only PDF, PNG, and JPG files are allowed';
  }
  if (file.size > MAX_DOC_BYTES) {
    return 'File must be 3 MB or smaller';
  }
  return null; // valid
}
