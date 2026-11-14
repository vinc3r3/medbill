// Parsing PostGrid webhook deliveries. PostGrid documents the event object ({ id, object: "event", type,
// data: <letter> }) but not exactly how the JWT body is wrapped, so both steps accept the likely shapes.

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** The JWT in a webhook body: either the raw body, or a string field of a JSON body. */
export function extractToken(body: string): string | null {
  const raw = body.trim();
  if (JWT_RE.test(raw)) return raw;
  try {
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') {
      for (const value of Object.values(json)) if (typeof value === 'string' && JWT_RE.test(value)) return value;
    }
  } catch {
    // not JSON
  }
  return null;
}

export type LetterEvent = { eventId: string | null; type: string; letterId: string; letterStatus: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;

/** The letter event inside verified claims (the event itself, or wrapped in payload/event/data). */
export function toLetterEvent(claims: unknown): LetterEvent | null {
  if (!isObj(claims)) return null;
  const candidates = [claims, claims.payload, claims.event, claims.data];
  for (const c of candidates) {
    if (!isObj(c) || typeof c.type !== 'string' || !c.type.startsWith('letter.')) continue;
    const letter = c.data;
    if (!isObj(letter) || letter.object !== 'letter' || typeof letter.id !== 'string' || typeof letter.status !== 'string') continue;
    return { eventId: typeof c.id === 'string' ? c.id : null, type: c.type, letterId: letter.id, letterStatus: letter.status };
  }
  return null;
}
