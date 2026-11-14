// Minimal HS256 JWT verification (for signed webhooks). Only HS256 is accepted, so "alg: none" and
// algorithm-confusion tricks fail. Comparison is constant-time.
import { createHmac, timingSafeEqual } from 'node:crypto';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !secret) return null;
  const [h, p, s] = parts;
  try {
    const header = decode(h);
    if (header?.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const given = Buffer.from(s, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = decode(p);
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
