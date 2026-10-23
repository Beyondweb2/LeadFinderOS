/* DRY RUN — the next Australian WhatsApp sends, computed with the real rules. Reads a JSON export of the live Australian
   leads (read-only SQL); sends nothing, writes nothing. Never staged (scripts/_*.ts).
   Run: npx tsx scripts/_au-dry-run.ts <leads.json> [startIso] */
import fs from 'node:fs';
import { countrySettingsFrom, mobileMarketOf } from '../src/lib/outreachMarkets.ts';
import { auLeadZone } from '../src/lib/auLeadZone.ts';
import { sendWindowForDigits, windowOpenForDigits } from '../src/lib/sendWindow.ts';
import { nextWindowOpenAt, localClock } from '../src/lib/inboxSendWindow.ts';
import { localWeekday } from '../src/lib/outreachMarkets.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';

type L = { id: string; business_name: string; phone: string; country: string | null; address: string | null; coverage_town: string | null;
  search_location: string | null; derived_town: string | null; first_contact: string | null; suppressed: boolean };
const leads = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as L[];
const start = process.argv[3] ? new Date(process.argv[3]) : new Date();
// The AU row exactly as the migration seeds it.
const settings = countrySettingsFrom([{ country: 'AU', whatsapp_on: true, sms_on: false, call_on: false, whatsapp_daily_cap: 100, send_start_min: 540, send_end_min: 1020, timezone: 'Australia/Sydney' }]);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (tz: string, d: Date) => `${WD[localWeekday(tz, d)]} ${d.toLocaleDateString('en-GB', { timeZone: tz, day: 'numeric', month: 'short' })} ${localClock(tz, d)}`;

const pool = leads.map((l) => {
  const digits = toWhatsAppDigits(l.phone, l.country);
  const z = auLeadZone(l);
  return { l, digits, market: mobileMarketOf(digits), z };
});
const mobiles = pool.filter((p) => p.market === 'AU');
const sendable = mobiles.filter((p) => !p.l.first_contact && !p.l.suppressed);
const needsState = sendable.filter((p) => !p.z.tz);
const byZone: Record<string, number> = {};
for (const p of sendable) byZone[p.z.tz ?? 'needs state'] = (byZone[p.z.tz ?? 'needs state'] ?? 0) + 1;
console.log(`Australian leads: ${leads.length} · mobiles: ${mobiles.length} · never contacted, not opted out: ${sendable.length} · needs state: ${needsState.length}`);
console.log('By zone:', byZone);

/* The drip: one send a minute at most (its floor), oldest queued first, a lead only inside its own window, Australia's own cap. */
let at = new Date(Math.ceil(start.getTime() / 60_000) * 60_000);
const queue = sendable.filter((p) => p.z.tz);
const out: string[] = [];
let guard = 0;
while (out.length < 5 && queue.length && guard++ < 20_000) {
  const i = queue.findIndex((p) => windowOpenForDigits(p.digits, at, settings, p.z.tz));
  if (i < 0) {
    // Nothing open now: jump to the earliest opening among the waiting leads.
    at = new Date(Math.min(...queue.map((p) => nextWindowOpenAt(sendWindowForDigits(p.digits, settings, p.z.tz), at).getTime())));
    continue;
  }
  const p = queue.splice(i, 1)[0];
  out.push(`${out.length + 1}. ${p.l.business_name} — ${p.z.state} (${p.z.tz}, from ${p.z.from})\n   their time ${fmt(p.z.tz as string, at)} · Bangkok ${fmt('Asia/Bangkok', at)} · UK ${fmt('Europe/London', at)} · ${at.toISOString()}`);
  at = new Date(at.getTime() + 60_000);
}
console.log(`\nDRY RUN from ${start.toISOString()} (Bangkok ${fmt('Asia/Bangkok', start)}) — the next 5 Australian sends. NOTHING SENT.\n`);
console.log(out.join('\n'));
