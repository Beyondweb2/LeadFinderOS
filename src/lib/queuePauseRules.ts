/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHEN THE WHATSAPP QUEUE PAUSES ITSELF, AND WHEN IT STARTS AGAIN — ONE RULE (2026-11-26, Paul; docs/queue-pause-rules-2026-11-26.md).

   For a week Paul kept getting "outreach has stopped" emails. They were (a) the stuck alert firing whenever Meta's quality reading
   flipped to RED and every queued lead was held, and (b) the old 50%-in-an-hour burst rule pausing the queue on 22 Nov because a
   batch of numbers was not on WhatsApp. Neither was danger to the number. This file is the one place that decides.

   ⛔ EVERY FAILED SEND IS ONE OF:
      • lead       — that one number (not on WhatsApp, blocked us, stopped marketing, per-person limit). The lead is marked and
                     skipped. NEVER counts towards a pause.
      • message    — our template or message values (handled per template: the lead leaves the queue, the template is re-checked).
                     NEVER counts towards a pause.
      • temporary  — timeouts, Meta's rate limits, Meta-side 5xx / "try again". Retried later with a growing wait
                     (temporaryBackoffMinutes). NEVER counts towards a pause.
      • danger     — Meta says something about OUR account: login/token, billing, restricted / blocked, spam-limited. ONE is
                     enough to pause.
      • unexplained — a delivery failure with no code (the held whatsapp-status webhook v129 saves none). One is the lead's
                     problem (one strike). Only a long RUN of them with nothing delivered between pauses: that is WhatsApp
                     refusing the number (23 Nov, unpaid account: 20 of 20 failed).
   ⛔ A quality DROP pauses only when the higher rating had held for a full day first. Meta's reading flips GREEN↔RED several
      times a week (log 18–26 Nov); a flip is not a drop.
   ⛔ AUTO-RESUME only where the cause provably clears: login (Meta answers the health check again), a refusal run, a spam limit,
      a quality drop (after a rest, with a clean health reading taken after the pause). Billing and restrictions wait for a person.
      At most one auto-resume a London day: a second pause the same day waits for a person.
   ⛔ One email per problem per London day (pauseAlert's dedupe key). The stuck alert is a bell only, never an email.
   ⛔ PURE, relative imports only (edge-reachable: process-whatsapp-queue, whatsapp-number-health).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type FailureKind = 'lead' | 'message' | 'temporary' | 'danger' | 'unexplained';
export type DangerKind = 'auth' | 'billing' | 'blocked' | 'spam_limit';
export type PauseKind = DangerKind | 'refused' | 'quality';

/** Meta codes about OUR account (src/lib/sendErrorMeaning.ts holds the words). */
export const DANGER_CODES: Readonly<Record<number, DangerKind>> = {
  0: 'auth', 3: 'auth', 10: 'auth', 190: 'auth', 200: 'auth', 131005: 'auth',
  131042: 'billing',
  33: 'blocked', 368: 'blocked', 130497: 'blocked', 131031: 'blocked', 131045: 'blocked', 131057: 'blocked',
  131063: 'blocked', 131064: 'blocked', 133010: 'blocked',
  131048: 'spam_limit',
};
/** Meta codes that mean "try again later" — never the lead, never a pause. */
export const TEMPORARY_CODES: readonly number[] = [1, 2, 4, 80007, 130429, 131000, 131016, 131056, 133004];
/** Meta codes about that one person / number. */
export const LEAD_CODES: readonly number[] = [131026, 130403, 131049, 131050, 131021, 131047, 130472];
/** Meta codes about our message or template (handled per template). */
export const MESSAGE_CODES: readonly number[] = [100, 131008, 131009, 131037, 131051, 131053, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 132018, 135000];

export interface SendRow { created_at: string; delivery_status: string | null; error_code?: number | null }

const OK_STATES: ReadonlySet<string> = new Set(['delivered', 'read', 'played']);

/** One send → what it says. null = not a failure (delivered, sent and waiting, simulated). */
export function failureKind(r: Pick<SendRow, 'delivery_status' | 'error_code'>): FailureKind | null {
  const s = String(r.delivery_status ?? '');
  if (s !== 'failed' && s !== 'failed_temporary' && s !== 'no_whatsapp') return null;
  const code = typeof r.error_code === 'number' && Number.isFinite(r.error_code) ? r.error_code : null;
  if (code != null) {
    if (DANGER_CODES[code]) return 'danger';
    if (TEMPORARY_CODES.includes(code)) return 'temporary';
    if (LEAD_CODES.includes(code)) return 'lead';
    if (MESSAGE_CODES.includes(code)) return 'message';
  }
  if (s === 'no_whatsapp') return 'lead';
  /* failed_temporary with no code = the send itself never got an answer (network, timeout, a Meta 5xx with no body). */
  if (s === 'failed_temporary') return code == null ? 'temporary' : 'unexplained';
  return 'unexplained';
}

/** Unexplained failures in a row (nothing delivered between) that pause the queue. Normal is ~15–20% failed, so 8 in a row by
 *  chance is about 1 in 400,000; 23 Nov had 20. (The one-strike pass's own protection stays at whatsappPace FAILURE_RUN_PAUSE.) */
export const REFUSAL_RUN_PAUSE = 8;
/** How far back the queue looks for a reason to pause (never before the last pause / resume). */
export const PAUSE_LOOKBACK_HOURS = 6;

export interface PauseVerdict { pause: boolean; kind: PauseKind | null; code: number | null; reason: string | null }
const NO_PAUSE: PauseVerdict = { pause: false, kind: null, code: null, reason: null };

const byTime = (a: SendRow, b: SendRow) => Date.parse(a.created_at) - Date.parse(b.created_at);

/** The unexplained failures at the end of the list, oldest first; lead / message / temporary failures and sends still waiting
 *  neither break nor extend the run; a delivery ends it. */
export function refusalRun(rows: readonly SendRow[]): number {
  const s = [...rows].filter((r) => Number.isFinite(Date.parse(r.created_at))).sort(byTime);
  let n = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const st = String(s[i].delivery_status ?? '');
    if (OK_STATES.has(st)) break;
    if (failureKind(s[i]) === 'unexplained') n++;
  }
  return n;
}

