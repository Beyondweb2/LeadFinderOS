/* ══ TPS / CTPS — FUTURE COMPLIANCE ENHANCEMENT, NOT ACTIVE (postponed by Paul, 2026-10-05) ═════════
   docs/salesperson-onboarding.md §5. Dormant groundwork only: the state shape (public.phone_tps_checks),
   the provider boundary (tpsRowFromAnswer) and the verdict (tpsVerdict). NOTHING uses it today:
     · no provider is connected (TPS_PROVIDERS is empty) and no external TPS/CTPS API is ever called;
     · it is NOT part of Ready to Sell, and it does NOT block the Call button, call logging or any action;
     · no screen shows it (the lead card has no TPS line while it is inactive).
   When Paul switches it on, the rules below already hold:
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

/** The providers whose answers count. EMPTY: no provider is connected. Adding one here is the ONLY way a
 *  number can ever read as clear — together with its edge function, its secret and a signed licence for
 *  the TPS data (Paul's decision, docs/salesperson-onboarding.md §5). */
export const TPS_PROVIDERS: readonly TpsProviderInfo[] = [];

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
