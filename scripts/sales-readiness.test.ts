/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES READINESS (2026-09-28, docs/sales-readiness.md). Pins, from the pure rules and the source
   (the live proof is supabase/tests/sales-readiness.sql, always rolled back):
     · the Sales Dashboard fold: campaign scoping, template sends / replies / contested, interested /
       not interested, onboarding sent / opened, won — and no other person's sends ever counted;
     · the sign-up link's sent/opened rule: before-send loads, previews and copies never count;
     · one CRM truth: every writer notifies, every reader re-reads (Inbox, Outreach, the panels);
     · security: the new functions check role + ownership first, anon cannot call them, sales cannot
       widen the dashboard, the response carries no money field;
     · Next Action stays human-set: logging a contact writes activity only;
     · payment: the paid screen waits for the SERVER; payment_status never writes; success_url unchanged;
     · GBP: no password field, the one configured address, three distinct states;
     · deliverables: no client-facing review-reply promise.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { foldSalesPerformance, rate, periodSinceMs, type FoldInput } from "../src/lib/salesPerformance.ts";
import { onboardingLinkStatus, previewUrl, ONBOARDING_LINK_RE } from "../src/lib/onboardingLinkStatus.ts";
import { creditRepliesByTemplate, creditRepliesToSends } from "../src/lib/templateAttribution.ts";
import { CALL_OUTCOMES, CONTACT_CHANNEL_OPTIONS } from "../src/lib/salesCrm.ts";
import { LEAD_SOURCE_LABELS } from "../src/lib/salesPerformance.ts";
import { callerFirstName } from "../src/lib/coldCallPlaybook.ts";
import { DELIVERY_CHECKLIST_ITEMS, GBP_ACCESS_CHECKLIST_KEY, gbpClientSaysLabel } from "../src/lib/deliveryCockpit.ts";
import { canOpenRoute } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
/* findable-site sits beside this checkout (or FINDABLE_SITE_DIR). ⚠️ A sibling OLDER than this change
   (the primary checkout is often stale) is reported and skipped, never passed: its screen assertions
   run only against a findable-site that has the post-payment step at all. */
const SITE = process.env.FINDABLE_SITE_DIR || path.resolve(root, "..", "findable-site");
const siteRaw = (p: string) => { try { return fs.readFileSync(path.join(SITE, p), "utf8").replace(/\r\n/g, "\n"); } catch { return null; } };
const SITE_CURRENT = /paymentState/.test(siteRaw("src/components/OnboardingFlow.tsx") ?? "");
if (!SITE_CURRENT) console.log(`NOTE findable-site at ${SITE} predates the post-payment step: its assertions are skipped (set FINDABLE_SITE_DIR)`);
const siteRead = (p: string) => (SITE_CURRENT ? siteRaw(p) : null);

