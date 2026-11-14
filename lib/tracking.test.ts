// Tracking: JWT verification, webhook parsing, status mapping, reminder. Written before the code.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHs256 } from './jwt';
import { extractToken, toLetterEvent } from './mail-webhook';
import { caseStatusForLetter, isReminderDue, reminderDate } from './tracking';

const SECRET = 'a'.repeat(64);
const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');
function sign(payload: object, { secret = SECRET, header = { alg: 'HS256', typ: 'JWT' } } = {}) {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
const event = { id: 'event_1', object: 'event', type: 'letter.updated', live: false, data: { id: 'letter_abc', object: 'letter', status: 'completed' } };

describe('verifyHs256', () => {
  it('returns the payload of a valid token', () => {
    expect(verifyHs256(sign(event), SECRET)).toMatchObject({ id: 'event_1', type: 'letter.updated' });
  });
  it('rejects a wrong secret, a tampered payload, alg "none" and garbage', () => {
    expect(verifyHs256(sign(event, { secret: 'b'.repeat(64) }), SECRET)).toBeNull();
    const [h, , s] = sign(event).split('.');
    expect(verifyHs256(`${h}.${b64url(JSON.stringify({ ...event, type: 'x' }))}.${s}`, SECRET)).toBeNull();
    expect(verifyHs256(sign(event, { header: { alg: 'none', typ: 'JWT' } }), SECRET)).toBeNull();
    expect(verifyHs256('not.a.jwt', SECRET)).toBeNull();
    expect(verifyHs256('', SECRET)).toBeNull();
  });
  it('rejects an expired token', () => {
    expect(verifyHs256(sign({ ...event, exp: Math.floor(Date.now() / 1000) - 60 }), SECRET)).toBeNull();
  });
});

describe('extractToken', () => {
  it('accepts a raw JWT body or a JSON body with the token in a field', () => {
    const t = sign(event);
    expect(extractToken(t)).toBe(t);
    expect(extractToken(`  ${t}\n`)).toBe(t);
    expect(extractToken(JSON.stringify({ payload: t }))).toBe(t);
    expect(extractToken(JSON.stringify({ token: t }))).toBe(t);
    expect(extractToken('{"hello":"world"}')).toBeNull();
  });
});

describe('toLetterEvent', () => {
  it('reads a letter.updated event, directly or wrapped', () => {
    const expected = { eventId: 'event_1', type: 'letter.updated', letterId: 'letter_abc', letterStatus: 'completed' };
    expect(toLetterEvent(event)).toEqual(expected);
    expect(toLetterEvent({ payload: event })).toEqual(expected);
    expect(toLetterEvent({ event })).toEqual(expected);
  });
  it('returns null for anything that is not a letter event', () => {
    expect(toLetterEvent({ type: 'postcard.updated', data: { id: 'postcard_1', object: 'postcard', status: 'completed' } })).toBeNull();
    expect(toLetterEvent({})).toBeNull();
    expect(toLetterEvent(null)).toBeNull();
  });
});

describe('caseStatusForLetter', () => {
  it('moves a sent case to delivered when the letter is completed', () => {
    expect(caseStatusForLetter('sent', 'completed')).toBe('delivered');
  });
  it('leaves the case alone for intermediate statuses', () => {
    for (const s of ['ready', 'printing', 'processed_for_delivery']) expect(caseStatusForLetter('sent', s)).toBeNull();
  });
  it('never moves a case backwards or touches cases that were not sent', () => {
    expect(caseStatusForLetter('delivered', 'completed')).toBeNull();
    expect(caseStatusForLetter('resolved', 'completed')).toBeNull();
    expect(caseStatusForLetter('letter_ready', 'completed')).toBeNull();
  });
});

describe('reminder', () => {
  it('is 30 days after sending', () => {
    expect(reminderDate('2026-11-14T18:43:25.912Z')).toBe('2026-12-14');
    expect(reminderDate(null)).toBeNull();
  });
  it('is due once that day has come, unless the case is resolved', () => {
    const sent = '2026-11-14T10:00:00Z';
    expect(isReminderDue(sent, 'sent', new Date('2026-12-13T23:00:00Z'))).toBe(false);
    expect(isReminderDue(sent, 'delivered', new Date('2026-12-14T08:00:00Z'))).toBe(true);
    expect(isReminderDue(sent, 'resolved', new Date('2027-01-30T00:00:00Z'))).toBe(false);
  });
});
