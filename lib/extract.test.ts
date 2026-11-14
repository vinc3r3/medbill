// Validation + retry behaviour of extractDoc, with a fake model (no network).
import { describe, expect, it, vi } from 'vitest';
import { ExtractError, extractDoc, type CallModel } from './extract';

const goodBill = {
  provider: 'Test Clinic',
  serviceDate: '2026-03-04',
  lines: [{ date: '2026-03-04', code: '99213', description: 'Office visit', billed: 40 }],
  amountDue: 40,
};

describe('extractDoc', () => {
  it('returns validated output on the first try', async () => {
    const call = vi.fn<CallModel>().mockResolvedValue(goodBill);
    await expect(extractDoc('bill', 'text', call)).resolves.toEqual(goodBill);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('rounds money to cents before validating', async () => {
    const call = vi.fn<CallModel>().mockResolvedValue({ ...goodBill, amountDue: 40.0000001 });
    await expect(extractDoc('bill', 'text', call)).resolves.toMatchObject({ amountDue: 40 });
  });

  it('retries once when the reply is not usable JSON, then succeeds', async () => {
    const call = vi.fn<CallModel>().mockResolvedValueOnce(null).mockResolvedValueOnce(goodBill);
    await expect(extractDoc('bill', 'text', call)).resolves.toEqual(goodBill);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('retries once when the JSON does not match the types', async () => {
    const call = vi.fn<CallModel>().mockResolvedValueOnce({ ...goodBill, serviceDate: '03/04/2026' }).mockResolvedValueOnce(goodBill);
    await expect(extractDoc('bill', 'text', call)).resolves.toEqual(goodBill);
  });

  it('gives a readable error after the retry also fails', async () => {
    const call = vi.fn<CallModel>().mockResolvedValue({ ...goodBill, serviceDate: 'March 4' });
    const err = await extractDoc('bill', 'text', call).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err.message).toMatch(/couldn't read the details of your bill/);
    expect(err.message).toMatch(/serviceDate/);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
