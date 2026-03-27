// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

import { VAT_RATE, AGOROT_PER_SHEKEL } from './constants';

/** Convert shekels to agorot (integer). */
export function shekelToAgorot(shekels: number): number {
  return Math.round(shekels * AGOROT_PER_SHEKEL);
}

/** Convert agorot to shekels (decimal). */
export function agorotToShekel(agorot: number): number {
  return agorot / AGOROT_PER_SHEKEL;
}

/** Format agorot as display string using he-IL locale. */
export function formatMoney(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(agorotToShekel(agorot));
}

/** Calculate VAT on an amount in agorot. Returns agorot (integer). */
export function calculateVat(amountAgorot: number): number {
  return Math.round(amountAgorot * VAT_RATE);
}

/** Calculate invoice totals from a pre-VAT subtotal in agorot. */
export function calculateInvoiceTotal(subtotalAgorot: number): {
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  const vatAmount = calculateVat(subtotalAgorot);
  return {
    subtotal: subtotalAgorot,
    vatAmount,
    total: subtotalAgorot + vatAmount,
  };
}
