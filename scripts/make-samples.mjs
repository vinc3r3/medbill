// Generates the synthetic sample cases in /samples/{a,b,c}: {key}-bill.png, {key}-eob.png, expected.json,
// plus samples/profile.json. All people, addresses, IDs and organisations are invented.
//
// Usage: npm run samples   (needs Google Chrome installed; set CHROME=/path/to/chrome to override)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---- Synthetic patient (also the redaction test profile) -------------------------------------
const profile = {
  name: 'Jordan A. Rivera',
  dateOfBirth: '03/17/1984',
  memberId: 'XKH448210937',
  address: '1427 Maple Grove Ln, Fairhaven, OH 45099',
};
const accountNumbers = { a: '004417-2291', b: 'RB-88120456', c: 'SUC-3307718' };

// ---- Case data ------------------------------------------------------------------------------
// BillLine.billed = the patient's share for that line (spec). EOB lines: allowed = planPaid + PR.
const cases = {
  a: {
    provider: { name: 'Lakeside Family Medicine', address: '88 Harbor View Dr, Suite 200, Fairhaven, OH 45098', phone: '(555) 014-2200' },
    insurer: 'Cedarline Health Plan',
    claimId: 'CLM-260304-1187',
    statementDate: '2026-04-02',
    lines: [
      { date: '2026-03-04', code: '99213', description: 'Office visit, established patient', eob: [185.0, 112.4, 72.4, 40.0], billed: 40.0 },
      { date: '2026-03-04', code: '85025', description: 'Complete blood count (CBC)', eob: [48.0, 22.5, 10.0, 12.5], billed: 12.5 },
    ],
    extraBillLines: [],
    flags: [],
    savedAmount: 0,
  },
  b: {
    provider: { name: 'Riverbend Medical Group', address: '310 Mill Race Rd, Fairhaven, OH 45098', phone: '(555) 014-7730' },
    insurer: 'Cedarline Health Plan',
    claimId: 'CLM-260512-4402',
    statementDate: '2026-06-09',
    lines: [
      { date: '2026-05-12', code: '99214', description: 'Office visit, established patient, moderate', eob: [240.0, 145.0, 90.0, 55.0], billed: 55.0 },
      { date: '2026-05-12', code: '80053', description: 'Comprehensive metabolic panel', eob: [95.0, 38.75, 10.0, 28.75], billed: 28.75 },
      { date: '2026-05-12', code: '36415', description: 'Routine venipuncture (blood draw)', eob: [25.0, 9.0, 3.0, 6.0], billed: 6.0 },
    ],
    // The same lab test billed a second time; inserted after the original (bill index 2).
    extraBillLines: [{ at: 2, date: '2026-05-12', code: '80053', description: 'Comprehensive metabolic panel', billed: 28.75 }],
    flags: [
      {
        kind: 'duplicate', billLineIdx: 2, eobLineIdx: 1, expected: 0, billed: 28.75, difference: 28.75,
        explanation:
          'The bill lists "Comprehensive metabolic panel" on 2026-05-12 twice, at $28.75 each, but the EOB shows it once. Was this test done twice, or is the second line a duplicate?',
      },
    ],
    savedAmount: 28.75,
  },
  c: {
    provider: { name: 'Summit Urgent Care', address: '4500 Ridgeline Pkwy, Fairhaven, OH 45097', phone: '(555) 014-9180' },
    insurer: 'Cedarline Health Plan',
    claimId: 'CLM-260721-0956',
    statementDate: '2026-08-18',
    // Bill amounts are higher than the EOB's patient responsibility; every line still matches.
    lines: [
      { date: '2026-07-21', code: '99204', description: 'Office visit, new patient, moderate', eob: [410.0, 230.0, 195.0, 35.0], billed: 285.0 },
      { date: '2026-07-21', code: '73610', description: 'X-ray, ankle, 3 views', eob: [165.0, 90.0, 80.0, 10.0], billed: 127.0 },
    ],
    extraBillLines: [],
    flags: [
      {
        kind: 'over_patient_responsibility', billLineIdx: null, eobLineIdx: null, expected: 45, billed: 412, difference: 367,
        explanation:
          'The bill asks for $412.00, but the EOB says your share for this visit is $45.00. Could the provider check whether the insurance payment and adjustments were applied?',
      },
    ],
    savedAmount: 367,
  },
};

// ---- Helpers --------------------------------------------------------------------------------
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (xs) => round2(xs.reduce((a, b) => a + b, 0));
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const us = (iso) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function buildDocs(c) {
  const billLines = c.lines.map(({ date, code, description, billed }) => ({ date, code, description, billed }));
  for (const { at, ...line } of c.extraBillLines) billLines.splice(at, 0, line);
  const bill = { provider: c.provider.name, serviceDate: c.lines[0].date, lines: billLines, amountDue: sum(billLines.map((l) => l.billed)) };
  const eobLines = c.lines.map(({ date, code, description, eob: [billed, allowed, planPaid, pr] }) => {
    if (round2(planPaid + pr) !== allowed) throw new Error(`EOB arithmetic off for ${code}`);
    return { date, code, description, billed, allowed, planPaid, patientResponsibility: pr };
  });
  const eob = { insurer: c.insurer, claimId: c.claimId, lines: eobLines, totalPatientResponsibility: sum(eobLines.map((l) => l.patientResponsibility)) };
  return { bill, eob };
}

