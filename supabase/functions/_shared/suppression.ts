/* ════════════════════════════════════════════════════════════════════════════════════════════
   SUPPRESSION — "one no anywhere means suppressed everywhere, forever, across every product".

   ⛔ THIS IS THE ONLY IMPLEMENTATION, AND THAT IS THE ENTIRE POINT. Before it existed the rule
   was written out inline in three places and absent from two others:
     process-whatsapp-queue  inline .eq("phone_e164", …)      protected
     process-sms-queue       inline .eq("phone_e164", …)      protected (function deleted 2026-09-16)
     auto-reply-rules        inline .eq("phone_e164", …)      protected
     instantly-push          NOTHING                          could email someone who said no
     bulk-jobs (audits)      NOTHING                          could spend on someone who said no
   Two copies of a suppression rule is how somebody gets emailed. Every path calls isSuppressed();
   nobody re-implements it.

   ⚠️ IT FAILS CLOSED. Every other guard in this codebase treats absence as "carry on" — serveGate
   flags rather than blocks, offTradeMark marks nothing on a missing type, the search gate passes an
   unknown pool count. This one is the opposite and deliberately so: if the lookup throws, we do NOT
   know that the person is contactable, and the cost of a false block (one email not sent) is
   nothing against the cost of a false pass (emailing someone who told you to stop). The old inline
   copies all returned `false` on a thrown error — i.e. "not suppressed" — which is the wrong
   default and is preserved nowhere.

   ⚠️ AN IDENTIFIER THAT IS ABSENT IS NOT AN IDENTIFIER THAT IS CLEAR. Passing no phone and no email
   checks nothing and returns NOT suppressed — correct, because there is nothing to match on — which
   is why callers should pass leadId as well. A lead row can be suppressed by id even when it has
   neither a phone nor an email, which is the common shape for archived rows.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Canonical E.164 for matching: contact_suppressions stores '+447…'; leads store bare digits. */
export function toE164(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/** Emails are stored and compared lowercased and trimmed. */
export function normEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return e ? e : null;
}

export interface SuppressionIdentity {
  phone?: string | null;
  email?: string | null;
  leadId?: string | null;
}

export interface SuppressionHit {
  suppressed: boolean;
  /** Which identifier matched, for logging that names the reason rather than just refusing. */
  matchedOn?: "phone" | "email" | "lead_id" | "lookup_failed";
  reason?: string | null;
}

/**
 * Is this person suppressed on ANY channel? One row anywhere means yes.
 *
 * ⚠️ FAILS CLOSED: a thrown lookup returns suppressed:true with matchedOn:'lookup_failed'. A caller
 * that would rather send than risk a false block must say so explicitly — not inherit it silently.
 */
// deno-lint-ignore no-explicit-any
export async function checkSuppressed(service: any, who: SuppressionIdentity): Promise<SuppressionHit> {
  const phone = toE164(who.phone);
  const email = normEmail(who.email);
  const leadId = (who.leadId ?? "").trim() || null;

  // Nothing to match on. Not an error, and not a clearance either — there is simply no identity.
  if (!phone && !email && !leadId) return { suppressed: false };

  try {
    /* One query per identifier present, rather than an `or()` filter: PostgREST's or() syntax needs
       values escaped for commas and parentheses, and an email containing either would silently
       change the filter's meaning. Three cheap indexed lookups beat one clever unparseable one. */
    if (phone) {
      const { data } = await service.from("contact_suppressions")
        .select("reason").eq("phone_e164", phone).limit(1).maybeSingle();
      if (data) return { suppressed: true, matchedOn: "phone", reason: data.reason ?? null };
    }
    if (email) {
      const { data } = await service.from("contact_suppressions")
        .select("reason").eq("email", email).limit(1).maybeSingle();
      if (data) return { suppressed: true, matchedOn: "email", reason: data.reason ?? null };
    }
    if (leadId) {
      const { data } = await service.from("contact_suppressions")
        .select("reason").eq("lead_id", leadId).limit(1).maybeSingle();
      if (data) return { suppressed: true, matchedOn: "lead_id", reason: data.reason ?? null };
    }
    return { suppressed: false };
  } catch (e) {
    console.error("[suppression] lookup FAILED — failing closed:", (e as Error).message);
    return { suppressed: true, matchedOn: "lookup_failed", reason: "lookup_failed" };
  }
}

