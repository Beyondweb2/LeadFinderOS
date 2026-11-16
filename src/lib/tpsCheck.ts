/* ══ TPS / CTPS SCREENING BEFORE A CALL (built 2026-11-16, v1-tps-templates-callable; postponed 2026-10-05) ══
   docs/tps-screening.md. Provider: tpsmydata (pay as you go). SWITCHED OFF until Paul adds BOTH edge secrets
   TPSMYDATA_API_KEY and TPSMYDATA_API_URL (supabase/functions/_shared/tps-screen.ts reads them; no secret = off,
   calls work exactly as before and nothing is checked or charged).
   Once on, twilio-voice-token asks tpsCallDecision before a UK call:
     · a current (≤ TPS_RECHECK_DAYS) answer for BOTH registers is reused — a number is never checked twice in 28 days
       (cached per NUMBER in public.phone_tps_checks, whichever lead it belongs to);
     · otherwise tpsmydata is asked once, the answer stored, then decided;
     · on the TPS or CTPS → refused "TPS – do not call" (tps_registered), like Do Not Contact;
     · the check failed or the answer was not one we can read → refused (tps_unchecked) — never "assume clear".
   It is still NOT part of Ready to Sell. Irish / Malaysian / Singapore numbers are not on the UK registers: not checked.
   The rules below hold:
   ⛔ NOTHING CAN SAY "CLEAR" WITHOUT A GENUINE ANSWER — a connected provider's "not registered" on BOTH
      registers, with the provider's reference, within TPS_RECHECK_DAYS. Anything else reads not screened.
   ⛔ BOTH REGISTERS, ALWAYS — LeadFinderOS often does not know a business's legal form. */

/** A new TPS/CTPS registration takes effect 28 days after it is made, so screening at least every 28 days
 *  is the standard practice. Paul may shorten it; never lengthen it without advice. */
export const TPS_RECHECK_DAYS = 28;

export const TPS_REGISTERS = ['tps', 'ctps'] as const;
export type TpsRegister = typeof TPS_REGISTERS[number];
export const TPS_REGISTER_NAMES: Record<TpsRegister, string> = { tps: 'TPS', ctps: 'CTPS' };

export const TPS_RESULTS = ['registered', 'not_registered'] as const;
export type TpsResult = typeof TPS_RESULTS[number];

export interface TpsProviderInfo {
  /** Stored on every row as `provider`. */
  id: string;
  name: string;
  /** The registers this provider screens against. */
  registers: readonly TpsRegister[];
}

/** The providers whose answers count. Adding one here is the ONLY way a number can ever read as clear. Its answers
 *  exist only once its secrets are set (_shared/tps-screen.ts) — until then no row carries this provider. */
export const TPSMYDATA: TpsProviderInfo = { id: 'tpsmydata', name: 'tpsmydata', registers: ['tps', 'ctps'] };
export const TPS_PROVIDERS: readonly TpsProviderInfo[] = [TPSMYDATA];

/** Indicative price (tpsmydata pay-as-you-go, about £5 per 1,000 checks, NOT yet confirmed by a billed check — Paul
 *  confirms at sign-up). Shown in docs/tps-screening.md only; nothing charges or decides from it. */
export const TPS_INDICATIVE_PENCE_PER_CHECK = 0.5;

/* ── tpsmydata's answer → one answer per register (pure; the fetch is in _shared/tps-screen.ts) ──────────────────────
   ⛔ STRICT: tpsmydata's response format was not published when this was written. Only an explicit yes/no per register
   is accepted (field tps / on_tps / tps_registered / is_tps, and the same for ctps; boolean, 1/0, yes/no, true/false,
   registered / not registered), at the top level, under data, or in the first item of results / numbers / data. Anything
   else is an error — never stored, and the call is refused as "could not check". The first real answer must be read
   by a session (admin probe: twilio-voice-token { tps_probe: "<number>" }) before reps rely on it. */
const TPS_KEYS: Record<TpsRegister, string[]> = {
  tps: ['tps', 'on_tps', 'tps_registered', 'is_tps', 'tps_status'],
  ctps: ['ctps', 'on_ctps', 'ctps_registered', 'is_ctps', 'ctps_status'],
};
const REF_KEYS = ['reference', 'ref', 'id', 'request_id', 'check_id', 'transaction_id'];

function yesNo(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['yes', 'y', 'true', '1', 'registered', 'on', 'listed', 'found'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'not registered', 'unregistered', 'off', 'not listed', 'not found', 'clear', 'clean'].includes(s)) return false;
  return null;
}

