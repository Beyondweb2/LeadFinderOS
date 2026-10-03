/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MONTHLY CLIENT UPDATE (closeout, 2026-10-02) — src/lib/monthlyUpdate.ts, the panel and the
   migration. What /terms promises, and nothing more:
     1. the measurement paragraph enumerates every arrival — no check, one check, like-for-like
        more / fewer / unchanged, and checks that are NOT like for like (never compared);
     2. it never says "audit", never "improved", never invents work: empty sections are left out, and
        "what we did" / "what happens next" are required before it can be marked sent;
     3. stored days print in UTC (no BST slip), months run from the payment month;
     4. the panel never sends, and the database side is admin-only with a sent row locked.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  composeMonthlyUpdate, comparableChecks, dayLabel, greetingName, measurementKind, measurementParagraph,
  missingForSend, monthLabel, updateMonths, usableCheck, type MonthlyCheck,
} from "../src/lib/monthlyUpdate.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const chk = (week: string, cg: [number, number], gm: [number, number], questions = 10, status = "complete"): MonthlyCheck =>
  ({ week_start: week, status, questions, named: { chatgpt: cg[0], gemini: gm[0] }, answered: { chatgpt: cg[1], gemini: gm[1] } });

console.log("── 1. the measurement paragraph, every arrival ──");
{
  const M = "2026-10-01";
  ok(measurementKind([]) === "none", "no checks → none");
  ok(/No AI visibility check was completed for October 2026/.test(measurementParagraph([], M)), "none says so, plainly");
  const running = { ...chk("2026-10-05", [1, 10], [1, 10]), status: "running" };
  ok(measurementKind([running]) === "none", "a check still running is not a measurement");
  const broken: MonthlyCheck = { week_start: "2026-10-05", status: "complete", questions: 10, named: { chatgpt: 1 }, answered: { chatgpt: 10 } };
  ok(!usableCheck(broken) && measurementKind([broken]) === "none", "a check missing an engine's counts is not used (absent is never zero)");

  const one = [chk("2026-10-05", [2, 10], [1, 10])];
  ok(measurementKind(one) === "single", "one check → single");
  const p1 = measurementParagraph(one, M);
  ok(/checked your AI visibility once in October 2026/.test(p1) && /2 of 10 answers on ChatGPT and 1 of 10 answers on Gemini/.test(p1), "single: the latest counts per engine");
  ok(/only check this month, so there is no change within the month to compare/.test(p1), "single: says there is nothing to compare");

  const more = [chk("2026-10-05", [1, 10], [0, 10]), chk("2026-10-12", [3, 10], [1, 10])];
  ok(measurementKind(more) === "more" && /more than in the first check of the month \(1 of 20 answers, now 4 of 20\)/.test(measurementParagraph(more, M)), "like for like, more named → 'more', with both counts");
  const fewer = [chk("2026-10-05", [3, 10], [1, 10]), chk("2026-10-19", [1, 10], [0, 10])];
  ok(measurementKind(fewer) === "fewer" && /fewer than in the first check/.test(measurementParagraph(fewer, M)), "like for like, fewer named → 'fewer' (bad news is reported too)");
  const same = [chk("2026-10-05", [2, 10], [1, 10]), chk("2026-10-12", [1, 10], [2, 10]), chk("2026-10-19", [2, 10], [1, 10])];
  ok(measurementKind(same) === "unchanged" && /checked your AI visibility 3 times/.test(measurementParagraph(same, M)) && /the same as the first check of the month/.test(measurementParagraph(same, M)), "like for like, same total → unchanged");

  /* RG's real first check: 10 questions, only 5 answered per engine — not like for like with a full one. */
  const rgReal = chk("2026-09-28", [1, 5], [1, 5]);
  const full = chk("2026-10-05", [3, 10], [2, 10]);
  ok(!comparableChecks(rgReal, full) && measurementKind([rgReal, full]) === "not_comparable", "a partial check is never compared with a full one");
  ok(/did not cover the same number of answers, so we have not compared them/.test(measurementParagraph([rgReal, full], M)), "not comparable: says so");
  ok(!comparableChecks(chk("a", [1, 10], [1, 10], 10), chk("b", [1, 10], [1, 10], 12)), "a different question count is not like for like");

  for (const [label, checks] of [["none", []], ["single", one], ["more", more], ["fewer", fewer], ["same", same], ["mixed", [rgReal, full]]] as const) {
    const p = measurementParagraph(checks as MonthlyCheck[], M);
    ok(!/\baudit/i.test(p) && !/improv/i.test(p) && !/guarantee(d|s)? (that|you)/i.test(p), `${label}: no "audit", no "improved", no promise`);
    if (label !== "none") ok(/separate from the re-measurement your guarantee is judged on/.test(p), `${label}: the checks are not the guarantee's measure`);
  }
}