const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 850px; height: 1100px; background: #fff; color: #111; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.4; padding: 56px 60px; }
  h1 { font-size: 26px; } h2 { font-size: 18px; margin: 28px 0 8px; }
  .muted { color: #444; } .row { display: flex; justify-content: space-between; gap: 24px; }
  .box { border: 1.5px solid #222; padding: 12px 14px; margin-top: 22px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #999; vertical-align: top; }
  th { border-bottom: 2px solid #222; font-size: 13px; text-transform: uppercase; letter-spacing: .03em; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .total td { font-weight: bold; border-top: 2px solid #222; border-bottom: none; }
  .big { font-size: 22px; font-weight: bold; }
  .banner { background: #eee; border: 1.5px solid #222; padding: 8px 12px; font-weight: bold; text-align: center; margin-top: 18px; }
`;

function billHtml(key, c, bill) {
  const rows = bill.lines
    .map((l) => `<tr><td>${us(l.date)}</td><td>${l.code ?? ''}</td><td>${esc(l.description)}</td><td class="n">${usd(l.billed)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>
  <div class="row"><div><h1>${esc(c.provider.name)}</h1><div class="muted">${esc(c.provider.address)}<br>Billing questions: ${c.provider.phone}</div></div>
  <div style="text-align:right"><div class="big">PATIENT STATEMENT</div><div>Statement date: ${us(c.statementDate)}</div><div>Account #: ${accountNumbers[key]}</div></div></div>
  <div class="box row"><div><b>Patient</b><br>${esc(profile.name)}<br>${esc(profile.address)}<br>DOB: ${profile.dateOfBirth}</div>
  <div><b>Insurance</b><br>${esc(c.insurer)}<br>Member ID: ${profile.memberId}</div></div>
  <h2>Services</h2>
  <table><thead><tr><th>Date</th><th>Code</th><th>Description</th><th class="n">Patient amount</th></tr></thead>
  <tbody>${rows}<tr class="total"><td colspan="3">Amount due</td><td class="n">${usd(bill.amountDue)}</td></tr></tbody></table>
  <p style="margin-top:18px">Amounts shown are after insurance. Please pay the amount due within 30 days.</p>
  <div class="box"><span class="big">Amount due: ${usd(bill.amountDue)}</span></div>
  </body></html>`;
}

function eobHtml(c, eob) {
  const rows = eob.lines
    .map((l) => `<tr><td>${us(l.date)}</td><td>${l.code ?? ''}</td><td>${esc(l.description)}</td><td class="n">${usd(l.billed)}</td><td class="n">${usd(l.allowed)}</td><td class="n">${usd(l.planPaid)}</td><td class="n">${usd(l.patientResponsibility)}</td></tr>`)
    .join('');
  const t = (f) => usd(sum(eob.lines.map(f)));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>
  <div class="row"><div><h1>${esc(c.insurer)}</h1><div class="muted">Explanation of Benefits</div></div>
  <div style="text-align:right">Claim ID: ${c.claimId}<br>Processed: ${us(c.statementDate)}</div></div>
  <div class="banner">THIS IS NOT A BILL</div>
  <div class="box row"><div><b>Member</b><br>${esc(profile.name)}<br>${esc(profile.address)}</div>
  <div><b>Member ID: ${profile.memberId}</b><br>Provider: ${esc(c.provider.name)}<br>Patient: ${esc(profile.name)}</div></div>
  <h2>Claim details</h2>
  <table><thead><tr><th>Date</th><th>Code</th><th>Service</th><th class="n">Billed</th><th class="n">Allowed</th><th class="n">Plan paid</th><th class="n">You owe</th></tr></thead>
  <tbody>${rows}<tr class="total"><td colspan="3">Totals</td><td class="n">${t((l) => l.billed)}</td><td class="n">${t((l) => l.allowed)}</td><td class="n">${t((l) => l.planPaid)}</td><td class="n">${t((l) => l.patientResponsibility)}</td></tr></tbody></table>
  <div class="box"><span class="big">Your total responsibility: ${usd(eob.totalPatientResponsibility)}</span></div>
  <p style="margin-top:18px" class="muted">Your provider may bill you up to the amount you owe shown above. Keep this statement for your records.</p>
  </body></html>`;
}

function render(htmlPath, pngPath) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=850,1100', `--screenshot=${pngPath}`, `file://${htmlPath}`,
  ], { stdio: 'ignore' });
}

// ---- Main -----------------------------------------------------------------------------------
const tmp = join(ROOT, '.html');
mkdirSync(tmp, { recursive: true });
writeFileSync(join(ROOT, 'profile.json'), JSON.stringify(profile, null, 2) + '\n');

for (const [key, c] of Object.entries(cases)) {
  const dir = join(ROOT, key);
  mkdirSync(dir, { recursive: true });
  const { bill, eob } = buildDocs(c);
  writeFileSync(join(dir, 'expected.json'), JSON.stringify({ bill, eob, flags: c.flags, savedAmount: c.savedAmount }, null, 2) + '\n');
  for (const [name, html] of [['bill', billHtml(key, c, bill)], ['eob', eobHtml(c, eob)]]) {
    const htmlPath = join(tmp, `${key}-${name}.html`);
    writeFileSync(htmlPath, html);
    render(htmlPath, join(dir, `${key}-${name}.png`));
  }
  console.log(`case ${key}: amountDue ${usd(bill.amountDue)}, EOB total ${usd(eob.totalPatientResponsibility)}, ${c.flags.length} flag(s)`);
}
rmSync(tmp, { recursive: true, force: true });