/** Should the queue pause itself? `rows` = the queue's own real sends since max(lookback, last pause/resume). */
export function queuePauseVerdict(rows: readonly SendRow[], meaning: (code: number) => string | null = () => null): PauseVerdict {
  const newestDanger = [...rows].sort(byTime).reverse().find((r) => failureKind(r) === 'danger');
  if (newestDanger && typeof newestDanger.error_code === 'number') {
    const code = newestDanger.error_code;
    const kind = DANGER_CODES[code];
    const said = meaning(code);
    return { pause: true, kind, code, reason: `${DANGER_WHY[kind]}${said ? ` Meta said: "${said}"` : ''} (Meta code ${code}).` };
  }
  const run = refusalRun(rows);
  if (run >= REFUSAL_RUN_PAUSE) {
    return { pause: true, kind: 'refused', code: null,
      reason: `The last ${run} queue messages all failed with nothing delivered in between, so WhatsApp is refusing the number's cold messages.` };
  }
  return NO_PAUSE;
}

const DANGER_WHY: Readonly<Record<DangerKind, string>> = {
  auth: "WhatsApp refused our login: the access token has expired or lost a permission.",
  billing: 'Meta says there is a billing or payment problem on the WhatsApp account.',
  blocked: 'Meta has restricted the WhatsApp account or number.',
  spam_limit: 'Meta has limited the number because people blocked or reported our messages.',
};

/** The one thing to do, per problem. */
export const PAUSE_TODO: Readonly<Record<PauseKind, string>> = {
  auth: 'Renew the WhatsApp access token (Meta Business settings → System users) and save it as the WHATSAPP_ACCESS_TOKEN secret.',
  billing: 'Fix the payment method in WhatsApp Manager → Billing, then press Resume on the WhatsApp queue.',
  blocked: "Open WhatsApp Manager, read Meta's notice and do what it asks, then press Resume on the WhatsApp queue.",
  spam_limit: 'Nothing right now. If it pauses again, check WhatsApp Manager for which messages are being blocked or reported.',
  refused: 'Check WhatsApp Manager for a payment problem or a notice on the number.',
  quality: 'Nothing right now. If it keeps happening, check WhatsApp Manager for which messages are being blocked or reported.',
};

/** How long after the pause it may start again by itself; null = a person resumes it. */
export const AUTO_RESUME_AFTER_MIN: Readonly<Record<PauseKind, number | null>> = {
  auth: 15, billing: null, blocked: null, spam_limit: 24 * 60, refused: 120, quality: 24 * 60,
};

const londonDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const londonHhmm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** When it may resume by itself, decided at pause time. null = a person resumes it (billing / restriction, or it already resumed
 *  itself once today). */
export function autoResumeAt(kind: PauseKind, pausedAt: Date, autoResumedToday: boolean): Date | null {
  const after = AUTO_RESUME_AFTER_MIN[kind];
  if (after == null || autoResumedToday) return null;
  return new Date(pausedAt.getTime() + after * 60_000);
}

export interface ResumeFacts {
  /** whatsapp_outreach_state */
  paused: boolean;
  pauseSource: string | null;
  kind: string | null;
  pausedAt: string | null;
  resumeAt: string | null;
  healthOkAt: string | null;
  numberLimited: boolean;
  coldStopAt: string | null;
}

/** Start again by itself now? Only an auto-pause with a resume time that has passed, and only with a clean health reading taken
 *  AFTER the pause (for a login problem that reading is the proof the token works again). Absent anything = no. */
