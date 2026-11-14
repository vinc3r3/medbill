// Display formatting shared by server and client code.

/** $1,234.50. With `compact`, whole amounts drop the cents: $367. */
export function formatUsd(amount: number, { compact = false } = {}): string {
  const cents = Math.round(amount * 100);
  const whole = cents % 100 === 0;
  const digits = compact && whole ? 0 : 2;
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** YYYY-MM-DD → MM/DD/YYYY (as printed on US bills). Anything else is returned unchanged. */
export function formatUsDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}
