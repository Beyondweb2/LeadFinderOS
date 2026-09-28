/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES EXPERIENCE — RELEASE 1 (2026-09-28, docs/sales-experience.md): WhatsApp + the dashboard.
   Pins, from the pure rules and the source (the live proof is supabase/tests/whatsapp-unread.sql,
   always rolled back):
     · conversation states: unread (per person, from the tracking start), waiting on us (first
       unanswered HUMAN reply), waiting on them, failed, queued, follow-up due, template required;
     · the exact-conversation deep link, used by the dashboard and the lead panel;
     · the workspace fold: stages, warmth, next actions (one per lead, most urgent first, Next Action
       read never written), follow-up groups, the feed, health, trends ("not enough data"), milestones,
       targets (private: only the person's own, never read by the server for anyone else), the recap;
     · navigation: Sales sees "WhatsApp", the page says "WhatsApp Inbox", one route;
     · security shape of the unread SQL.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  conversationState, formatWaiting, isFollowUpDue, passesQuickFilter, UNREAD_TRACKING_START, whatsAppLinkForLead, londonToday,
} from "../src/lib/conversationState.ts";
import { foldSalesPerformanceWithFacts, foldSalesPerformance, type FoldInput } from "../src/lib/salesPerformance.ts";
import { foldSalesWorkspace, parseTargets, stageOf, warmthOf, TREND_MIN_CONTACTED, type WorkspaceLead } from "../src/lib/salesWorkspace.ts";
import { leadTarget } from "../src/lib/salesLinks.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const NOW = Date.parse("2026-10-01T15:00:00Z");
const H = 3_600_000, D = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const msg = (direction: string, ms: number, status = direction === "inbound" ? "received" : "delivered", body = "hello there") => ({ direction, status, created_at: at(ms), body });

