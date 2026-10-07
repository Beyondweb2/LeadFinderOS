// setup-link-creator — FULL SETUP KEEPS ITS SALESPERSON (2026-10-07, fix/two-close-final-safeguards).
//
// A salesperson who sends a lead the Full Setup link is the person who created that sign-up, exactly as one who makes the
// Agreement & Payment link is. The seller of a sale is "the authorised person who CREATED the sign-up the client paid through"
// (public.sale_creations, stamped into outreach_leads.sold_by_user_id by sale_attribution_decision) — so when the client's own
// page creates the sign-up row, this records that creation: ONE quick_close_events 'link_generated' (actor = the sender,
// onboarding_id = THE NEW ROW). The existing trigger snapshots the sender's role and Ready-to-Sell into sale_creations.
// No second attribution system: the same event, the same trigger, the same decision.
//
// ⛔ FAILS TOWARD "NO SELLER", never toward a guess: no recorded send → no event (the sale is then Paul's / held for review by
//    the existing rule). ⛔ ONE event per sign-up row (never twice). ⛔ NON-FATAL: the client's answers are already saved.
// ⛔ The sender is read from the lead's own History of sends (quick_close_events 'link_shared', data.variant 'setup'), newest first,
//    within SETUP_SEND_WINDOW_DAYS — a link sent months ago is not this sale.
// deno-lint-ignore no-explicit-any
type Service = any;

export const SETUP_SEND_WINDOW_DAYS = 60;

export async function recordSetupSignupCreator(service: Service, leadId: string, onboardingId: string): Promise<{ recorded: boolean; reason: string; actor?: string }> {
  const since = new Date(Date.now() - SETUP_SEND_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: sends, error } = await service.from("quick_close_events")
    .select("id, actor_user_id, created_at, data").eq("lead_id", leadId).eq("kind", "link_shared").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(30);
  if (error) return { recorded: false, reason: `sends_unreadable:${error.message}` };
  const send = ((sends ?? []) as { id: string; actor_user_id: string | null; data: { variant?: string } | null }[]).find((s) => s.data?.variant === "setup" && !!s.actor_user_id);
  if (!send) return { recorded: false, reason: "no_setup_send" };
  const { data: already, error: aErr } = await service.from("quick_close_events").select("id").eq("onboarding_id", onboardingId).eq("kind", "link_generated").limit(1);
  if (aErr) return { recorded: false, reason: `existing_unreadable:${aErr.message}` };
  if ((already ?? []).length) return { recorded: false, reason: "already_recorded" };
  const { error: insErr } = await service.from("quick_close_events").insert({
    lead_id: leadId, onboarding_id: onboardingId, actor_user_id: send.actor_user_id, kind: "link_generated",
    data: { variant: "setup", source: "full_setup_submit", setup_send_event: send.id },
  });
  if (insErr) return { recorded: false, reason: `insert_failed:${insErr.message}` };
  return { recorded: true, reason: "ok", actor: send.actor_user_id ?? undefined };
}