/* ── fixtures ── */
const REP = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const C1 = "c1", C2 = "c2";
const lead = (id: string, over: Record<string, unknown> = {}) => ({ id, business_name: id.toUpperCase(), campaign_id: C1, status: "initial_contact", amount_paid: null, is_potential_work: false, lead_source: null, ...over });
const out = (lead_id: string, at: string, template: string | null, by: string | null = null, status = "delivered", body = "hi") => ({ lead_id, direction: "outbound", template_name: template, status, created_at: at, body, sent_by_user_id: by });
const inn = (lead_id: string, at: string, body = "yes please") => ({ lead_id, direction: "inbound", template_name: null, status: "received", created_at: at, body, sent_by_user_id: null });
function base(): FoldInput {
  return {
    personId: REP, sinceMs: null,
    leads: [
      lead("a"),                                             // opener → reply → interested → link → opened → won
      lead("b"),                                             // opener → no reply
      lead("c", { campaign_id: C2, status: "not_interested" }), // opener → decline
      lead("d"),                                             // only ever contacted by the OTHER person by hand
      lead("e", { lead_source: "linkedin" }),                // a logged call, no WhatsApp
    ] as FoldInput["leads"],
    messages: [
      out("a", "2026-09-10T09:00:00Z", "initial_contact"), inn("a", "2026-09-10T09:05:00Z"),
      out("b", "2026-09-10T09:00:00Z", "initial_contact"),
      out("b", "2026-09-10T09:00:00Z", "initial_contact", null, "failed"), // a failed send is not a send
      out("c", "2026-09-10T09:00:00Z", "initial_contact"), out("c", "2026-09-11T09:00:00Z", "contact_followup"), inn("c", "2026-09-11T10:00:00Z", "not interested thanks"),
      out("d", "2026-09-10T09:00:00Z", "initial_contact", OTHER), inn("d", "2026-09-10T09:30:00Z"),
    ],
    activity: [
      { lead_id: "a", actor_user_id: REP, kind: "marked_interested", data: { on: true }, created_at: "2026-09-10T10:00:00Z" },
      { lead_id: "e", actor_user_id: REP, kind: "call_outcome", data: { outcome: "spoke_to_owner" }, created_at: "2026-09-12T10:00:00Z" },
      { lead_id: "e", actor_user_id: REP, kind: "contact_logged", data: { outcome: "no_answer", channel: "linkedin" }, created_at: "2026-09-13T10:00:00Z" },
      { lead_id: "d", actor_user_id: OTHER, kind: "call_outcome", data: { outcome: "interested" }, created_at: "2026-09-12T10:00:00Z" },
    ],
    linkEvents: [
      { lead_id: "a", kind: "sent", channel: "whatsapp", actor_user_id: REP, created_at: "2026-09-12T09:00:00Z" },
      { lead_id: "b", kind: "generated", channel: "copy", actor_user_id: REP, created_at: "2026-09-12T09:00:00Z" },
    ],
    hits: [
      { lead_id: "a", page: "onboarding", created_at: "2026-09-12T12:00:00Z" },
      { lead_id: "a", page: "onboarding", created_at: "2026-09-12T12:05:00Z" },
      { lead_id: "b", page: "onboarding", created_at: "2026-09-11T12:00:00Z" },        // no send: never an open
      { lead_id: "b", page: "onboarding_preview", created_at: "2026-09-13T12:00:00Z" },
    ],
    campaignNames: new Map([[C1, "Plumbers"], [C2, "Roofers"]]),
  };
}