console.log("\n── conversation states ──");
{
  const s = conversationState({ messages: [msg("outbound", NOW - 5 * H), msg("inbound", NOW - 2 * H)], lastReadAt: null, nowMs: NOW });
  ok(s.unread && s.waitingSinceMs === NOW - 2 * H && s.label === "Waiting 2h" && s.tone === "blue", "a reply nothing answered: unread, waiting 2h, blue");
  ok(s.windowOpen && !s.templateRequired, "the 24h window is open after a reply 2h ago");
  const read1 = conversationState({ messages: [msg("outbound", NOW - 5 * H), msg("inbound", NOW - 2 * H)], lastReadAt: at(NOW - H), nowMs: NOW });
  ok(!read1.unread && read1.waitingSinceMs !== null, "opening it clears UNREAD but not WAITING — reading is not answering");
  const answered = conversationState({ messages: [msg("inbound", NOW - 3 * H), msg("outbound", NOW - H)], lastReadAt: null, nowMs: NOW });
  ok(answered.waitingSinceMs === null && answered.waitingOnThem, "our real send after it: waiting on them");
  const two = conversationState({ messages: [msg("outbound", NOW - 10 * H), msg("inbound", NOW - 6 * H), msg("inbound", NOW - H)], lastReadAt: null, nowMs: NOW });
  ok(two.waitingSinceMs === NOW - 6 * H, "the timer runs from the FIRST unanswered reply");
  const auto = conversationState({ messages: [msg("outbound", NOW - 5 * H), msg("inbound", NOW - H, "received", "Thank you for your message. We will get back to you as soon as possible.")], lastReadAt: null, nowMs: NOW });
  ok(auto.waitingSinceMs === null && auto.unread, "an auto-responder is unread but never 'waiting on us'");
  const no = conversationState({ messages: [msg("outbound", NOW - 5 * H), msg("inbound", NOW - 2 * H, "received", "No thanks mate. Cheers anyway")], lastReadAt: null, nowMs: NOW });
  ok(no.unread && no.waitingSinceMs === null, "a clear no is unread, but never 'waiting on us'");
  const failedAfterReply = conversationState({ messages: [msg("inbound", NOW - 3 * H), msg("outbound", NOW - H, "failed")], lastReadAt: at(NOW), nowMs: NOW });
  ok(failedAfterReply.failed && failedAfterReply.tone === "red" && failedAfterReply.label === "Send failed", "our newest send failed: red, 'Send failed' outranks waiting");
  ok(failedAfterReply.waitingSinceMs !== null, "…and a failed send never counts as an answer");
  const old = conversationState({ messages: [msg("inbound", Date.parse(UNREAD_TRACKING_START) - H)], lastReadAt: null, nowMs: NOW });
  ok(!old.unread, "a reply from before tracking began is never unread");
  const closed = conversationState({ messages: [msg("outbound", NOW - 50 * H), msg("inbound", NOW - 30 * H), msg("outbound", NOW - 29 * H)], lastReadAt: at(NOW), nowMs: NOW });
  ok(!closed.windowOpen && closed.templateRequired, "30h since their last reply: template required");
  const queued = conversationState({ messages: [], lastReadAt: null, leadStatus: "queued", nowMs: NOW });
  ok(queued.queued && queued.label === "Queued", "a queued lead reads Queued");
  const due = conversationState({ messages: [msg("outbound", NOW - 50 * H)], lastReadAt: null, nextAction: "call", nextActionDate: londonToday(NOW), nowMs: NOW });
  ok(due.followUpDue && due.tone === "amber" && due.label === "Follow-up due", "a person's Next Action dated today: follow-up due, amber");
  ok(!isFollowUpDue("none", "2026-01-01", NOW) && !isFollowUpDue("call", null, NOW) && !isFollowUpDue(null, "2026-01-01", NOW), "no action / no date / 'none' is never due (absent means not due)");
  ok(isFollowUpDue("call", "2026-09-30", NOW) && !isFollowUpDue("call", "2026-10-02", NOW), "overdue is due; tomorrow is not");
  ok(formatWaiting(30_000) === "now" && formatWaiting(12 * 60_000) === "12m" && formatWaiting(2 * H) === "2h" && formatWaiting(3 * D) === "3d" && formatWaiting(NaN) === "now", "the timer reads now / 12m / 2h / 3d");
  ok(passesQuickFilter("unread", { unread: true, waitingSinceMs: null }) && !passesQuickFilter("waiting", { unread: true, waitingSinceMs: null }) && passesQuickFilter("all", { unread: false, waitingSinceMs: null }) && passesQuickFilter(undefined, { unread: false, waitingSinceMs: null }), "All / Unread / Waiting on us filters");
  ok(whatsAppLinkForLead("abc-1") === "/inbox?lead=abc-1" && leadTarget("whatsapp", "x")[0] === "/inbox?lead=x" && leadTarget("lead", "x")[0] === "/outreach", "one deep link: WhatsApp → /inbox?lead=, lead → Outreach's launch");
  const mig = read("supabase/migrations/20260929120000_whatsapp_unread.sql");
  ok(mig.includes(`timestamptz '${UNREAD_TRACKING_START.replace("T", " ").replace("Z", "+00")}'`), "the tracking start is the same instant in SQL and TS");
}

