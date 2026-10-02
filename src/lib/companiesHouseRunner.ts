import { isChCheckFresh, listingFingerprint, type CompaniesHouseCheckRow } from './companiesHouse.ts';

/* ══ THE COMPANIES HOUSE RUN FOR ONE RESULT SET (Find Leads, 2026-10-02) ═══════════════════════════
   The lifecycle behind useCompaniesHouseChecks, with no React in it so it can be driven by a test
   (scripts/companies-house-runner.test.ts). One runner per page; setTargets() is called with every
   new result set, and EVERY new set is processed:
   1. At once: every target with no fresh row this session reads "Checking…" (no "Not checked" flash).
   2. One read of the stored checks (companies_house_checks); a fresh one for the same listing shows at
      once and is never looked up again. A failed read means nothing is stored: look it up.
   3. The rest go to the lookup CONCURRENCY at a time; each row fills in as it lands.
   ⛔ A result belongs to its PLACE, not to the run that asked for it: a lookup that lands after a newer
   search started is still kept and shown (it was lost before — saved, then skipped as done, never drawn).
   A place already being looked up is awaited, never asked for twice.
   A newer setTargets() takes over: the older run stops starting lookups and no longer edits "Checking…".
   "not configured" / "busy" stops the run — the rest read "Not checked" with the reason. Nothing failed
   is stored, so the next search tries again. */

export type ChUnavailable = 'not_configured' | 'rate_limited' | 'unavailable';
export interface ChTargetInput { id: string; name: string; address?: string | null }
export interface ChTarget { id: string; name: string; address: string; fp: string }
export interface ChLookupResult { ok: boolean; error?: string; check?: CompaniesHouseCheckRow }
export interface ChRunnerDeps {
  readStored: (placeIds: string[]) => Promise<CompaniesHouseCheckRow[]>;
  lookup: (t: ChTarget) => Promise<ChLookupResult>;
  now?: () => number;
  concurrency: number;
}
export interface ChRunnerState { checking: ReadonlySet<string>; stoppedBecause: ChUnavailable | null; version: number; /** chTargetsKey of the set last started. */ key: string | null }

export function chTargetsOf(items: ChTargetInput[]): ChTarget[] {
  const m = new Map<string, ChTarget>();
  for (const i of items) if (i.id && !m.has(i.id)) m.set(i.id, { id: i.id, name: i.name, address: i.address ?? '', fp: listingFingerprint(i.name, i.address) });
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export const chTargetsKey = (targets: ChTarget[]) => targets.map((t) => `${t.id}:${t.fp}`).join('|');

export function createChRunner(deps: ChRunnerDeps) {
  const now = deps.now ?? (() => Date.now());
  const rows = new Map<string, CompaniesHouseCheckRow>();
  const inflight = new Map<string, Promise<void>>();
  let checking = new Set<string>();
  let stoppedBecause: ChUnavailable | null = null;
  let version = 0;
  let run = 0;
  let key: string | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { version++; for (const l of listeners) l(); };
  const fresh = (t: ChTarget, at: number) => { const r = rows.get(t.id); return !!r && isChCheckFresh(r, t.fp, at); };
  const put = (r: CompaniesHouseCheckRow) => { rows.set(r.place_id, r); };

  async function lookupOnce(t: ChTarget): Promise<ChUnavailable | null> {
    const existing = inflight.get(t.id);
    if (existing) { await existing; return null; }
    let stop: ChUnavailable | null = null;
    const p = (async () => {
      try {
        const res = await deps.lookup(t);
        if (res?.ok && res.check) put(res.check);
        else if (res?.error === 'not_configured' || res?.error === 'rate_limited') stop = res.error;
      } catch { /* stays "Not checked" — never shown as Not found */ }
    })();
    inflight.set(t.id, p);
    try { await p; } finally { inflight.delete(t.id); }
    return stop;
  }

  async function process(targets: ChTarget[], my: number) {
    const at = now();
    let need = targets.filter((t) => !fresh(t, at));
    // Stored checks first (fails safe: nothing read = look it up).
    for (let i = 0; i < need.length; i += 150) {
      let stored: CompaniesHouseCheckRow[] = [];
      try { stored = await deps.readStored(need.slice(i, i + 150).map((t) => t.id)); } catch { stored = []; }
      const fpOf = new Map(need.map((t) => [t.id, t.fp]));
      for (const r of stored) if (isChCheckFresh(r, fpOf.get(r.place_id) ?? '', at)) put(r);
    }
    need = need.filter((t) => !fresh(t, at));
    if (run === my) { checking = new Set(need.map((t) => t.id)); emit(); } else { emit(); return; }
    let next = 0;
    let stop: ChUnavailable | null = null;
    const worker = async () => {
      while (run === my && !stop && next < need.length) {
        const t = need[next++];
        const s = await lookupOnce(t);
        if (s) stop = s;
        if (run === my) { const n = new Set(checking); n.delete(t.id); checking = n; }
        emit();
      }
    };
    await Promise.all(Array.from({ length: Math.min(deps.concurrency, need.length) }, worker));
    if (run === my) {
      checking = new Set();
      if (stop) stoppedBecause = stop;
      emit();
    }
  }

  return {
    /** Start on a result set. Returns when this set has settled (or a newer one took over). */
    setTargets(targets: ChTarget[]): Promise<void> {
      const my = ++run;
      key = chTargetsKey(targets);
      stoppedBecause = null;
      const at = now();
      // "Checking…" at once for everything not already known this session.
      checking = new Set(targets.filter((t) => !fresh(t, at)).map((t) => t.id));
      emit();
      if (!targets.length) return Promise.resolve();
      return process(targets, my);
    },
    rowFor(id: string, fp: string | undefined): CompaniesHouseCheckRow | null {
      const r = rows.get(id);
      return r && r.fingerprint === fp ? r : null;
    },
    state(): ChRunnerState { return { checking, stoppedBecause, version, key }; },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
export type ChRunner = ReturnType<typeof createChRunner>;
