/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NEXT ACTION IS HUMAN-SET ONLY (Paul, 2026-09-28).

   A lead's next action (outreach_leads.next_action / next_action_date) is written only when a person
   chooses one in the next-action controls. Nothing automatic may write one — not adding a lead,
   claiming, sending, a reply, an audit, a status change, the queue or any cron. Clearing to 'none'
   (marking done, marking paid/lost, the Dashboard's clear) is allowed: it removes, never invents.

   This suite sweeps the WRITERS, so a new automatic path fails here the day it is written:
     1. every status → statusUpdatePatch writes no next action;
     2. no edge function (queue, sender, inbound, audits, cron) writes next_action at all;
     3. every SPA write of next_action is on a short allowlist, and outside the manual editor it only
        ever writes 'none';
     4. in the database, the only function that writes a chosen next action is lead_set_follow_up
        (manual, role + ownership checked); no trigger touches it; the default is 'none';
     5. the manual paths are still there for both roles.
   The live proof (claim, set/change/clear as admin and sales, another rep refused, note kept) is
   supabase/tests/next-action-human-only.sql.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { statusUpdatePatch } from "../src/lib/statusPatch.ts";
import { planSalesPatch } from "../src/lib/salesPatchPlan.ts";
import { OUTREACH_STATUS_OPTIONS, PIPELINE_STATUS_OPTIONS } from "../src/types/outreach.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*--.*$/gm, "");
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
/* A WRITE of the field: an object key (`next_action:` / `"next_action":`), an assignment
   (`.next_action =`), or an RPC argument (`_next_action:`). A select string or a comparison is a read. */
const WRITE_RE = /(?:^|[\s{,(])["']?_?next_action(?:_date)?["']?\s*:(?!:)|\.next_action(?:_date)?\s*=(?!=)/;
/* …ignoring a switch label and a type declaration (`next_action: string | null;`), which are not writes. */
const TYPE_DECL = /^\s*(?:readonly\s+)?_?next_action(?:_date)?\??:\s*(?:string|NextActionType|Database\[|null)[^=]*;?\s*$/;
const WRITE = { test: (src: string) => src.split("\n").some((l) => WRITE_RE.test(l) && !/^\s*case\s/.test(l) && !TYPE_DECL.test(l)) };

console.log("── 1. no status change writes a next action ──");
{
  const statuses = new Set([...OUTREACH_STATUS_OPTIONS, ...PIPELINE_STATUS_OPTIONS].map((o) => o.value as string));
  ok(statuses.size > 15, `swept ${statuses.size} statuses`);
  const writers = [...statuses].filter((s) => { const p = statusUpdatePatch(s as never) as Record<string, unknown>; return "next_action" in p || "next_action_date" in p; });
  ok(writers.length === 0, `no status writes next_action / next_action_date (${writers.join(", ") || "none"})`);
  ok(!("next_action" in statusUpdatePatch("site_sent" as never)), "site_sent no longer schedules a follow-up");
  ok(!("next_action" in statusUpdatePatch("replied" as never)), "replied writes no task");
  for (const st of ["price_given", "not_interested", "won_pending_onboarding", "interested"]) {
    const p = planSalesPatch({ ...statusUpdatePatch(st as never) });
    ok(!p.steps.some((s) => s.fn === "lead_set_follow_up"), `a salesperson's ${st} change calls no follow-up function`);
  }
}

console.log("\n── 2. no edge function writes a next action (queue, senders, inbound, audits, cron) ──");
{
  const files = walk("supabase/functions");
  ok(files.length > 100, `swept ${files.length} edge files`);
  const writers = files.filter((p) => WRITE.test(strip(read(p))));
  ok(writers.length === 0, `no edge code writes next_action (${writers.join(", ") || "none"})`);
  for (const fn of ["process-whatsapp-queue", "send-whatsapp-message", "send-whatsapp-voice", "whatsapp-status", "create-ai-audit", "process-ai-audit-queue", "bulk-jobs", "daily-cron"]) {
    const dir = `supabase/functions/${fn}`;
    if (!fs.existsSync(path.join(root, dir))) continue;
    ok(!/next_action/.test(strip(walk(dir).map(read).join("\n"))), `${fn} does not touch next_action`);
  }
  ok(!/next_action/.test(strip(read("supabase/functions/_shared/whatsapp-inbound.ts"))), "a received reply writes no next action (whatsapp-inbound)");
}

console.log("\n── 3. SPA writes: a short allowlist; outside the editor only ever 'none' ──");
{
  const ALLOWED: Record<string, string> = {
    "src/hooks/useOutreach.ts": "updateNextAction (the manual editor) + addLead / bulkImport inserting 'none'",
    "src/pages/Dashboard.tsx": "the Next Actions card's Clear / Clear all ('none')",
    "src/lib/demoLeads.ts": "in-memory demo rows, never written to the database",
    "src/lib/salesPatchPlan.ts": "a salesperson's manual edit → lead_set_follow_up",
    "src/lib/leadRpc.ts": "runs that plan (lead_set_follow_up)",
    "src/components/LeadCrmPanel.tsx": "the manual Next action control (and the meeting's one Save: time + 'Meeting')",
    "src/lib/leadOutcome.ts": "Not interested clears the Next Action; a logged Call back / Meeting booked saves Call / Meeting (no day)",
    /* 2026-10-02: ONE write for every screen (src/lib/nextActionWrite.ts), ONE form (NextActionForm). */
    "src/lib/nextActionWrite.ts": "THE one next-action write (lead_set_follow_up / lead_set_call_booked), both roles",
    "src/components/NextActionForm.tsx": "the one form: hands the person's pick to the write on Save / Clear",
    "src/components/NextActionEditor.tsx": "the Outreach cell: the form, and its ✓ Done ('none')",
    /* 2026-10-04 (fix workstream 5): the stale-screen EXPECTATION sent beside a write — what the screen showed. */
    "src/lib/nextActionStale.ts": "the snapshot a screen showed, sent as lead_set_follow_up's _expected — never a write itself",
  };
  const files = walk("src").filter((p) => !p.startsWith("src/integrations/") && !p.startsWith("src/types/"));
  const writers = files.filter((p) => WRITE.test(strip(read(p))));
  const unexpected = writers.filter((p) => !ALLOWED[p]);
  ok(unexpected.length === 0, `every SPA writer is on the allowlist (${unexpected.join(", ") || "all listed"})`);
  const hook = strip(read("src/hooks/useOutreach.ts"));
  const inserts = [...hook.matchAll(/next_action:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  ok(inserts.length >= 2 && inserts.every((v) => /^'none'/.test(v) || v.startsWith("nextAction")), `useOutreach writes a chosen action only in updateNextAction; its inserts write 'none' (${inserts.join(" | ")})`);
  ok(/const r = await saveNextAction\(leadId, \{\n\s+nextAction,/.test(hook), "updateNextAction writes exactly what the person picked (through the one write)");
  const dash = strip(read("src/pages/Dashboard.tsx"));
  ok([...dash.matchAll(/next_action:\s*'([a-z_0-9]+)'/g)].every((m) => m[1] === "none"), "the Dashboard only clears");
  const editor = strip(read("src/components/NextActionEditor.tsx"));
  const form = strip(read("src/components/NextActionForm.tsx"));
  ok(!/useEffect|setTimeout/.test(editor) && !/useEffect|setTimeout/.test(form) && /onClick=\{\(\) => void save\(\)\}/.test(form), "nothing auto-saves: the cell and the form save only when the person presses Save (or Clear / Done)");
  const outcome = strip(read("src/lib/leadOutcome.ts"));
  /* 2026-10-02 (Paul): a logged Call back / Meeting booked SAVES Call / Meeting (no day) — a person's tap. */
  const outcomeWrites = [...outcome.matchAll(/_next_action:\s*([^,]+),/g)].map((m) => m[1].trim());
  ok(outcomeWrites.length === 2 && outcomeWrites.includes("'none'") && outcomeWrites.includes("plan.setNextAction") && /setNextAction: 'call' \| 'meeting' \| null;/.test(read("src/lib/leadState.ts")), `a logged outcome clears ('none') or saves only Call / Meeting (${outcomeWrites.join(" | ")})`);
  const dialog = strip(read("src/components/LeadDetailDialog.tsx"));
  ok([...dialog.matchAll(/onNextActionChange\(lead\.id, '([a-z_]+)'/g)].every((m) => m[1] === "none"), "the lead dialog's only automatic next-action call clears it (paid / lost)");
}

console.log("\n── 4. the database ──");
{
  const migs = fs.readdirSync(path.join(root, "supabase/migrations")).filter((m) => m.endsWith(".sql")).sort();
  const latest = new Map<string, string>();
  for (const m of migs) {
    const sql = strip(read(`supabase/migrations/${m}`));
    for (const blk of sql.split(/(?=create or replace function )/i)) {
      const name = blk.match(/^create or replace function (?:public\.)?([a-z_0-9]+)\s*\(/i)?.[1];
      if (name) { const end = blk.search(/\$[a-z_]*\$\s*;/i); latest.set(name, end > 0 ? blk.slice(0, end) : blk); }
    }
  }
  const setters = [...latest.entries()].filter(([, b]) => /next_action\s*=\s*(?!'none')/i.test(b)).map(([n]) => n);
  /* 2026-10-02: lead_set_call_booked moves an EXISTING Meeting's day + time with the booking (one meeting time);
     it never sets a type (its next_action = 'meeting' is the WHERE). */
  const callBooked = latest.get("lead_set_call_booked") ?? "";
  ok(setters.every((n) => n === "lead_set_follow_up" || n === "lead_set_call_booked") && setters.includes("lead_set_follow_up"), `only lead_set_follow_up sets a chosen next action (${setters.join(", ")})`);
  ok(!/set next_action\s*=/i.test(callBooked) && /return public\.lead_set_follow_up\(_lead_id, 'meeting'/i.test(callBooked), "…lead_set_call_booked writes nothing itself: it books through lead_set_follow_up (one write, 2026-10-02)");
  ok(/perform public\._require_work\(_lead_id\);/.test(latest.get("lead_set_follow_up") ?? ""), "…and it checks role + ownership first");
  ok(!/next_action/i.test(latest.get("claim_lead") ?? "x next_action"), "claiming a lead does not touch next_action");
  ok(/'not_contacted', 'none'/.test(latest.get("sales_add_lead") ?? ""), "a salesperson's added lead starts at 'none'");
  /* Triggers are checked against the LIVE definitions (pg_trigger + pg_get_functiondef) in the SQL
     suite — migration files use several quoting styles and cannot be sliced reliably here. */
  const live = fs.existsSync(path.join(root, "supabase/tests/next-action-human-only.sql")) ? read("supabase/tests/next-action-human-only.sql") : "";
  ok(/no trigger on outreach_leads writes next_action/.test(live) && /column default is none/.test(live), "the live proof checks the triggers and the default");
}

console.log("\n── 5. manual editing stays, for both roles ──");
{
  const plan = planSalesPatch({ next_action: "call", next_action_date: "2026-10-02" });
  ok(plan.steps.length === 1 && plan.steps[0].fn === "lead_set_follow_up", "a salesperson's manual pick → lead_set_follow_up");
  ok(planSalesPatch({ next_action: "none", next_action_date: null }).steps[0]?.fn === "lead_set_follow_up", "…and a clear");
  ok(/const r = afterWrite\(await saveNextAction\(leadId, a, stateLead\(\)\)/.test(read("src/components/LeadCrmPanel.tsx")), "the CRM panel's Next action control saves what was picked (both roles, the one write)");
  ok(/<NextActionEditor/.test(read("src/components/OutreachTable.tsx")), "the Outreach table keeps its Next Action column editor");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
