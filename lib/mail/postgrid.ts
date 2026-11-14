// PostGrid Print & Mail (https://guides.postgrid.com). Server only. TEST KEYS ONLY: no real mail is sent.
import { requireEnv } from '../env';
import { MailError, type MailContact, type MailLetter, type MailProvider } from './types';

const BASE_URL = 'https://api.postgrid.com/print-mail/v1';

/** Refuses anything but a test key, so a live key can never print or mail a letter from this app. */
function testKey(): string {
  const key = requireEnv('POSTGRID_API_KEY');
  if (!key.startsWith('test_')) throw new MailError('Mail is configured with a non-test key. This demo only allows test mode.', 500);
  return key;
}

type PgLetter = {
  id: string;
  live: boolean;
  status: string;
  url?: string | null;
  trackingNumber?: string | null;
  cancellation?: { reason?: string; note?: string } | null;
};

function toMailLetter(l: PgLetter): MailLetter {
  if (l.live) throw new MailError('The mail provider created a live letter. Stopping.', 500); // belt and braces
  return {
    id: l.id,
    status: l.status,
    previewUrl: l.url ?? null,
    trackingNumber: l.trackingNumber ?? null,
    cancelledReason: l.status === 'cancelled' ? (l.cancellation?.note ?? l.cancellation?.reason ?? 'Cancelled by the mail provider.') : null,
  };
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { idempotencyKey, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        'x-api-key': testKey(),
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof MailError) throw err;
    throw new MailError("We couldn't reach the mail service. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message ?? `HTTP ${response.status}`;
    console.error(`PostGrid ${init.method ?? 'GET'} ${path} failed: ${detail}`);
    if (response.status === 401 || response.status === 403) throw new MailError('The mail service rejected our credentials.', 500);
    if (response.status === 400 || response.status === 422) throw new MailError(`The mail service couldn't accept this letter: ${detail}`, 422);
    throw new MailError('The mail service had a problem. Please try again.');
  }
  return data as T;
}

const contact = (c: MailContact, kind: 'person' | 'company') => ({
  ...(kind === 'company' ? { companyName: c.name } : { firstName: c.name }),
  addressLine1: c.addressLine1,
  ...(c.addressLine2 ? { addressLine2: c.addressLine2 } : {}),
  city: c.city,
  provinceOrState: c.state,
  postalOrZip: c.zip,
  countryCode: 'US',
});

export const postgrid: MailProvider = {
  async createCertifiedLetter({ to, from, html, idempotencyKey, description }) {
    const created = await call<PgLetter>('/letters', {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({
        to: contact(to, 'company'),
        from: contact(from, 'person'),
        html,
        mailingClass: 'certified',
        // Addresses go on their own cover page, so letter content can never overlap the envelope window.
        addressPlacement: 'insert_blank_page',
        description,
      }),
    });
    return toMailLetter(created);
  },
  async getLetter(id) {
    return toMailLetter(await call<PgLetter>(`/letters/${encodeURIComponent(id)}`));
  },
  async advanceTestLetter(id) {
    return toMailLetter(await call<PgLetter>(`/letters/${encodeURIComponent(id)}/progressions`, { method: 'POST' }));
  },
};