console.log("\n── the workspace fold ──");
const ME = "u-me", OTHER = "u-other";
const base = (id: string, extra: Partial<FoldInput["leads"][number]> = {}) => ({ id, business_name: `Biz ${id}`, campaign_id: null, status: "contacted", amount_paid: null, is_potential_work: false, lead_source: null, sold_by_user_id: null, ...extra });
const wm = (lead_id: string, direction: string, ms: number, extra: Record<string, unknown> = {}) => ({ lead_id, direction, template_name: direction === "outbound" ? "initial_contact" : null, status: direction === "outbound" ? "delivered" : "received", created_at: at(ms), body: "Yes please, tell me more", sent_by_user_id: direction === "outbound" ? ME : null, ...extra });
const input: FoldInput = {
  personId: ME, sinceMs: null, campaignNames: new Map(),
  leads: [
    base("fresh", { status: "new" }),
    base("contacted"),
    base("replied"),
    base("interested", { is_potential_work: true, status: "interested" }),
    base("signup"),
    base("won", { amount_paid: 99, status: "payment_received", sold_by_user_id: ME }),
    base("cold"),
    base("nope", { status: "not_interested" }),
  ],
  messages: [
    wm("contacted", "outbound", NOW - 2 * D),
    wm("replied", "outbound", NOW - 3 * D), wm("replied", "inbound", NOW - 3 * H),
    wm("interested", "outbound", NOW - 6 * D), wm("interested", "inbound", NOW - 5 * D),
    wm("signup", "outbound", NOW - 9 * D), wm("signup", "inbound", NOW - 8 * D), wm("signup", "outbound", NOW - 8 * D + H),
    wm("won", "outbound", NOW - 20 * D), wm("won", "inbound", NOW - 19 * D),
    wm("cold", "outbound", NOW - 30 * D), wm("cold", "inbound", NOW - 29 * D), wm("cold", "outbound", NOW - 28 * D),
    wm("nope", "outbound", NOW - 4 * D), wm("nope", "inbound", NOW - 4 * D + H),
    // someone else's hand send on my lead is not mine
    wm("fresh", "outbound", NOW - H, { sent_by_user_id: OTHER }),
  ],
  activity: [
    { lead_id: "interested", actor_user_id: ME, kind: "marked_interested", data: { on: true }, created_at: at(NOW - 5 * D + H) },
    { lead_id: "contacted", actor_user_id: ME, kind: "follow_up_set", data: { next_action: "call", date: "2026-09-29" }, created_at: at(NOW - 3 * D) },
  ],
  linkEvents: [{ lead_id: "signup", kind: "sent", channel: "whatsapp", actor_user_id: ME, created_at: at(NOW - 8 * D + H) }],
  hits: [],
};
const { result, facts } = foldSalesPerformanceWithFacts(input);
ok(JSON.stringify(result) === JSON.stringify(foldSalesPerformance(input)), "the refactor changes nothing: foldSalesPerformance === WithFacts.result");
const leadsMap = new Map<string, WorkspaceLead>(input.leads.map((l) => [l.id, { id: l.id, business_name: l.business_name, status: l.status, next_action: null, next_action_date: null, next_action_note: null, sold_at: null }]));
leadsMap.get("contacted")!.next_action = "call"; leadsMap.get("contacted")!.next_action_date = "2026-09-29"; leadsMap.get("contacted")!.next_action_note = "ask for the owner";
leadsMap.get("won")!.sold_at = at(NOW - 2 * H);
const before = JSON.stringify([...leadsMap.values()]);
const ws = foldSalesWorkspace({ personId: ME, facts, leads: leadsMap, audits: [{ lead_id: "replied", completed_at: at(NOW - 5 * H) }], activity: input.activity, nowMs: NOW, targets: { period: "week", contacts: 10, commission: 50 }, earnedGbp: null });
ok(JSON.stringify([...leadsMap.values()]) === before, "⛔ the fold never changes a lead or its Next Action");
const byId = new Map(facts.map((x) => [x.lead.id, x]));
ok(stageOf(byId.get("fresh")!) === "new", "someone else's hand send does not make MY lead contacted");
ok(stageOf(byId.get("contacted")!) === "contacted" && stageOf(byId.get("replied")!) === "replied" && stageOf(byId.get("interested")!) === "interested" && stageOf(byId.get("signup")!) === "signup_sent" && stageOf(byId.get("won")!) === "paid", "stages: contacted → replied → interested → signup sent → paid");
const counts = Object.fromEntries(ws.pipeline.map((p) => [p.key, p.count]));
ok(counts.new === 1 && counts.contacted === 1 && counts.replied === 2 && counts.paid === 1 && ws.notInterested === 1, "pipeline counts: not interested sits outside the stages");
ok(warmthOf(byId.get("replied")!, leadsMap.get("replied"), NOW) === "needs_follow_up", "a reply waiting on me: needs follow-up");
ok(warmthOf(byId.get("cold")!, leadsMap.get("cold"), NOW) === "going_cold", "nothing either way for 28 days: going cold");
ok(warmthOf(byId.get("won")!, leadsMap.get("won"), NOW) === null && warmthOf(byId.get("nope")!, leadsMap.get("nope"), NOW) === null && warmthOf(byId.get("fresh")!, leadsMap.get("fresh"), NOW) === null, "won, not interested and never-engaged leads have no temperature");
ok(ws.nextActions[0]?.kind === "reply_waiting" && ws.nextActions[0].leadId === "replied" && ws.nextActions[0].link === "whatsapp", "the most urgent action is the unanswered reply, and it opens WhatsApp");
ok(new Set(ws.nextActions.map((a) => a.leadId)).size === ws.nextActions.length, "one action per lead");
ok(!ws.nextActions.some((a) => a.leadId === "replied" && a.kind === "audit_ready"), "…the audit for the same lead does not add a second row");
ok(ws.nextActions.some((a) => a.kind === "follow_up_overdue" && a.leadId === "contacted" && a.detail.includes("ask for the owner") && a.tone === "red"), "an overdue Next Action shows with its note, red");
ok(ws.nextActions.some((a) => a.kind === "going_cold" && a.leadId === "cold"), "a going-cold lead is surfaced");
ok(ws.followUps.overdue.length === 1 && ws.followUps.repliedUnanswered.some((l) => l.id === "replied") && ws.followUps.signupSent.some((l) => l.id === "signup"), "follow-up groups: overdue, replied unanswered, signup sent");
ok(ws.waiting.length === 2 && ws.waiting[0].leadId === "interested" && ws.waiting[1].leadId === "replied" && ws.waiting[1].since === at(NOW - 3 * H), "response timer: two replies waiting, longest first (5 days, then 3h)");
ok(ws.today.replies === 1 && ws.today.won === 1 && ws.today.followUpsDue === 1 && ws.recap.followUpsRemaining === 1, "today: the reply, the win, the due follow-up");
ok(ws.activity.some((a) => a.kind === "reply" && a.leadId === "replied") && ws.activity.some((a) => a.kind === "payment" && a.leadId === "won") && ws.activity.some((a) => a.kind === "audit"), "the feed carries replies, the payment and the audit");
ok(ws.activity.every((a, i, arr) => i === 0 || arr[i - 1].at >= a.at), "the feed is newest first");
ok(!ws.trends.enough && /Not enough data yet/.test(ws.trends.reason ?? ""), `a handful of leads draws no trend — it says "Not enough data yet" (needs ${TREND_MIN_CONTACTED}+)`);
const ms = Object.fromEntries(ws.milestones.map((m) => [m.key, m]));
ok(ms.first_reply.achieved && ms.first_client.achieved && ms.first_interested.achieved && !ms.five_clients.achieved && ms.five_clients.progress === 1, "milestones: first reply / interested / client reached; 5 clients at 1 of 5");
ok(ms.earned_100.progress === null && !ms.earned_100.achieved, "£100 earned is never guessed without the earnings figure");
ok(ws.targets?.rows.find((r) => r.key === "contacts")?.target === 10 && ws.targets?.rows.find((r) => r.key === "commission")?.actual === null, "targets: progress where counted, commission blank until earnings exist");
ok(parseTargets({ contacts: "12", replies: -3, wins: "x", period: "month" })?.contacts === 12 && parseTargets({ replies: -3 }) === null && parseTargets(null) === null && parseTargets({ period: "month", wins: 2 })?.period === "month", "stored targets: only positive numbers survive; nothing set is null");

