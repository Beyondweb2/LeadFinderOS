/* gone_cold — Paul, 2026-11-21. WhatsApp template, English, Marketing, NO VARIABLES. Meta template id 2575430126271853
   (business 1693100295675184 — Paul confirmed it is the Move37 account V1 sends from). Submitted to Meta the same day.
   A nudge to a lead we have already messaged who has not replied:
     "Hey, did you get my last message?\n\nNot sure it sent properly"

   ⛔ ONLY WHEN META SAYS APPROVED. Two halves, both fail closed:
      · GONE_COLD_APPROVED (below) — the switch every picker reads. While false, every picker shows "Waiting for Meta
        approval" and refuses it BEFORE any other rule (getTemplateSendability). Flip it to true once Meta approves.
      · both senders read Meta's LIVE status (_shared/template-status.ts) and send only on APPROVED — an unreadable
        status (UNKNOWN) refuses too, unlike the older follow-ups that "try and let Meta decide".
   ⛔ ONLY FOR A LEAD WE MESSAGED WHO HAS NOT REPLIED, outside the 24-hour window (goneColdRefusal): we have a delivered
      WhatsApp message to the number, nothing came back after our last one, no inbound in the last 24 hours, and our last
      message was not already gone_cold.
   ⛔ OPT-OUT AND DO NOT CONTACT ALWAYS BLOCK: an opt-out, any suppression row (Do Not Contact) or a stopped lead status.
   ⛔ MANUAL ONLY: one person, one lead, one press. Never queued, never in a bulk send, never automatic
      (MANUAL_ONLY_TEMPLATES — the Inbox bulk planner, the Outreach queue dialog and process-whatsapp-queue all refuse it). */

export const GONE_COLD_TEMPLATE = 'gone_cold';

/** ⛔ The switch. Paul, 2026-11-21: ON — treated as approved. The sender no longer pre-checks Meta's live status for
 *  gone_cold; if Meta rejects a send, the normal send error shows. Opt-out / DNC / thread rules and manual-only are unchanged. */
export const GONE_COLD_APPROVED = true;

export const GONE_COLD_WAITING_REASON = 'Waiting for Meta approval';

/** The registered body, byte for byte as submitted to Meta (2026-11-21). No variables. */
export function goneColdBody(): string {
  return `Hey, did you get my last message?

Not sure it sent properly`;
}

/** Templates a person sends one lead at a time: never queued, never bulk, never automatic. */
export const MANUAL_ONLY_TEMPLATES: ReadonlySet<string> = new Set([GONE_COLD_TEMPLATE]);
export const MANUAL_ONLY_REASON = 'Send this one by hand from the lead’s conversation — it is never queued or sent in bulk.';

export const WINDOW_MS_24H = 24 * 60 * 60 * 1000;

/** Statuses that mean "stop contacting" (the same positive list the Inbox's queued sends use). */
export const GONE_COLD_STOP_STATUSES: ReadonlySet<string> = new Set(['not_interested', 'wrong_number', 'opted_out', 'do_not_contact']);

export interface GoneColdMessage {
  direction: 'inbound' | 'outbound';
  created_at: string;
  status?: string | null;
  template_name?: string | null;
}

export interface GoneColdFacts {
  /** Meta's status as the caller knows it. The browser passes the switch; the server passes Meta's live answer. */
  approved: boolean;
  /** true = opted out; null = could not be read (refuses). */
  optedOut: boolean | null;
  /** true = on the Do Not Contact / suppression list or a stopped lead status; null = could not be read (refuses). */
  doNotContact: boolean | null;
  /** The number's WhatsApp messages (any order); null = could not be read (refuses). */
  thread: readonly GoneColdMessage[] | null;
  now: number;
}

const FAILED = new Set(['failed', 'failed_temporary', 'simulated']);

/** Why gone_cold may NOT go to this lead now, or null when it may. Order: approval, opt-out, DNC, then the thread. */
export function goneColdRefusal(f: GoneColdFacts): { code: string; reason: string } | null {
  if (!f.approved) return { code: 'template_waiting_meta', reason: GONE_COLD_WAITING_REASON + ' — nothing was sent.' };
  if (f.optedOut !== false) return { code: 'opted_out', reason: f.optedOut === null ? 'Could not check opt-outs — nothing was sent.' : 'They opted out — no marketing messages go to them.' };
  if (f.doNotContact !== false) return { code: 'do_not_contact', reason: f.doNotContact === null ? 'Could not check the Do Not Contact list — nothing was sent.' : 'This lead is on Do Not Contact — nothing was sent.' };
  if (!f.thread) return { code: 'contact_guard_unreadable', reason: 'Could not read this number’s WhatsApp history — nothing was sent.' };
  const ok = f.thread.filter((m) => !(m.direction === 'outbound' && FAILED.has(String(m.status ?? '').toLowerCase())));
  const ts = (m: GoneColdMessage) => Date.parse(m.created_at) || 0;
  const outs = ok.filter((m) => m.direction === 'outbound').sort((a, b) => ts(b) - ts(a));
  if (!outs.length) return { code: 'gone_cold_never_messaged', reason: 'Only for a lead we have already messaged on WhatsApp — nothing was sent.' };
  const lastOut = outs[0];
  const ins = ok.filter((m) => m.direction === 'inbound');
  if (ins.some((m) => ts(m) >= ts(lastOut))) return { code: 'gone_cold_they_replied', reason: 'They replied after your last message — reply to them instead.' };
  if (ins.some((m) => f.now - ts(m) < WINDOW_MS_24H)) return { code: 'gone_cold_window_open', reason: 'Their 24-hour window is open — type a normal reply instead.' };
  if (String(lastOut.template_name ?? '') === GONE_COLD_TEMPLATE) return { code: 'gone_cold_already_sent', reason: 'Your last message was already this nudge — nothing was sent.' };
  return null;
}