console.log("── the Sales Dashboard fold ──");
{
  const inp = base();
  inp.leads[0] = { ...inp.leads[0], amount_paid: 99, status: "payment_received" } as FoldInput["leads"][number];
  const r = foldSalesPerformance(inp);
  ok(r.funnel.leads === 5, "scope: every lead handed in is counted once");
  ok(r.funnel.contacted === 4, "contacted = a, b, c by their WhatsApp + e by a logged call; d was only messaged by someone else");
  ok(r.funnel.responded === 3, "responded = a and c (human WhatsApp replies after THEIR send) + e (spoke on a call); d's reply answered another person");
  ok(r.funnel.interested === 1, "interested (ever) = a (star + won); d's 'interested' was logged by another person");
  ok(r.funnel.notInterested === 1, "not interested (now) = c by status");
  ok(r.funnel.followedUp === 2, "followed up (2+ contacts) = c (opener + chase) and e (call + LinkedIn)");
  ok(r.funnel.onboardingSent === 1 && r.funnel.onboardingOpened === 1, "sign-up link: a sent and opened; b copied, not sent, and its load before any send is not an open");
  ok(r.funnel.won === 1 && r.won.length === 1 && r.won[0].name === "A", "won: a, by the money rule; the list carries a name, never a figure");
  ok(!JSON.stringify(r).includes("99"), "no amount appears anywhere in the result");
  const c1 = r.campaigns.find((c) => c.campaignId === C1)!, c2 = r.campaigns.find((c) => c.campaignId === C2)!;
  ok(c1.name === "Plumbers" && c1.leads === 4 && c1.contacted === 3 && c2.leads === 1 && c2.notInterested === 1, "campaign scoping: each lead counted under its own campaign");
  const ic = r.templates.find((t) => t.template === "initial_contact")!;
  ok(ic.leadsSent === 3 && ic.sends === 3, "initial_contact: 3 leads, 3 real sends (the failed one and the other person's excluded)");
  ok(ic.replies === 1 && ic.repliesContested === 0 && ic.interested === 1 && ic.won === 1 && ic.onboardingOpened === 1, "initial_contact: a's reply, and a's outcome downstream of it");
  const cf = r.templates.find((t) => t.template === "contact_followup")!;
  ok(cf.replies === 1 && cf.repliesContested === 1 && cf.notInterested === 1, "the chase takes c's reply by last touch, flagged contested");
  ok(rate(ic.replies, ic.leadsSent) === 33.3 && rate(1, 0) === null, "rates: one decimal, a zero denominator is a dash, never 0%");
  ok(r.calls.total === 1 && r.calls.byOutcome.spoke_to_owner === 1, "calls: the rep's one call; LinkedIn is not a call, the other person's call is not theirs");
  ok(r.channels.find((c) => c.channel === "linkedin")?.contacted === 1 && r.channels.find((c) => c.channel === "whatsapp")?.contacted === 3, "channels: WhatsApp 3, LinkedIn 1");
  ok(r.sources.find((s) => s.source === "linkedin")?.leads === 1 && r.sources.find((s) => s.source === null)?.leads === 4, "sources: self-sourced LinkedIn vs app search");
  ok(r.focus.openedNotWon === 0, "focus: a opened AND won, so it is not a lead to chase");
}
{
  // The other person's scope is THEIR lead (d), as the server scopes it; the rep once messaged d by hand.
  const inp = base();
  inp.personId = OTHER;
  inp.leads = inp.leads.filter((l) => l.id === "d");
  inp.messages = [...inp.messages, out("d", "2026-09-14T09:00:00Z", "audit_followup", REP)];
  const r = foldSalesPerformance(inp);
  ok(r.funnel.contacted === 1 && r.templates.length === 1 && r.templates[0].template === "initial_contact", "another person's view counts their own sends and never the rep's hand send on the same lead");
  ok(r.calls.total === 1 && r.funnel.interested === 1, "…their own call, and the interest they logged");
}
{
  const inp = base();
  inp.sinceMs = Date.parse("2026-09-11T00:00:00Z");
  const r = foldSalesPerformance(inp);
  ok(r.funnel.leads === 1 && r.funnel.contacted === 1, "period: only leads FIRST contacted in it (e, 12 Sep)");
  ok(r.templates.some((t) => t.template === "contact_followup") && !r.templates.some((t) => t.template === "initial_contact"), "period: a template row counts sends made in it");
  ok(periodSinceMs("all") === null && periodSinceMs("7", 1_000_000_000_000) === 1_000_000_000_000 - 7 * 86_400_000, "periods: all = no cut, 7 = seven days");
}
{
  const msgs = base().messages.filter((m) => m.lead_id === "c");
  ok(JSON.stringify(creditRepliesByTemplate(msgs)) === JSON.stringify(creditRepliesToSends(msgs).map(({ template, ambiguous }) => ({ template, ambiguous }))), "ONE attribution rule: the campaign card's credit is the dashboard's, minus the index");
}

