/* ════════════════════════════════════════════════════════════════════════════════════════════
   HOW MANY TO PUSH, AND WHICH ONES — the two rules the cap used to answer badly.

   Paul, 2026-09-09: "remove the cap, allow me to select an amount that it sends and always select
   the ones deepest in outreach list first."

   ⛔ WHY "DEEPEST" MEANS OLDEST, AND WHY IT IS WRITTEN DOWN RATHER THAN ASSUMED. The Outreach table
   reads `.order('created_at', { ascending: false })` (useOutreach.ts) — newest at the top — so the
   leads furthest DOWN that list are the oldest ones, the ones that have sat unworked longest. The
   old rule sorted by `id.localeCompare`, which is a UUID: a stable order, but an arbitrary one, so
   the cap sliced a random subset and the same lead could sit unsent for months.

   ⛔ THE LIMIT IS NOW THE OPERATOR'S, AND ABSENCE IS NOT A NUMBER. An unusable value REFUSES rather
   than falling back — a "limit" of "abc" quietly becoming "send everything" is the absent-value
   fault CLAUDE.md records fifteen instances of, on the one control that decides how many real
   businesses get emailed. Only a genuinely ABSENT limit takes the default.

   ⛔ AND AN OPERATOR LIMIT MAY ONLY EVER LOWER A SPEND CAP, NEVER RAISE ONE. The audit-first path
   buys an audit per lead; its 25 is a money guard and a number typed into a box must not be able to
   lift it. The no-audit path spends nothing, so its default is genuinely unbounded.

   Pure, Deno-free, and imported by BOTH bulk-jobs and scripts/push-selection.test.ts — so the test
   proves the shipped rule rather than a restatement of it.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type SendLimitResult =
  | { ok: true; limit: number }
  | { ok: false; reason: string };

/**
 * Read the operator's "how many to send" off a request.
 *
 * @param raw      what the client sent — anything at all, including nothing
 * @param fallback what an ABSENT value means (Infinity for the no-audit push: no cap)
 * @param hardCap  a ceiling the operator cannot raise (the audit path's spend guard). Optional.
 */
export function resolveSendLimit(raw: unknown, fallback: number, hardCap = Number.POSITIVE_INFINITY): SendLimitResult {
  /* Absent means "you did not choose", which is the only thing allowed to take the default. */
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    return { ok: true, limit: Math.min(fallback, hardCap) };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, reason: `"how many to send" must be a number, not ${JSON.stringify(raw)}` };
  if (!Number.isInteger(n)) return { ok: false, reason: `"how many to send" must be a whole number, not ${n}` };
  if (n < 1) return { ok: false, reason: `"how many to send" must be at least 1, not ${n}` };
  /* ⛔ min, never max. A typed number can shrink a spend cap and can never lift one. */
  return { ok: true, limit: Math.min(n, hardCap) };
}

/** The columns the ordering needs. A subset of what the triage already selects. */
export interface DatedRow {
  id: string;
  created_at?: string | null;
}

/**
 * Oldest first — the bottom of the Outreach list, worked upwards.
 *
 * ⚠️ A ROW WITH NO DATE SORTS LAST, NOT FIRST. Its age is unknown, and putting an unknown-age lead
 * ahead of a provably old one would be inventing evidence. It also matches what Paul sees: Postgres
 * sorts NULLs first on a DESC order, so an undated lead sits at the TOP of his Outreach table —
 * i.e. the shallowest place — and the shallowest thing is the last thing this picks.
 * ⚠️ `id` is the tiebreaker so the order is TOTAL. The preview and the create are two separate
 * queries over the same leads; without a unique tiebreaker they can slice a different N and the
 * confirm screen would describe a job that never ran.
 */
export function oldestFirst<T extends DatedRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = (a.created_at ?? "").trim();
    const db = (b.created_at ?? "").trim();
    if (da !== db) {
      if (!da) return 1;   // undated goes last…
      if (!db) return -1;  // …whichever side it is on
      return da < db ? -1 : 1;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

/** What the limit decides: which graded rows this run actually touches. */
export interface GradedForLimit {
  lead_id: string;
  bucket: "push_now" | "needs_audit" | "cannot";
}

/**
 * Apply the limit to an ALREADY ORDERED list of graded rows, and say which ones run.
 *
 * ⚠️ READY-TO-PUSH LEADS TAKE THE LIMIT FIRST. They cost nothing and go out in this run's upload,
 * so spending the allowance on them before buying any audit gets the most email sent per run. The
 * order WITHIN each bucket is the caller's (oldest first) and is preserved — the sort is stable by
 * original index, so this never re-shuffles the age ordering it was handed.
 * ⚠️ `cannot` is never counted against the limit. A selection full of already-pushed leads must not
 * consume the allowance for the leads that can actually be sent.
 */
export function applySendLimit<T extends GradedForLimit>(graded: T[], limit: number): Set<string> {
  const rank = (b: T["bucket"]) => (b === "push_now" ? 0 : b === "needs_audit" ? 1 : 2);
  const ranked = graded
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.bucket) - rank(b.r.bucket) || a.i - b.i);
  let room = Math.max(0, limit);
  const willRun = new Set<string>();
  for (const { r } of ranked) {
    if (r.bucket === "cannot") continue;
    if (room <= 0) break;
    willRun.add(r.lead_id);
    room--;
  }
  return willRun;
}