/** The object holding the per-register fields, or null. */
function answerObject(body: unknown): Record<string, unknown> | null {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const has = (o: Record<string, unknown>) => TPS_KEYS.tps.some((k) => k in o) || TPS_KEYS.ctps.some((k) => k in o);
  if (!isObj(body)) return Array.isArray(body) && isObj(body[0]) && has(body[0]) ? body[0] : null;
  if (has(body)) return body;
  for (const k of ['data', 'result', 'results', 'numbers']) {
    const v = body[k];
    if (isObj(v) && has(v)) return v;
    if (Array.isArray(v) && isObj(v[0]) && has(v[0])) return v[0];
  }
  return null;
}

/** tpsmydata's JSON → one answer per register (both, or an error). fallbackRef is used only when the body carries no
 *  reference of its own (e.g. "tpsmydata <Date header>"), so a stored row always says which response it came from. */
export function tpsMyDataAnswers(body: unknown, fallbackRef: string): TpsProviderAnswer[] {
  const o = answerObject(body);
  if (!o) return [{ ok: false, error: 'unreadable_answer' }];
  const refRaw = REF_KEYS.map((k) => o[k] ?? (body as Record<string, unknown> | null)?.[k]).find((v) => typeof v === 'string' || typeof v === 'number');
  const reference = String(refRaw ?? fallbackRef ?? '').trim();
  const out: TpsProviderAnswer[] = [];
  for (const g of TPS_REGISTERS) {
    const raw = TPS_KEYS[g].map((k) => o[k]).find((v) => v !== undefined);
    const yes = yesNo(raw);
    if (yes === null) return [{ ok: false, error: `no_${g}_answer` }];
    out.push({ ok: true, register: g, result: yes ? 'registered' : 'not_registered', reference });
  }
  return out;
}

/* ── The call decision (twilio-voice-token) ─────────────────────────────────────────────────────────────────── */
export type TpsCallDecision = 'block' | 'clear' | 'need_check';
/** From the stored rows for ONE number: on a register (current) → block; both registers current and clear → clear;
 *  anything else (none, one register, older than TPS_RECHECK_DAYS) → need_check. */
export function tpsCallDecision(rows: readonly Partial<TpsCheckRow>[] | null | undefined, now: Date = new Date(), providers: readonly TpsProviderInfo[] = TPS_PROVIDERS): TpsCallDecision {
  const current = genuineTpsRows(rows, now, providers).filter((r) => now.getTime() - Date.parse(r.checked_at) <= TPS_RECHECK_DAYS * 86_400_000);
  const latest = new Map<TpsRegister, TpsCheckRow>();
  for (const r of current) { const c = latest.get(r.register); if (!c || Date.parse(r.checked_at) > Date.parse(c.checked_at)) latest.set(r.register, r); }
  if ([...latest.values()].some((r) => r.result === 'registered')) return 'block';
  return TPS_REGISTERS.every((g) => latest.has(g)) ? 'clear' : 'need_check';
}

/** Is this E.164 digits string (no "+") on the UK registers' patch? Only UK numbers are screened. */
export const tpsScreenable = (digits: string | null | undefined) => /^44\d{9,10}$/.test(String(digits ?? '').replace(/\D/g, ''));

/** One stored answer (public.phone_tps_checks). Written only by the service role. */
export interface TpsCheckRow {
  lead_id: string | null;
  phone: string;
  register: TpsRegister;
  result: TpsResult;
  provider: string;
  provider_reference: string;
  checked_at: string;
}

/* ── The provider boundary ─────────────────────────────────────────────────────────────────────────── */

/** What a provider adapter returns for one number on one register. Anything that is not an explicit
 *  registered / not-registered answer with a reference is an error, and errors are never stored. */
export type TpsProviderAnswer =
  | { ok: true; register: TpsRegister; result: TpsResult; reference: string }
  | { ok: false; error: string };

export interface TpsProviderAdapter {
  info: TpsProviderInfo;
  check(phoneE164: string, register: TpsRegister): Promise<TpsProviderAnswer>;
}

export function providerById(id: string | null | undefined, providers: readonly TpsProviderInfo[] = TPS_PROVIDERS): TpsProviderInfo | null {
  return providers.find((p) => p.id === id) ?? null;
}

/** The ONE way to turn a provider's answer into a row to store. Null means "store nothing": an error, an
 *  unknown provider, a register it does not screen, a result that is not one of the two, or a blank
 *  reference. */