console.log("── the sign-up link: sent and opened ──");
{
  const sent = [{ kind: "sent", channel: "whatsapp", actor_user_id: null, created_at: "2026-09-12T09:00:00Z" }];
  const s1 = onboardingLinkStatus(sent, [{ page: "onboarding", created_at: "2026-09-12T08:59:30Z" }]);
  ok(s1.opened && s1.openCount === 1, "a load inside the 60 s clock slack counts (Meta's clock vs ours)");
  const s2 = onboardingLinkStatus(sent, [{ page: "onboarding", created_at: "2026-09-12T08:00:00Z" }, { page: "onboarding_preview", created_at: "2026-09-12T10:00:00Z" }]);
  ok(!s2.opened && s2.unattributedLoads === 1 && s2.previewLoads === 1, "a load before the send and an operator preview never count");
  const s3 = onboardingLinkStatus(sent, [{ page: "onboarding", created_at: "2026-09-12T10:00:00Z" }, { page: "onboarding", created_at: "2026-09-13T10:00:00Z" }]);
  ok(s3.opened && s3.openCount === 2 && s3.firstOpenedAt === "2026-09-12T10:00:00Z" && s3.lastOpenedAt === "2026-09-13T10:00:00Z", "repeat opens: opened once (first), loads counted, last kept");
  const s4 = onboardingLinkStatus([{ kind: "generated", channel: "copy", actor_user_id: null, created_at: "2026-09-12T09:00:00Z" }], [{ page: "onboarding", created_at: "2026-09-12T10:00:00Z" }]);
  ok(s4.sentCount === 0 && !s4.opened && s4.generatedAt !== null, "a copy is 'generated', never 'sent'");
  ok(previewUrl("https://findable.live/onboarding/x/?lead=1") === "https://findable.live/onboarding/x/?lead=1&preview=1", "the operator's link carries preview=1");
  const body = "Here you go: https://findable.live/onboarding/abc/?lead=0ff7954f-8b49-4877-94fd-94754dc63dac. Shout if stuck";
  ok((body.match(ONBOARDING_LINK_RE) ?? []).length === 1, "the Inbox finds a sign-up link inside message text");
  const mig = read("supabase/migrations/20260928120000_sales_readiness.sql");
  ok(/after insert or update of status on public\.whatsapp_messages/.test(mig) && /exception when others then/.test(mig.slice(mig.indexOf("function public.trg_onboarding_link_sent"))), "a WhatsApp send is recorded by a trigger that can never block the message");
  ok(/\[\?&\]q2=/.test(mig), "the post-payment re-entry link (&q2=) is not an onboarding send");
  ok(/if _channel is null or _channel not in \('email', 'linkedin', 'sms', 'in_person', 'other'\)/.test(mig), "a hand-logged send may not claim WhatsApp (the trigger already counted it)");
  const fo = read("supabase/functions/findable-onboarding/index.ts");
  ok(/page: body\.preview === true \? "onboarding_preview" : "onboarding"/.test(fo), "prefill writes a preview under its own page name");
  ok(/if \(!lead\) return json\(\{ ok: false, error: "unknown_lead" \}, 404\);[\s\S]{0,4000}lead_page_hits/.test(fo), "an unknown lead id is refused before any hit is written");
}

