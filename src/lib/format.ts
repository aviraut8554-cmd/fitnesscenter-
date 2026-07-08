/** Presentation helpers shared across admin + PWA commerce screens. */

/**
 * Format an integer minor-unit amount (e.g. paise) as a localized currency
 * string. Amounts are always stored/handled as integer minor units server-side.
 */
export function formatMoney(amountMinor: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    // Unknown currency code — fall back to a plain decimal with the code.
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}