console.log("\n── 2. the whole update: only the operator's words about work ──");
{
  const base = { month: "2026-10-01", contactName: "Ronnie Smith", checks: [chk("2026-10-05", [2, 10], [1, 10])] };
  const t = composeMonthlyUpdate({ ...base, fields: { work_done: "- Added a key cutting page", next_steps: "- Check the new page in November", opportunities: "" } });
  ok(t.startsWith("Hi Ronnie,\n\nHere is your Findable update for October 2026."), "greets by first name, names the month");
  ok(/What we did\n- Added a key cutting page/.test(t) && /What happens next\n- Check the new page in November/.test(t), "the operator's sections, verbatim");
  ok(!/Opportunities we have found/.test(t), "an empty section is left out, never filled in");
  const empty = composeMonthlyUpdate({ ...base, fields: {} });
  ok(!/What we did/.test(empty) && !/new page|added|listing/i.test(empty.replace(/Findable update/, "")), "with nothing typed, no work is claimed");
  ok(/Paul\nFindable$/.test(t), "signed by Paul");
  ok(missingForSend({}).join() === "What we did,What happens next" && missingForSend({ work_done: " x ", next_steps: "y" }).length === 0, "the two required sections");
  ok(greetingName("  ") === null && greetingName("J.") === null && greetingName("Mary-Jo Brown") === "Mary-Jo", "greeting: a real first name or 'there'");
  ok(composeMonthlyUpdate({ ...base, contactName: null, fields: {} }).startsWith("Hi there,"), "no name → Hi there");
}

console.log("\n── 3. dates ──");
{
  ok(dayLabel("2026-10-01") === "1 October 2026" && monthLabel("2026-10-01") === "October 2026", "a stored day prints as itself (UTC)");
  const now = Date.parse("2026-10-02T23:30:00Z"); // 00:30 on 3 Oct in London (BST) is still October
  const ms = updateMonths("2026-08-21", now);
  ok(ms.join() === "2026-10-01,2026-09-01,2026-08-01", "from the payment month to this month, newest first");
  ok(updateMonths(null, now).length === 6, "no payment date → the last six months");
  ok(updateMonths("2026-09-01", Date.parse("2026-09-30T23:30:00Z"))[0] === "2026-10-01", "London's month, not UTC's: 23:30 UTC on 30 Sep is already October in London (BST)");
  ok(updateMonths("2025-12-15", Date.parse("2026-01-10T12:00:00Z")).join() === "2026-01-01,2025-12-01", "across a year end");
}

console.log("\n── 4. never sends; admin-only; a sent update is the record ──");
{
  const panel = read("src/components/MonthlyUpdatePanel.tsx");
  ok(!/functions\.invoke|invokeEdge|send-whatsapp|resend/i.test(panel), "the panel calls no edge function — it cannot send");
  ok(/monthly_update_facts/.test(panel) && /monthly_update_save/.test(panel) && /monthly_update_mark_sent/.test(panel), "the panel uses the three functions");
  /* Found driving the real panel: a month switch showed the old month's facts and words under the new name. */
  ok(/setFacts\(null\)/.test(panel) && /if \(ticket !== latest\.current\) return;/.test(panel), "a month switch clears the old month's facts and drops a late reply");
  const hub = read("src/pages/ClientHub.tsx");
  ok(/<Stage k="monthly" title="8\. Monthly update"><MonthlyUpdatePanel /.test(hub), "mounted on the paid client page as step 8");

  const sql = read("supabase/migrations/20261006100000_client_monthly_updates.sql");
  ok(/enable row level security/.test(sql) && !/create policy/i.test(sql) && /revoke all on table public\.client_monthly_updates from anon, authenticated/.test(sql), "table: RLS on, no policy, no grants");
  const fns = [...sql.matchAll(/create or replace function public\.(monthly_update_\w+)[\s\S]*?\$\$;/g)];
  ok(fns.length === 3, "three functions");
  for (const m of fns) {
    const body = m[0];
    ok(/security definer/.test(body) && /set search_path = public/.test(body), `${m[1]}: security definer, fixed search_path`);
    const begin = body.indexOf("begin");
    ok(body.slice(begin, begin + 160).includes("my_role() is distinct from 'admin'"), `${m[1]}: the admin check is the first thing it does`);
  }
  ok(/if found and cur\.status = 'sent' then return jsonb_build_object\('ok', false, 'error', 'already_sent'\)/.test(sql), "save refuses a sent update");
  ok(/sent_is_complete check/.test(sql), "a sent row must carry its time, channel and message");
}

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall monthly client update checks passed");