{
  // A reply older than REPLY_ACTION_DAYS: still in "Replied, unanswered", no longer a timer or an action.
  const inp2: FoldInput = { ...input, leads: [base("stale")], messages: [wm("stale", "outbound", NOW - 30 * D), wm("stale", "inbound", NOW - 20 * D), wm("stale", "inbound", NOW - 20 * D + H)], activity: [], linkEvents: [] };
  const r2 = foldSalesPerformanceWithFacts(inp2);
  const lm = new Map<string, WorkspaceLead>([["stale", { id: "stale", business_name: "Stale", status: "replied", next_action: null, next_action_date: null, next_action_note: null }]]);
  const w2 = foldSalesWorkspace({ personId: ME, facts: r2.facts, leads: lm, audits: [], activity: [], nowMs: NOW });
  ok(w2.followUps.repliedUnanswered.length === 1 && w2.waiting.length === 0 && !w2.nextActions.some((a) => a.kind === "reply_waiting"), "a 20-day-old unanswered reply stays in the queue but is not a timer or a 'new reply' action");
  ok(w2.nextActions.some((a) => a.kind === "going_cold"), "…it reads as going cold instead");
  const w3 = foldSalesWorkspace({ personId: ME, facts: foldSalesPerformanceWithFacts({ ...inp2, messages: [wm("stale", "outbound", NOW - 3 * D), wm("stale", "inbound", NOW - 2 * D), wm("stale", "inbound", NOW - 2 * D + 60_000)] }).facts, leads: lm, audits: [], activity: [], nowMs: NOW });
  ok(w3.activity.filter((a) => a.kind === "reply").length === 1, "two messages in a row are one 'replied' line in the feed");
}

