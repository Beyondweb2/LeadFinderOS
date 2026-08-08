/* ════════════════════════════════════════════════════════════════════════════════════════════
   SUPPRESSION — "one no anywhere means suppressed everywhere, forever, across every product".

   ⛔ THIS IS THE ONLY IMPLEMENTATION, AND THAT IS THE ENTIRE POINT. Before it existed the rule
   was written out inline in three places and absent from two others:
     process-whatsapp-queue  inline .eq("phone_e164", …)      protected
     process-sms-queue       inline .eq("phone_e164", …)      protected
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
       twilio-inbound already upserts on and the one most rows carry. The other identifiers ride
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