export function tpsRowFromAnswer(
  answer: TpsProviderAnswer | null | undefined,
  ctx: { providerId: string; leadId: string | null; phone: string; checkedAt: string },
  providers: readonly TpsProviderInfo[] = TPS_PROVIDERS,
): TpsCheckRow | null {
  if (!answer || answer.ok !== true) return null;
  const p = providerById(ctx.providerId, providers);
  if (!p || !p.registers.includes(answer.register)) return null;
  if (!(TPS_RESULTS as readonly string[]).includes(answer.result)) return null;
  const ref = String(answer.reference ?? '').trim();
  if (!ref || !String(ctx.phone ?? '').trim()) return null;
  return { lead_id: ctx.leadId, phone: ctx.phone, register: answer.register, result: answer.result, provider: p.id, provider_reference: ref, checked_at: ctx.checkedAt };
}

/* ── The verdict shown before a call ───────────────────────────────────────────────────────────────── */

export type TpsState = 'no_service' | 'not_checked' | 'partial' | 'expired' | 'registered' | 'clear';

export interface TpsVerdict {
  state: TpsState;
  label: string;
  detail: string;
  /** True ONLY for a genuine, current, both-register "not registered". */
  screenedClear: boolean;
}

const DAY_MS = 86_400_000;

/** Rows that came from a connected provider, with a reference, a real result and a time not in the future. */
export function genuineTpsRows(rows: readonly Partial<TpsCheckRow>[] | null | undefined, now: Date, providers: readonly TpsProviderInfo[] = TPS_PROVIDERS): TpsCheckRow[] {
  return (rows ?? []).filter((r): r is TpsCheckRow => {
    if (!r || !providerById(r.provider, providers)) return false;
    if (!r.register || !(TPS_REGISTERS as readonly string[]).includes(r.register)) return false;
    if (!r.result || !(TPS_RESULTS as readonly string[]).includes(r.result)) return false;
    if (!String(r.provider_reference ?? '').trim()) return false;
    const t = Date.parse(String(r.checked_at ?? ''));
    return Number.isFinite(t) && t <= now.getTime();
  });
}

export function tpsVerdict(rows: readonly Partial<TpsCheckRow>[] | null | undefined, now: Date = new Date(), providers: readonly TpsProviderInfo[] = TPS_PROVIDERS): TpsVerdict {
  const genuine = genuineTpsRows(rows, now, providers);
  if (providers.length === 0 && genuine.length === 0) {
    return { state: 'no_service', label: 'Not screened: no TPS/CTPS checking service is connected yet', detail: 'LeadFinderOS cannot check numbers against the TPS or CTPS yet. Do not treat this number as screened.', screenedClear: false };
  }
  const latest = new Map<TpsRegister, TpsCheckRow>();
  for (const r of genuine) {
    const cur = latest.get(r.register);
    if (!cur || Date.parse(r.checked_at) > Date.parse(cur.checked_at)) latest.set(r.register, r);
  }
  if (latest.size === 0) return { state: 'not_checked', label: 'Not checked against the TPS or CTPS', detail: 'Check the number before a sales call.', screenedClear: false };
  const registered = [...latest.values()].filter((r) => r.result === 'registered');
  if (registered.length) {
    const names = registered.map((r) => TPS_REGISTER_NAMES[r.register]).join(' and ');
    return { state: 'registered', label: `On the ${names}`, detail: 'Do not make a sales call to this number.', screenedClear: false };
  }
  const stale = [...latest.values()].some((r) => now.getTime() - Date.parse(r.checked_at) > TPS_RECHECK_DAYS * DAY_MS);
  if (stale) return { state: 'expired', label: `TPS/CTPS check is over ${TPS_RECHECK_DAYS} days old`, detail: 'Check again before a sales call.', screenedClear: false };
  const missing = TPS_REGISTERS.filter((g) => !latest.has(g));
  if (missing.length) {
    return { state: 'partial', label: `Not checked against the ${missing.map((g) => TPS_REGISTER_NAMES[g]).join(' or ')}`, detail: 'Both registers must be checked before a sales call.', screenedClear: false };
  }
  const oldest = Math.min(...[...latest.values()].map((r) => Date.parse(r.checked_at)));
  const when = new Date(oldest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const by = providerById([...latest.values()][0].provider, providers)?.name ?? 'the provider';
  return { state: 'clear', label: 'Not on the TPS or CTPS', detail: `Checked ${when} via ${by}. Recheck after ${TPS_RECHECK_DAYS} days.`, screenedClear: true };
}