console.log("\n── source: navigation, privacy, security ──");
{
  const side = read("src/components/AppSidebar.tsx"), mob = read("src/components/MobileBottomNav.tsx"), inbox = read("src/pages/Inbox.tsx");
  ok(/\{ title: role === 'sales' \? 'WhatsApp' : 'Inbox', url: '\/inbox'/.test(side) && (side.match(/url: '\/inbox'/g) ?? []).length === 1, "sales sidebar item says WhatsApp and is the one /inbox route");
  ok(/title: 'WhatsApp', url: '\/inbox'/.test(mob), "sales phone bar says WhatsApp");
  ok(/WhatsApp Inbox<\/h1>/.test(inbox), "the page is titled WhatsApp Inbox");
  ok(side.includes("useWhatsAppUnread") && mob.includes("useWhatsAppUnread"), "both navs show the unread badge from the one server count");
  ok(/searchParams\.get\('lead'\)/.test(inbox) && /next\.delete\('lead'\)/.test(inbox), "the Inbox opens ?lead= and drops it once a thread is chosen");
  ok(/markRead\(active\.phone\)/.test(inbox) && /visibilityState === 'visible'/.test(inbox), "a thread is marked read only when open AND on screen");
  ok(/active \? 'hidden md:block'/.test(inbox) && /Back to all conversations/.test(inbox), "phones switch list ↔ thread with a Back button");
  ok(/queueState\?\.paused/.test(inbox) && /QUEUE_PAUSED_LINE/.test(inbox), "both roles see a paused queue in the Inbox");
  const fn = read("supabase/functions/sales-performance/index.ts");
  ok(/targets: personId === actor\.id \? parseTargets\(body\.targets\) : null/.test(fn), "⛔ targets are used only for the person's own numbers");
  ok(!/user_preferences/.test(fn), "…and the server never reads anyone's preferences");
  ok(/if \(actor\.role === "sales"\) personId = actor\.id;/.test(fn), "a salesperson is still always themselves");
  const dialog = read("src/components/LeadDetailDialog.tsx");
  ok(/context !== 'inbox' && lead\.phone && \(\s*\n\s*<Link to=\{whatsAppLinkForLead\(lead\.id\)\}/.test(dialog), "every lead links to its WhatsApp thread (not inside the Inbox itself)");
  const mig = read("supabase/migrations/20260929120000_whatsapp_unread.sql");
  ok(/revoke all on public\.whatsapp_conversation_reads from anon/.test(mig) && /using \(user_id = \(select auth\.uid\(\)\)\)/.test(mig), "reads: own rows only, anon nothing");
  ok(!/for (insert|update|delete)/.test(mig), "…no browser write policy; only mark_whatsapp_read writes");
  ok(/revoke all on function public\.my_whatsapp_unread\(\) from public, anon/.test(mig) && /revoke all on function public\.mark_whatsapp_read\(text\) from public, anon/.test(mig), "both functions: anon revoked");
  ok(/v_role = 'sales' and \(m\.lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(mig) && /l\.assigned_to_user_id = v_uid and not public\.lead_is_client/.test(mig), "a salesperson's unread counts only their own non-client leads (the RLS sets)");
  ok(/greatest\(public\.whatsapp_conversation_reads\.last_read_at, excluded\.last_read_at\)/.test(mig), "a stale tab can never move a read time backwards");
  const page = read("src/pages/SalesDashboard.tsx");
  ok(!/amount_paid|stripe/i.test(page), "the dashboard page reads no payment field");
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