/** Boolean convenience for call sites that only branch. Same failing-closed behaviour. */
// deno-lint-ignore no-explicit-any
export async function isSuppressed(service: any, who: SuppressionIdentity): Promise<boolean> {
  return (await checkSuppressed(service, who)).suppressed;
}

/**
 * Record a no. Idempotent per identifier — re-suppressing an already-suppressed person is a no-op,
 * so callers never have to check first.
 *
 * ⚠️ Writes whichever identifiers it is given. A WhatsApp decline supplies a phone and a lead id;
 * that same row then suppresses the EMAIL channel for that lead too, which is the whole reason the
 * table grew a lead_id column.
 */
// deno-lint-ignore no-explicit-any
export async function suppress(
  service: any,
  who: SuppressionIdentity,
  meta: { reason: string; source: string },
): Promise<boolean> {
  const phone = toE164(who.phone);
  const email = normEmail(who.email);
  const leadId = (who.leadId ?? "").trim() || null;
  if (!phone && !email && !leadId) return false;

  try {
    /* onConflict names ONE column, so pick the strongest identifier present — phone is the one
       the old SMS STOP handler upserted on and the one most rows carry. The other identifiers ride
       along on the same row. A conflict on a DIFFERENT unique column (same lead, new phone) surfaces
       as 23505 and is treated as "already suppressed", which it is. */
    const conflictCol = phone ? "phone_e164" : email ? "email" : "lead_id";
    const { error } = await service.from("contact_suppressions").upsert(
      { phone_e164: phone, email, lead_id: leadId, reason: meta.reason, source: meta.source },
      { onConflict: conflictCol },
    );
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[suppression] write failed:", (error as { message?: string }).message);
      return false;
    }
    console.log(`[suppression] suppressed ${phone ?? email ?? leadId} (${meta.reason} / ${meta.source})`);
    return true;
  } catch (e) {
    console.error("[suppression] write threw:", (e as Error).message);
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE SAME RULE, FOR A WHOLE BATCH AT ONCE.

   ⛔ WHY THIS IS HERE AND NOT IN THE CALLER. checkSuppressed is up to three round trips PER LEAD,
   which is fine for one send and is the reason the push triage had a cap: 200 leads was 25 sequential
   slices of reads, 1,000 leads would be 125, and the operator's answer to "why did it fail" was
   "edge function error". The table is TINY — 142 rows on 2026-09-09 — so reading it once and
   intersecting in memory makes the cost of triage independent of the batch size, which is what lets
   the cap go away honestly rather than by hoping.

   ⛔ IT IS IN THIS FILE FOR THE REASON THE HEADER GIVES: two copies of a suppression rule is how
   somebody gets emailed. Same normalisers, same phone -> email -> lead_id order, same failing-closed
   default. scripts/suppression-index.test.ts drives BOTH implementations over the same rows and
   asserts they never disagree.

   ⚠️ PAGINATED TO EXHAUSTION, AND A TRUNCATED READ FAILS CLOSED. PostgREST stops at db-max-rows
   silently, and a partial suppression list is indistinguishable from a clean one — which is exactly
   the bug this table exists to prevent. Same reasoning as process-whatsapp-queue's contact_check.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const INDEX_PAGE = 1000;
const INDEX_MAX_PAGES = 50; // 50,000 rows; far beyond the real table, and a real ceiling rather than a loop

export interface SuppressionIndex {
  /** Identical verdict to checkSuppressed(), with no round trip. */
  check(who: SuppressionIdentity): SuppressionHit;
  /** How many rows the index holds. Zero is a real answer; a failed load says so via `ok`. */
  size: number;
  /** False when the read failed or truncated — every check then fails closed. */
  ok: boolean;
}

interface SuppressionRow {
  id?: string | number | null;
  phone_e164: string | null;
  email: string | null;
  lead_id: string | null;
  reason: string | null;
}

/**
 * Read every suppression row once and return an in-memory checker.
 *
 * ⚠️ FAILS CLOSED EXACTLY AS checkSuppressed DOES: if the read throws or truncates, every identity
 * that HAS an identifier comes back suppressed with matchedOn 'lookup_failed'. An identity with
 * nothing to match on is still NOT suppressed — there is no identity to have said no.
 */
// deno-lint-ignore no-explicit-any
export async function loadSuppressionIndex(service: any): Promise<SuppressionIndex> {
  const byPhone = new Map<string, string | null>();
  const byEmail = new Map<string, string | null>();
  const byLead = new Map<string, string | null>();
  let size = 0;
  let ok = true;

  try {
    for (let page = 0; page < INDEX_MAX_PAGES; page++) {
      const from = page * INDEX_PAGE;
      /* ⚠️ ORDERED BY id. An unstable order lets pages skip rows — the reason fetchAllRows exists. */
      const { data, error } = await service
        .from("contact_suppressions")
        .select("id, phone_e164, email, lead_id, reason")
        .order("id", { ascending: true })
        .range(from, from + INDEX_PAGE - 1);
      if (error) throw new Error((error as { message?: string }).message ?? "read failed");
      const rows = (data ?? []) as SuppressionRow[];
      for (const r of rows) {
        size++;
        /* First row wins per identifier, so a duplicate cannot change the reason on a re-read. */
        const p = toE164(r.phone_e164);
        if (p && !byPhone.has(p)) byPhone.set(p, r.reason ?? null);
        const e = normEmail(r.email);
        if (e && !byEmail.has(e)) byEmail.set(e, r.reason ?? null);
        const l = (r.lead_id ?? "").trim();
        if (l && !byLead.has(l)) byLead.set(l, r.reason ?? null);
      }
      if (rows.length < INDEX_PAGE) {
        return { size, ok, check: (who) => lookup(who, byPhone, byEmail, byLead, true) };
      }
    }
    /* Ran out of pages before running out of rows. A partial list reads as clean, so refuse. */
    console.error("[suppression] index exceeded MAX_PAGES — failing closed");
    ok = false;
  } catch (e) {
    console.error("[suppression] index load FAILED — failing closed:", (e as Error).message);
    ok = false;
  }
  return { size, ok, check: (who) => lookup(who, byPhone, byEmail, byLead, ok) };
}

function lookup(
  who: SuppressionIdentity,
  byPhone: Map<string, string | null>,
  byEmail: Map<string, string | null>,
  byLead: Map<string, string | null>,
  loaded: boolean,
): SuppressionHit {
  const phone = toE164(who.phone);
  const email = normEmail(who.email);
  const leadId = (who.leadId ?? "").trim() || null;

  // Nothing to match on. Not an error, and not a clearance either — there is simply no identity.
  if (!phone && !email && !leadId) return { suppressed: false };
  if (!loaded) return { suppressed: true, matchedOn: "lookup_failed", reason: "lookup_failed" };

  if (phone && byPhone.has(phone)) return { suppressed: true, matchedOn: "phone", reason: byPhone.get(phone) ?? null };
  if (email && byEmail.has(email)) return { suppressed: true, matchedOn: "email", reason: byEmail.get(email) ?? null };
  if (leadId && byLead.has(leadId)) return { suppressed: true, matchedOn: "lead_id", reason: byLead.get(leadId) ?? null };
  return { suppressed: false };
}