console.log("── one CRM truth: every writer notifies, every reader re-reads ──");
{
  const app = read("src/App.tsx"), inbox = read("src/pages/Inbox.tsx"), useInbox = read("src/hooks/useInbox.ts"), useOut = read("src/hooks/useOutreach.ts"), crm = read("src/components/LeadCrmPanel.tsx"), sync = read("src/lib/leadSync.ts");
  ok(/installLeadSync\(queryClient\)/.test(app), "one app-level listener invalidates the per-lead queries");
  ok(/\['lead-crm', leadId\]/.test(sync) && /\['sales', 'activity', leadId\]/.test(sync) && /\['onboarding-link', leadId\]/.test(sync), "…the CRM panel, the activity and the sign-up link status");
  ok(/BroadcastChannel/.test(sync), "…and other tabs hear it");
  ok(/onLeadChanged\(\(\{ leadId, patch, optimistic \}\) => \{/.test(useInbox) && /if \(!optimistic\) void patchOneLead\(leadId\);/.test(useInbox), "the Inbox shows the chosen values at once, and re-reads the ONE lead once the server has answered");
  ok(/next_action, next_action_date, next_action_note'/.test(useInbox), "the Inbox reads the next action, so the thread header shows it");
  ok((useOut.match(/notifyLeadChanged\(leadId, syncOriginRef\.current\)/g) ?? []).length === 2, "Outreach announces both write paths (admin table, sales functions)");
  ok(/detail\?\.origin === syncOriginRef\.current\) return/.test(useOut), "…and skips only its OWN notice");
  /* 2026-09-28 (Sales Experience): the pill and the star call src/lib/leadQuickActions.ts, which announces
     after BOTH writes — the same rule, now in one place shared with Focus Mode. */
  {
    const qa = read("src/lib/leadQuickActions.ts");
    ok(/markLeadInterested\(c\.leadId/.test(inbox) && /setLeadPipelineStatus\(c\.leadId/.test(inbox) && (qa.match(/notifyLeadChanged\(leadId\);/g) ?? []).length === 2, "the Inbox status pill and star announce too (through the one quick-action path)");
  }
  const saveFn = crm.slice(crm.indexOf("function useSave("), crm.indexOf("/* ── WORK"));
  ok(/if \(r\.ok\) \{ toast\(\{ title: okText \}\); notifyLeadChanged\(leadId, undefined, patch\); \}/.test(saveFn), "the CRM panel announces only after the server's yes, carrying the accepted values");
  ok(/if \(patch\) \{ qc\.setQueryData\(key, before \?\? null\); notifyLeadChanged\(leadId\); \}/.test(saveFn) && /variant: 'destructive'/.test(saveFn), "a refused save puts the old values back everywhere (a plain notice = every reader re-reads) and says why");
  ok(/notifyLeadChanged\(leadId, undefined, patch, true\)/.test(saveFn) && saveFn.indexOf("patch, true") < saveFn.indexOf("await leadRpc"), "the chosen values reach Outreach, the Inbox and other tabs before the server answers");
  ok(/if \(optimistic\) return;/.test(sync) && /if \(detail\?\.optimistic\) return;/.test(useOut), "…and nobody re-reads (or refetches) until it has");
  ok(/next_action: a\.nextAction, next_action_date:/.test(crm), "the next action shows in the open panel the moment Save is pressed");
  ok(/postMessage\(\{ leadId, patch, optimistic \}\)/.test(sync), "other tabs get the values too");
  ok(/if \(detail\?\.patch\)/.test(useOut), "Outreach shows the accepted values at once, then re-reads");
}

console.log("── security ──");
{
  const mig = read("supabase/migrations/20260928120000_sales_readiness.sql");
  for (const fn of ["lead_log_contact", "lead_onboarding_link_event"]) {
    const body = mig.slice(mig.indexOf(`function public.${fn}(`), mig.indexOf("$$;", mig.indexOf(`function public.${fn}(`)));
    ok(/^[\s\S]{0,400}perform public\._require_work\(_lead_id\);/.test(body.slice(body.indexOf("begin"))), `${fn}: role + ownership checked first (own lead allowed, another rep's refused)`);
    ok(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(mig), `${fn}: anon cannot call it`);
  }
  ok(/revoke insert, update, delete, truncate on public\.onboarding_link_events from authenticated/.test(mig) && !/create policy[^;]*onboarding_link_events for (insert|update|delete|all)/.test(mig), "onboarding_link_events: no browser writes at all");
  ok(/lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(mig.slice(mig.indexOf("create policy onboarding_link_events_select"))), "…a salesperson reads only their own leads' rows");
  ok(/if v_hit\.lead_id is not null then\s+return jsonb_build_object\('ok', false, 'error', 'exists'/.test(mig), "sales_add_lead: an existing business is refused (no re-adding, no stealing)");
  const sp = read("supabase/functions/sales-performance/index.ts");
  ok(/if \(actor\.role === "sales"\) personId = actor\.id;/.test(sp), "sales-performance: a salesperson is ALWAYS themselves, whatever the body says");
  ok(/resolveActor\(req, service\)/.test(sp) && !/\.(insert|update|upsert|delete)\(/.test(sp), "…resolves the role server-side and never writes");
  ok(!/amount_paid:\s*l\.amount_paid[^\n]*\n[^\n]*json\(/.test(sp) && /ok: true, scope:/.test(sp), "…returns the fold (counts), not the lead rows");
  ok(canOpenRoute("sales", "/sales-dashboard") && !canOpenRoute("sales", "/") && !canOpenRoute("sales", "/review-replies") && !canOpenRoute("sales", "/paid-clients"), "routes: Sales opens the dashboard, never the admin Dashboard, Review Replies or Paid clients");
  ok(/\[functions\.sales-performance\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml names the new function");
  const dialog = read("src/components/LeadDetailDialog.tsx");
  ok(/perms\.clientDelivery && <TabsTrigger value="client"/.test(dialog), "the Client tab (delivery, payment, private note) is admin-only");
}

console.log("── Next Action stays human-set ──");
{
  const mig = read("supabase/migrations/20260928120000_sales_readiness.sql");
  const logFn = mig.slice(mig.indexOf("function public.lead_log_contact("), mig.indexOf("$$;", mig.indexOf("function public.lead_log_contact(")));
  ok(!/next_action|status\s*=/.test(logFn.slice(logFn.indexOf("begin"))), "lead_log_contact writes activity only — no status, no next action");
  const trg = mig.slice(mig.indexOf("function public.trg_onboarding_link_sent("), mig.indexOf("$$;", mig.indexOf("function public.trg_onboarding_link_sent(")));
  ok(!/next_action/.test(trg), "the onboarding trigger never touches the next action");
  const crm = read("src/components/LeadCrmPanel.tsx");
  const logUi = crm.slice(crm.indexOf("function LogContact("), crm.indexOf("function InternalNote("));
  ok(/'lead_log_contact'/.test(logUi) && !/lead_set_follow_up/.test(logUi), "logging an outcome never schedules a follow-up");
  /* The outcome and channel allowlists were extended 2026-09-28 (20260928210000, the one contact-method
     set): these two read the NEWEST definition; the checks above still read the original migration. */
  const newest = read("supabase/migrations/20260930120000_social_profiles.sql"); // lead_log_contact's newest (Facebook, Instagram, connection_sent)
  const outcomes = newest.match(/_outcome not in \(([^)]*)\)/)?.[1].replace(/\s+/g, " ") ?? "";
  ok(CALL_OUTCOMES.every((o) => outcomes.includes(`'${o.value}'`)) && (outcomes.match(/'/g) ?? []).length / 2 === CALL_OUTCOMES.length, "the outcome list is lead_log_contact's allowlist, exactly");
  const channels = newest.match(/_channel not in \('call'[^)]*\)/)?.[0] ?? "";
  ok(CONTACT_CHANNEL_OPTIONS.every((c) => channels.includes(`'${c.value}'`)), "the channel list is lead_log_contact's allowlist");
  /* The CHECK's NEWEST definition (20260928160000 added facebook + email_research). */
  const srcMig = read("supabase/migrations/20260928160000_self_sourced_handoff.sql");
  ok(Object.keys(LEAD_SOURCE_LABELS).every((k) => new RegExp(`'${k}'`).test(srcMig.slice(srcMig.indexOf("outreach_leads_lead_source_check"), srcMig.indexOf("validate constraint")))), "every source label is allowed by the column's CHECK");
}

console.log("── the call script is said by whoever is signed in ──");
{
  ok(callerFirstName("Sam Jones") === "Sam" && callerFirstName(null) === "Paul" && callerFirstName("  ") === "Paul", "a salesperson's first name; nobody known → the book owner's");
  const lib = read("src/lib/coldCallPlaybook.ts");
  ok(!/It\\'s Paul from Findable/.test(lib), "no script line hardcodes Paul any more");
  const script = lib.slice(lib.indexOf("const callScript: string[] = [];"), lib.indexOf("return {", lib.indexOf("const callScript: string[] = [];")));
  ok(!/—|–/.test(script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no em or en dash in the call script");
}

console.log("── payment: the server says paid, never the URL ──");
{
  const fo = read("supabase/functions/findable-onboarding/index.ts");
  const ps = fo.slice(fo.indexOf('if (action === "payment_status")'), fo.indexOf('if (action === "gbp_access")'));
  ok(ps.length > 100 && !/\.(insert|update|upsert|delete)\(/.test(ps), "payment_status only READS — visiting the success URL cannot mark anyone paid");
  ok(/paid = st === "paid" \|\| PAID_OR_BEYOND\.has\(st\)/.test(ps) && /Number\(l\.amount_paid \?\? 0\) > 0/.test(ps), "…and answers from the row the webhook wrote");
  const ck = read("supabase/functions/findable-checkout/index.ts");
  ok(/form\.set\("success_url", `\$\{back\}\$\{back\.includes\("\?"\) \? "&" : "\?"\}paid=1`\);/.test(ck), "checkout's success_url is unchanged (no token added)");
  const wh = read("supabase/functions/stripe-webhook/index.ts");
  ok(/mustWrite/.test(wh) && /alreadyPaid/.test(wh), "the webhook's idempotency is untouched (mustWrite, alreadyPaid)");
  const flow = siteRead("src/components/OnboardingFlow.tsx");
  if (flow) {
    const paid = flow.slice(flow.indexOf("{/* ---------- PAID ----------"), flow.indexOf("{/* ---------- Q2 DONE ---------- */}"));
    ok(/paymentState === "confirmed" && \(/.test(paid) && paid.indexOf('paymentState === "confirmed"') < paid.indexOf("Payment confirmed"), "findable-site: 'Payment confirmed' renders only once the server confirmed it");
    ok(/action: "payment_status"/.test(flow) && /setPaymentState\("pending"\)/.test(flow), "…polls payment_status and falls back to 'still confirming', never to 'paid'");
    ok(paid.indexOf("Step 1 of 2 · Your Google Business Profile") > 0 && paid.indexOf("Step 1 of 2") < paid.indexOf("Step 2 of 2"), "…and the first outstanding step is Google Business Profile access");
    ok(!/type="password"|password\s*[:=]|Google password"\s*\/>|name="password"/i.test(paid) && /We never ask for your Google password/.test(paid), "…with no password or login field anywhere, and says so");
    ok(/GBP_ACCESS_COPY\.ask/.test(paid), "…showing the one configured address (GBP_ACCESS_COPY, synced to GBP_MANAGER_EMAIL)");
    ok(/preview: params\.get\("preview"\) === "1"/.test(flow), "findable-site passes preview=1 to prefill");
  } else ok(true, "(findable-site not beside this checkout: its screen assertions skipped)");
}

console.log("── GBP access: three states, never merged ──");
{
  const fo = read("supabase/functions/findable-onboarding/index.ts");
  const g = fo.slice(fo.indexOf('if (action === "gbp_access")'), fo.indexOf("// ── submit"));
  ok(/if \(st !== "paid" && !PAID_OR_BEYOND\.has\(st\)\) return json\(\{ ok: false, error: "not_paid" \}, 403\);/.test(g), "gbp_access answers only for a PAID row");
  ok(/if \(ev !== "shown" && !GBP_STATUS\.has\(ev\)\)/.test(g) && /patch\.gbp_status = ev; patch\.gbp_status_at = now;/.test(g), "the client's answer is stored as what they SAY (gbp_status + time)");
  ok(!/delivery_checklist|gbp_access_confirmed/.test(g), "…and can never set Findable's confirmation");
  ok(DELIVERY_CHECKLIST_ITEMS.some((i) => i.key === GBP_ACCESS_CHECKLIST_KEY && i.kind === "tick"), "Findable's confirmation is a separate, hand-ticked checklist item");
  ok(/their word/.test(gbpClientSaysLabel("done")) && gbpClientSaysLabel(null) === "no answer yet", "'I've invited you' reads as the client's word, not access");
  ok(/export const GBP_MANAGER_EMAIL = "[^"]+@[^"]+";/.test(read("src/lib/findableOffer.ts")), "the access address is one configured constant (synced across repos)");
}

console.log("── Google review replies are not a Findable deliverable ──");
{
  const promise = /reply to your (google )?reviews|reviews replied|your review replies|we(’|')?ll reply to your|replies to your reviews/i;
  ok(!promise.test(read("src/lib/welcomePackHtml.ts")), "the welcome pack promises no review replies");
  ok(!/strongest signal|signals? AI|AI (even )?reads (the )?(owner )?replies|one thing that helps most/i.test(read("src/lib/welcomePackHtml.ts")), "reviews are credibility, never claimed as a proven AI signal (Paul, 2026-09-28)");
  const flow = siteRead("src/components/OnboardingFlow.tsx");
  if (flow) {
    const items = flow.slice(flow.indexOf("const MONTHLY_WORK_ITEMS"), flow.indexOf("];", flow.indexOf("const MONTHLY_WORK_ITEMS")));
    ok(!/review/i.test(items), "findable-site: the monthly work list names no review work");
  }
  const site = siteRead("src/lib/site.ts");
  if (site) ok(!/reply to your reviews,/.test(site), "findable-site: OFFER_COPY no longer promises review replies");
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
