/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALESPEOPLE GET EVERY APPROVED TEMPLATE (2026-11-16, Paul, v1-tps-templates-callable).
   sales_queue_opener (migration 20261219090000) holds the queueable lists in SQL; this fences them against the code:
   every WHATSAPP_TEMPLATES entry is queueable by a salesperson except the stale-price ones, split cold / follow-up
   exactly as isColdOutreachTemplate splits them. The pickers offer the same list to both roles, and the drip sends a
   follow-up only to a lead in a conversation, never twice, free inside the window.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import path from "node:path";
import { WHATSAPP_TEMPLATES } from "../src/types/outreach.ts";
import { isColdOutreachTemplate } from "../src/lib/coldOutreach.ts";
import { STALE_OFFER_TEMPLATES } from "../src/lib/findableOffer.ts";
import { MANUAL_ONLY_TEMPLATES } from "../src/lib/goneCold.ts";
import { QUEUE_SKIP_LABEL, refusalText } from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
/* 2026-11-22: the newest copy of the function (polite_hook3 joined the follow-ups). */
const SQL = read("supabase/migrations/20261227090000_polite_hook3.sql");
const arr = (name: string) => { const m = SQL.match(new RegExp(`${name} text\\[\\] := array\\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) : []; };
const cold = arr("v_cold"), follow = arr("v_followups"), blocked = arr("v_blocked");

console.log("── the SQL lists = the code's lists ──");
const all = WHATSAPP_TEMPLATES.map((t) => t.value);
/* gone_cold (2026-11-21) is MANUAL ONLY: never queueable, by anyone. */
const sendable = all.filter((v) => !STALE_OFFER_TEMPLATES.has(v) && !MANUAL_ONLY_TEMPLATES.has(v));
ok([...MANUAL_ONLY_TEMPLATES].every((v) => !cold.includes(v) && !follow.includes(v)), "manual-only templates (gone_cold) are never queueable");
ok(sendable.every((v) => cold.includes(v) || follow.includes(v)), `every sendable template is queueable by a salesperson (${sendable.filter((v) => !cold.includes(v) && !follow.includes(v)).join(", ") || "all"})`);
ok([...cold, ...follow].every((v) => all.includes(v)), "nothing queueable that is not in WHATSAPP_TEMPLATES");
ok(cold.every((v) => isColdOutreachTemplate(v)) && follow.every((v) => !isColdOutreachTemplate(v)), "cold / follow-up split = isColdOutreachTemplate");
ok(blocked.sort().join() === [...STALE_OFFER_TEMPLATES].sort().join() && blocked.every((v) => !cold.includes(v) && !follow.includes(v)), "explain_offer / explain_offer_v2 stay blocked");

console.log("\n── follow-up rules in the database ──");
const branch = SQL.slice(SQL.indexOf("elsif not v_is_cold then"), SQL.indexOf("elsif coalesce(v_lead.status, '') <> 'not_contacted' then v_reason := 'not_new';"));
for (const k of ["'opted_out'", "'not_interested'", "'already_queued'", "contact_suppressions", "'follow_up_needs_contact'", "'template_already_sent'", "'daily_limit'"]) ok(branch.includes(k), "follow-up branch checks " + k);
ok(SQL.indexOf("elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';") < SQL.indexOf("elsif not v_is_cold then"), "tenancy (can_work_lead, client, archived) comes first for both kinds");
ok(/guard_action\(v_uid, 'whatsapp_queue'/.test(SQL), "guard_action kept");
ok(SQL.includes("elsif public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk) is null then v_reason := 'not_a_uk_mobile';") && SQL.includes("v_reason := public.opener_contact_block(v_id);"), "the cold branch is unchanged");
ok(/security definer/i.test(SQL) && /SET search_path TO 'public'/.test(SQL), "same security definer + search_path");
for (const k of ["follow_up_needs_contact", "template_already_sent", "already_queued", "not_interested", "not_awaiting_reply", "too_recent"]) ok(!!QUEUE_SKIP_LABEL[k], "skip words for " + k);
ok(refusalText("template_blocked") !== "template_blocked" && refusalText("not_a_queue_template") !== "not_a_queue_template", "refusal words for the new errors");

console.log("\n── both roles get the same picker ──");
const table = read("src/components/OutreachTable.tsx");
const controls = read("src/components/WhatsAppLeadControls.tsx");
ok(!/salesBulkTemplate/.test(table) && /\{WHATSAPP_TEMPLATES\.map\(\(t\) => \{/.test(table), "Outreach bulk queue: one list for both roles");
ok(/const options = WHATSAPP_TEMPLATES;/.test(controls), "lead popup queue: one list for both roles");
ok(/if \(template === 'contact_followup' && perms\.queueControls\) \{ await handleQueueContactFollowup\(\); return; \}/.test(table), "a salesperson's no-reply follow-up goes through sales_queue_opener (they cannot write lead rows)");
ok(/STALE_OFFER_TEMPLATES\.has\(template\)/.test(table) && /STALE_OFFER_TEMPLATES\.has\(t\.value\)/.test(controls), "stale-price templates greyed / refused in both pickers");

console.log("\n── the drip sends a queued follow-up the same way ──");
const q = read("supabase/functions/process-whatsapp-queue/index.ts");
const guard = q.slice(q.indexOf("if (!isColdOutreachTemplate(templateName)) {\n      const { data: sameTpl"), q.indexOf("if (alreadySent && isColdOutreachTemplate(templateName)) {"));
ok(guard.length > 0 && /"follow_up_needs_contact"/.test(guard) && /"template_already_sent"/.test(guard), "a follow-up: never cold, never twice");
ok(/\.eq\("template", templateName\)\.eq\("test_mode", false\)/.test(guard) && /\.eq\("template_name", templateName\)/.test(guard), "'twice' = this template on this lead in either sends or messages");
ok(q.indexOf("const mainSupp = await checkSuppressed(") < q.indexOf("if (!isColdOutreachTemplate(templateName)) {\n      const { data: sameTpl"), "opt-out / Do Not Contact is checked before it");
ok(/if \(alreadySent && isColdOutreachTemplate\(templateName\)\) \{/.test(q), "the opener guard is unchanged for cold templates");
ok(/status: isColdOutreachTemplate\(templateName\) \? "initial_contact" : statusWithContactEvidence\(/.test(q), "a follow-up never moves a lead backwards");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