export function autoResumeVerdict(f: ResumeFacts, now: Date = new Date()): { resume: boolean; why: string | null } {
  const no = { resume: false, why: null };
  if (f.paused !== true || f.pauseSource !== 'auto') return no;
  if (!f.kind || !(f.kind in AUTO_RESUME_AFTER_MIN) || AUTO_RESUME_AFTER_MIN[f.kind as PauseKind] == null) return no;
  const at = f.resumeAt ? Date.parse(f.resumeAt) : NaN;
  const pausedAt = f.pausedAt ? Date.parse(f.pausedAt) : NaN;
  const okAt = f.healthOkAt ? Date.parse(f.healthOkAt) : NaN;
  if (!Number.isFinite(at) || !Number.isFinite(pausedAt) || now.getTime() < at) return no;
  if (!Number.isFinite(okAt) || okAt <= pausedAt) return no;
  if (f.numberLimited || f.coldStopAt) return no;
  return { resume: true, why: `The cause has cleared (${f.kind}): Meta's reading of the number is clean again.` };
}

/** A quality drop that is real: the rating went DOWN (GREEN→YELLOW/RED, YELLOW→RED) and the higher rating had held for at least
 *  QUALITY_STABLE_HOURS before it. `prevChangeAt` = when the rating last changed before this drop (null = longer than we know). */
export const QUALITY_STABLE_HOURS = 24;
const RATING_RANK: Readonly<Record<string, number>> = { GREEN: 3, YELLOW: 2, RED: 1 };
export function qualityDropPause(from: string | null, to: string | null, prevChangeAt: string | null, now: Date = new Date()): PauseVerdict {
  const a = RATING_RANK[String(from ?? '').toUpperCase()];
  const b = RATING_RANK[String(to ?? '').toUpperCase()];
  if (!a || !b || b >= a) return NO_PAUSE;
  const since = prevChangeAt ? Date.parse(prevChangeAt) : NaN;
  if (Number.isFinite(since) && now.getTime() - since < QUALITY_STABLE_HOURS * 3_600_000) return NO_PAUSE;
  return { pause: true, kind: 'quality', code: null,
    reason: `Meta lowered the number's quality rating from ${String(from).toUpperCase()} to ${String(to).toUpperCase()} (it had been ${String(from).toUpperCase()} for over a day).` };
}

/** The bell + email for a pause: plain English, why + the one thing to do + whether it starts again by itself. One per problem
 *  per London day. */
export function pauseAlert(v: { kind: PauseKind; reason: string }, resumeAt: Date | null, now: Date = new Date()) {
  const again = resumeAt
    ? `It will start again by itself at ${londonHhmm(resumeAt)} if Meta's reading of the number is clean by then. If it pauses again today, it waits for you.`
    : 'It stays paused until someone presses Resume on the WhatsApp queue.';
  const short: Record<PauseKind, string> = {
    auth: 'WhatsApp login expired', billing: 'WhatsApp billing problem', blocked: 'Meta restricted the WhatsApp account',
    spam_limit: 'Meta limited the number', refused: 'WhatsApp is refusing cold messages', quality: 'quality rating dropped',
  };
  return {
    title: `WhatsApp sending paused: ${short[v.kind]}`,
    body: `${v.reason} ${PAUSE_TODO[v.kind]}`,
    subject: `WhatsApp sending paused: ${short[v.kind]}`,
    lines: [
      `Why: ${v.reason}`,
      `What to do: ${PAUSE_TODO[v.kind]}`,
      again,
      '',
      'Leads whose number is not on WhatsApp, and one-off or temporary errors, never pause sending: those leads are marked and skipped.',
    ],
    dedupeKey: `queue-auto-pause:${v.kind}:${londonDay(now)}`,
  };
}

/** Minutes the queue waits after a temporary error, by how many came in a row (1 → 5, 2 → 10, 3 → 20, 4 → 40, then 60). */
export function temporaryBackoffMinutes(inARow: number): number {
  const n = Math.max(1, Math.floor(Number(inARow) || 1));
  return Math.min(60, 5 * 2 ** (n - 1));
}

/** Temporary failures at the end of the queue's newest sends (newest first or any order). */
export function temporaryInARow(rows: readonly SendRow[]): number {
  const s = [...rows].sort(byTime);
  let n = 0;
  for (let i = s.length - 1; i >= 0 && failureKind(s[i]) === 'temporary'; i--) n++;
  return n;
}

/** The stuck alert's bell key: one per sender per London day (it is a bell only, never an email). */
export function stuckBellKey(senderKey: string, now: Date = new Date()): string {
  return `queue_stuck:${senderKey}:${londonDay(now)}`;
}

/** London midnight of the day containing `d`, as an ISO instant (DST-correct). */
export function londonDayStartIso(d: Date = new Date()): string {
  const [y, m, da] = londonDay(d).split('-').map(Number);
  const offsetAt = (ms: number) => {
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ms))) parts[p.type] = p.value;
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - ms;
  };
  const guess = Date.UTC(y, m - 1, da, 0, 0);
  return new Date(guess - offsetAt(guess)).toISOString();
}

/** What the queue screen and the pause log show (whatsapp_outreach_state.auto_pause_reason): why, the one thing to do, and
 *  whether it starts again by itself. */
export function pauseNote(kind: PauseKind, reason: string, resumeAt: Date | null): string {
  const again = resumeAt ? `It starts again by itself at ${londonHhmm(resumeAt)} if Meta's reading of the number is clean by then.` : 'Press Resume when it is fixed.';
  return `${reason} What to do: ${PAUSE_TODO[kind]} ${again}`;
}
