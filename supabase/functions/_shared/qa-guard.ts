/* QA SAFETY, the database half (2026-10-04). The rule is src/lib/qaSafety.ts; this file only reads
   the facts it needs. ⛔ FAILS CLOSED: a failed read THROWS — on a sending path an unreadable
   exclusion list must stop the send, never wave it through as "not a test". Every caller already
   has a catch that turns a throw into "nothing was sent". */
import { buildExclusions, isInternalEmail, type Exclusions, type ExclusionRow } from "../../../src/lib/metricExclusions.ts";
import { isQaLead, qaEmailRefusal, qaSendVerdict, type QaPaymentFacts, type QaSendVerdict } from "../../../src/lib/qaSafety.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export async function loadQaExclusions(service: Service): Promise<Exclusions> {
  const { data, error } = await service.from("metric_exclusions").select("kind, value, reason");
  if (error) throw new Error(`qa_guard_unavailable: ${String((error as { message?: string }).message ?? error)}`);
  return buildExclusions((data ?? []) as ExclusionRow[]);
}

/** The verdict for one send to one lead. Reads the lead's holder and stored phone itself, so a caller
 *  whose select never carried assigned_to_user_id cannot get the "held by a test account" case wrong. */
export async function qaSendHold(
  service: Service,
  t: { leadId?: string | null; to?: string | null; actorUserId?: string | null },
  ex?: Exclusions,
): Promise<QaSendVerdict> {
  const exclusions = ex ?? await loadQaExclusions(service);
  let holder: string | null = null;
  let stored: string | null = null;
  if (t.leadId) {
    const { data, error } = await service.from("outreach_leads").select("phone, assigned_to_user_id").eq("id", t.leadId).maybeSingle();
    if (error) throw new Error(`qa_guard_unavailable: ${String((error as { message?: string }).message ?? error)}`);
    holder = (data?.assigned_to_user_id as string | null) ?? null;
    stored = (data?.phone as string | null) ?? null;
  }
  return qaSendVerdict(exclusions, { leadId: t.leadId ?? null, phones: [t.to, stored], holderUserId: holder, actorUserId: t.actorUserId ?? null });
}

/** A client-facing email about this lead: null = send as normal; a sentence = REFUSE (QA lead, address
 *  is not the QA sink). Throws on a failed read — the caller does not send. */
export async function qaEmailHold(service: Service, leadId: string | null | undefined, to: string | null | undefined): Promise<string | null> {
  if (!leadId) return null;
  const ex = await loadQaExclusions(service);
  const { data, error } = await service.from("outreach_leads").select("id, phone, assigned_to_user_id").eq("id", leadId).maybeSingle();
  if (error) throw new Error(`qa_guard_unavailable: ${String((error as { message?: string }).message ?? error)}`);
  if (!data) return null;
  return qaEmailRefusal(isQaLead(ex, data as { id: string; phone: string | null; assigned_to_user_id: string | null }), to);
}

/** The facts qaPaymentFactsRefusal judges, for a simulated checkout.session.completed. Throws on a
 *  failed read — the webhook then refuses the simulation (nothing is written). */
export async function loadQaPaymentFacts(
  service: Service,
  args: { leadId: string; onboardingId: string; payerEmail: string | null },
): Promise<QaPaymentFacts> {
  const ex = await loadQaExclusions(service);
  const fail = (what: string, e: unknown) => { throw new Error(`qa_guard_unavailable: ${what}: ${String((e as { message?: string })?.message ?? e)}`); };
  const { data: lead, error: le } = await service.from("outreach_leads").select("id, phone, email").eq("id", args.leadId).maybeSingle();
  if (le) fail("lead", le);
  const { data: onb, error: oe } = await service.from("onboarding_responses").select("lead_id").eq("id", args.onboardingId).maybeSingle();
  if (oe) fail("onboarding", oe);
  const { data: emails, error: ee } = await service.from("onboarding_responses").select("contact_email").eq("lead_id", args.leadId);
  if (ee) fail("onboarding emails", ee);
  const leadEmail = (lead?.email as string | null) ?? null;
  return {
    leadFound: !!lead,
    leadExcluded: ex.leads.has(args.leadId),
    leadPhone: (lead?.phone as string | null) ?? null,
    leadEmail,
    leadEmailInternal: !leadEmail || isInternalEmail(ex, leadEmail),
    payerEmailInternal: !args.payerEmail || isInternalEmail(ex, args.payerEmail),
    onboardingLeadId: (onb?.lead_id as string | null) ?? null,
    onboardingEmailsInternal: ((emails ?? []) as Array<{ contact_email: string | null }>).every((r) => !r.contact_email || isInternalEmail(ex, r.contact_email)),
  };
}
