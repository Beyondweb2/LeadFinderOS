/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PRODUCTIVITY (Sales Experience release 4, docs/sales-experience.md §6): Focus Mode's queue and the
   saved views, the command palette, recent leads, safe shortcuts, the one Interested / Not-interested path.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { focusQueue, linkedInSearchUrl, FOCUS_VIEWS } from "../src/lib/focusQueue.ts";
import { goTarget, isPaletteKey, isTypingTarget, GO_SHORTCUTS } from "../src/lib/shortcuts.ts";
import { canOpenRoute } from "../src/lib/access.ts";
import type { SalesWorkspace } from "../src/lib/salesWorkspace.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const pl = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Biz ${id}`, at: null, warmth: null, ...extra });
const w = {
  nextActions: [{ kind: "reply_waiting", leadId: "a", name: "Biz a", title: "New WhatsApp reply", detail: "Waiting 2h", at: null, tone: "blue", link: "whatsapp" }, { kind: "going_cold", leadId: "b", name: "Biz b", title: "Warm lead going cold", detail: "x", at: null, tone: "amber", link: "whatsapp" }],
  followUps: { overdue: [pl("c", { detail: "Call" })], dueToday: [pl("d"), pl("c")], repliedUnanswered: [pl("a")], interestedUntouched: [], signupSent: [pl("e", { detail: "Not opened yet" })], goingCold: [pl("b")] },
  pipeline: [{ key: "interested", label: "Interested", count: 1, leads: [pl("f", { warmth: "warm" })] }, { key: "replied", label: "Replied", count: 1, leads: [pl("a", { warmth: "needs_follow_up" })] }],
} as unknown as SalesWorkspace;

console.log("\n── Focus Mode's queue and the saved views ──");
ok(focusQueue(w, "next").map((i) => i.leadId).join() === "a,b", "default: the dashboard's next best actions, in its order");
ok(focusQueue(w, "follow_up_today").map((i) => i.leadId).join() === "c,d", "follow up today = overdue then due today, each lead once");
ok(focusQueue(w, "overdue")[0].why === "Call", "a follow-up shows the person's own Next Action");
ok(focusQueue(w, "interested")[0].leadId === "f" && focusQueue(w, "warm")[0].leadId === "f", "interested and warm views");
ok(focusQueue(w, "signup_sent")[0].why === "Not opened yet" && focusQueue(w, "going_cold")[0].leadId === "b" && focusQueue(w, "replied")[0].leadId === "a", "signup sent / going cold / replied views");
ok(focusQueue(w, "nonsense").length === 2, "an unknown view falls back to next best actions");
ok(FOCUS_VIEWS.length === 8, "eight saved views");
ok(linkedInSearchUrl("Acme Locks", "Leeds") === "https://www.linkedin.com/search/results/all/?keywords=Acme%20Locks%20Leeds" && linkedInSearchUrl(null, null) === null, "LinkedIn is a search link, never a scrape");

console.log("\n── shortcuts are safe ──");
const el = (tag: string, extra: Record<string, unknown> = {}) => ({ tagName: tag.toUpperCase(), isContentEditable: false, closest: () => null, ...extra });
ok(isTypingTarget(el("input")) && isTypingTarget(el("textarea")) && isTypingTarget(el("div", { isContentEditable: true })) && !isTypingTarget(el("button")) && !isTypingTarget(null), "never while typing");
ok(goTarget("g", 1000, "w", 1500) === "/inbox" && goTarget("g", 1000, "w", 3000) === null && goTarget("x", 1000, "w", 1100) === null, "g then w → WhatsApp, within the window only");
ok(isPaletteKey({ key: "k", ctrlKey: true, metaKey: false }) && isPaletteKey({ key: "K", ctrlKey: false, metaKey: true }) && !isPaletteKey({ key: "k", ctrlKey: false, metaKey: false }), "Ctrl/Cmd + K");
ok(GO_SHORTCUTS.every((g) => canOpenRoute("sales", g.to)), "every go-to shortcut is a page Sales may open");
for (const file of ["src/lib/shortcuts.ts", "src/components/CommandPalette.tsx"]) {
  const s = read(file);
  ok(!/\.rpc\(|functions\.invoke|\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(s), `${file}: opens things only — no write, no send`);
}
const focus = read("src/pages/Focus.tsx");
const keyHandler = focus.slice(focus.indexOf("const onKey = (e: KeyboardEvent)"), focus.indexOf("window.addEventListener('keydown', onKey)"));
ok(/go\(1\)/.test(keyHandler) && !/quick\(|save|rpc|invoke/.test(keyHandler), "Focus Mode's keys only move between leads");

console.log("\n── one CRM, no second copy ──");
ok(/<LeadWorkPanel key=\{item\.leadId\} leadId=\{item\.leadId\} \/>/.test(focus) && /<LeadHookPanel key=\{item\.leadId\} leadId=\{item\.leadId\} \/>/.test(focus), "Focus reuses the lead workspace's own panels (log contact, Next Action, notes, audit)");
ok(/markLeadInterested\(lead\.id, perms\.editLeadRecord\)/.test(focus) && /setLeadPipelineStatus\(lead\.id, 'not_interested', perms\.editLeadRecord\)/.test(focus), "Focus's Interested / Not interested use the one path");
const inbox = read("src/pages/Inbox.tsx");
ok(/markLeadInterested\(c\.leadId, perms\.editLeadRecord\)/.test(inbox) && /setLeadPipelineStatus\(c\.leadId, status, perms\.editLeadRecord\)/.test(inbox) && !/mode: 'suppress_lead', lead_id: c\.leadId/.test(inbox), "…and so does the Inbox (the queue stop is written once)");
const qa = read("src/lib/leadQuickActions.ts");
ok((qa.match(/mode: 'suppress_lead'/g) ?? []).length === 1 && /if \(!isAdmin && status === 'not_interested'\)/.test(qa), "a salesperson's not-interested stops the queue, once, in one place");
ok(canOpenRoute("sales", "/focus") && /<Route path="\/focus" element=\{<Focus \/>\} \/>/.test(read("src/App.tsx")), "Focus Mode is routed and open to Sales");

console.log("\n── the palette and recent leads ──");
const pal = read("src/components/CommandPalette.tsx");
ok(/canOpenRoute\(role, g\.to\)/.test(pal), "the palette never offers a page the role cannot open");
ok(/leadSourceFor\(role\)\.table/.test(pal) && /\.eq\('is_archived', false\)/.test(pal), "lead search reads under the person's own permissions (the sales view for Sales), archived excluded");
const rec = read("src/hooks/useRecentLeads.ts");
ok(/\.eq\('actor_user_id', user!\.id\)/.test(rec) && /\.eq\('sent_by_user_id', user!\.id\)/.test(rec), "recent leads = what THIS person worked (their activity, their own sends) — not random");
ok(/<CommandPalette \/>/.test(read("src/components/AppLayout.tsx")), "the palette lives in the shell (every page)");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
