/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PRODUCTIVITY (Sales Experience release 4, docs/sales-experience.md §6; Focus Mode retired 2026-10-01):
   where Focus Mode's useful parts went (Previous / Next in the lead popup, its lists on Sales, the recent
   WhatsApp messages in the popup), the command palette, recent leads, safe shortcuts, the one
   Interested / Not-interested path.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { linkedInSearchUrl } from "../src/lib/socialProfiles.ts";
import { goTarget, isPaletteKey, isTypingTarget, GO_SHORTCUTS } from "../src/lib/shortcuts.ts";
import { canOpenRoute } from "../src/lib/access.ts";
import type { SalesWorkspace } from "../src/lib/salesWorkspace.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

console.log("\n── Focus Mode is retired; its useful parts moved ──");
const dialog = read("src/components/LeadDetailDialog.tsx");
const table = read("src/components/OutreachTable.tsx");
ok(!fs.existsSync(path.join(root, "src/pages/Focus.tsx")) && !fs.existsSync(path.join(root, "src/lib/focusQueue.ts")), "the Focus page and its queue are deleted");
ok(/<Route path="\/focus" element=\{<FocusRedirect \/>\} \/>/.test(read("src/App.tsx")) && /outreachLeadLink\(lead\)/.test(read("src/components/FocusRedirect.tsx")), "/focus redirects to Outreach (a ?lead= opens that lead)");
ok(!/'\/focus'/.test(read("src/components/AppSidebar.tsx") + read("src/components/MobileBottomNav.tsx") + read("src/lib/shortcuts.ts")) && !/\/focus|FOCUS_VIEWS|saved view/.test(read("src/components/CommandPalette.tsx").replace(/Focus Mode and its saved views retired/, "")), "no menu, shortcut or palette entry leads to Focus Mode");
ok(/stepper\?: LeadStepper \| null;/.test(dialog) && /<StepperBar s=\{stepper\} \/>/.test(dialog), "the lead popup has Previous / Next");
const keys = dialog.slice(dialog.indexOf("onKeyDown={(e) => {\n          if (!stepper"), dialog.indexOf("{stepper && stepper.total > 1"));
ok(/typingIn\(e\.target\)/.test(keys) && /ArrowRight/.test(keys) && /ArrowLeft/.test(keys) && !/rpc|invoke|save|update/.test(keys), "← / → only move between leads, never while typing, never write");
ok(/filteredAndSortedLeads\.findIndex\(\(l\) => l\.id === detailLead\.id\)/.test(table) && /stepper=\{detailStepper\}/.test(table), "Outreach steps through its own filtered, sorted list (every page)");
ok(/stepPlace\.current/.test(table), "a lead that drops out of the list keeps its place: Next opens the one that took it");
const groups = read("src/components/salesDash/sections.tsx");
for (const k of ["meetings", "warm", "signupSent", "goingCold"]) ok(new RegExp(`key: '${k}'`).test(groups), `Sales → What to do next has the "${k}" list`);
ok(/followUps\.warm\.push\(pl\)/.test(read("src/lib/salesWorkspace.ts")), "the warm list is filled by the same warmth reading");
const recent = read("src/components/RecentWhatsApp.tsx");
ok(/context !== 'inbox' && <RecentWhatsApp leadId=\{lead\.id\} \/>/.test(dialog) && /\.limit\(RECENT_WHATSAPP_COUNT\)/.test(recent) && !/\.insert\(|\.update\(|functions\.invoke|\.rpc\(/.test(recent), "the latest WhatsApp messages are in the popup (read-only; the Inbox shows the thread itself)");
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

console.log("\n── one CRM, no second copy ──");
ok(/applyOutcome\(/.test(read("src/components/LeadCrmPanel.tsx")), "Interested / Not interested are the Work panel's outcomes — the one path");
const inbox = read("src/pages/Inbox.tsx");
ok(/markLeadInterested\(c\.leadId, perms\.editLeadRecord\)/.test(inbox) && /setLeadPipelineStatus\(c\.leadId, status, perms\.editLeadRecord\)/.test(inbox) && !/mode: 'suppress_lead', lead_id: c\.leadId/.test(inbox), "…and so does the Inbox (the queue stop is written once)");
const qa = read("src/lib/leadQuickActions.ts");
ok((qa.match(/mode: 'suppress_lead'/g) ?? []).length === 1 && /if \(status === 'not_interested'\)/.test(qa), "not-interested stops the queue, once, in one place — for both roles (the admin path wrote no suppression, 2026-09-30)");

console.log("\n── the palette and recent leads ──");
const pal = read("src/components/CommandPalette.tsx");
ok(/canOpenRoute\(role, g\.to\)/.test(pal), "the palette never offers a page the role cannot open");
ok(/leadSourceFor\(role\)\.table/.test(pal) && /\.eq\('is_archived', false\)/.test(pal), "lead search reads under the person's own permissions (the sales view for Sales), archived excluded");
const rec = read("src/hooks/useRecentLeads.ts");
ok(/\.eq\('actor_user_id', user!\.id\)/.test(rec) && /\.eq\('sent_by_user_id', user!\.id\)/.test(rec), "recent leads = what THIS person worked (their activity, their own sends) — not random");
ok(/<CommandPalette \/>/.test(read("src/components/AppLayout.tsx")), "the palette lives in the shell (every page)");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
