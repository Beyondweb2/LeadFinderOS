/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE CONTACT-METHOD SET, THE CLAIM RULE, CAMPAIGNS ADMIN-ONLY (2026-09-28).

   ⛔ The failure this guards: the backend recognising a method the Outreach screen cannot log (or the
   screen logging one the claim rule ignores), and a campaign write that only a hidden button stopped.
   The live-database half — every method against the pool and the claim, the non-contacts that must
   not reserve a lead, campaigns create/edit/delete per role — is supabase/tests/campaign-claim-contact.sql
   (always rolled back).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";
import { CONTACT_METHODS, LINK_SEND_METHOD_VALUES, LOGGED_CONTACT_METHODS, contactMethodLabel } from "../src/lib/contactMethods.ts";
import { CALL_OUTCOMES, CONTACT_CHANNEL_OPTIONS, activityDetail, outcomesFor } from "../src/lib/salesCrm.ts";
import { CHANNEL_LABELS, CONTACT_CHANNELS, CONVERSATION_OUTCOMES } from "../src/lib/salesPerformance.ts";
import { MANUAL_SEND_CHANNELS } from "../src/lib/onboardingLinkStatus.ts";
import { REPORT_SEND_CHANNELS } from "../src/lib/reportShare.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20260928210000_campaign_claim_contact.sql");
/* lead_log_contact's NEWEST definition (2026-09-30 added Facebook, Instagram and connection_sent). */
const LOG_MIG = read("supabase/migrations/20260930130000_social_profiles.sql");
const quoted = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

console.log("── the one set ──");
{
  const values = CONTACT_METHODS.map((m) => m.value);
  for (const v of ["whatsapp", "call", "email", "linkedin", "linkedin_voice", "social", "in_person", "referral", "video", "other"])
    ok(values.includes(v), `the set has ${v} (${contactMethodLabel(v)})`);
  ok(CALL_OUTCOMES.some((o) => o.value === "left_voicemail") && outcomesFor("call").some((o) => o.value === "left_voicemail"),
    "voicemail is the call's 'Left voicemail' outcome (one concept, not a second call method)");
  ok(new Set(values).size === values.length, "no method twice");
  ok(CONTACT_METHODS.filter((m) => m.recordedBy === "send").map((m) => m.value).join() === "whatsapp", "only WhatsApp is recorded by the send itself");

  const allow = quoted(LOG_MIG.match(/_channel not in \(([^)]*)\)/)?.[1] ?? "");
  ok(JSON.stringify([...allow].sort()) === JSON.stringify(LOGGED_CONTACT_METHODS.map((m) => m.value).sort()),
    `lead_log_contact's channel allowlist IS the logged set (${allow.join(", ")})`);
  ok(!allow.includes("whatsapp"), "…and WhatsApp stays refused by hand (the send already records it)");
  const outs = quoted(LOG_MIG.match(/_outcome not in \(([^)]*)\)/)?.[1] ?? "");
  ok(JSON.stringify([...outs].sort()) === JSON.stringify(CALL_OUTCOMES.map((o) => o.value).sort()), "the outcome allowlist IS the outcome list");
  ok(JSON.stringify(CONTACT_CHANNEL_OPTIONS.map((c) => c.value)) === JSON.stringify(LOGGED_CONTACT_METHODS.map((m) => m.value)), "the loggable options are derived from the set");

  const linkCheck = read("supabase/migrations/20260928120000_sales_readiness.sql").match(/channel in \(([^)]*'copy'[^)]*)\)/)?.[1]
    ?? read("supabase/migrations/20260928120000_sales_readiness.sql").match(/channel[^;]*'copy'/)?.[0] ?? "";
  ok(LINK_SEND_METHOD_VALUES.every((v) => linkCheck.includes(`'${v}'`)), "every 'sent another way' method is allowed by the link events' CHECK");
  ok(LINK_SEND_METHOD_VALUES.every((v) => values.includes(v)), "…and is a method of the set");
  ok(MANUAL_SEND_CHANNELS === REPORT_SEND_CHANNELS || JSON.stringify(MANUAL_SEND_CHANNELS) === JSON.stringify(REPORT_SEND_CHANNELS), "sign-up and report links offer the same 'sent another way' list");

  ok(JSON.stringify([...CONTACT_CHANNELS]) === JSON.stringify(values), "the Sales dashboard's channels are the set");
  ok(values.every((v) => typeof CHANNEL_LABELS[v] === "string"), "…each with a label");
  ok(!CONVERSATION_OUTCOMES.has("message_sent") && !CONVERSATION_OUTCOMES.has("no_answer") && !CONVERSATION_OUTCOMES.has("left_voicemail"),
    "'Sent, no reply yet', 'No answer' and 'Left voicemail' are attempts, never counted as a reply");

  /* No second hand-written copy of the list anywhere in src (the campaign's PLANNED channel and the
     lead's admin-only contact_method tag are different, older concepts and are allowed their own). */
  const walk = (d: string): string[] => readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const copies = walk("src").filter((p) => /value: 'linkedin'|value: 'in_person'|linkedin_voice/.test(read(p)) && p !== "src/lib/contactMethods.ts");
  ok(copies.length === 0, `no other file lists the contact methods (${copies.join(", ") || "none"})`);
}

console.log("\n── outcomes per method ──");
{
  const call = outcomesFor("call").map((o) => o.value);
  ok(call.includes("no_answer") && call.includes("left_voicemail") && call.includes("wrong_number") && !call.includes("message_sent"), `a call: ${call.join(", ")}`);
  for (const m of ["email", "linkedin", "linkedin_voice", "social", "sms", "video", "other"]) {
    const o = outcomesFor(m).map((x) => x.value);
    ok(o.includes("message_sent") && !o.includes("no_answer") && o.includes("spoke_to_owner"), `${m}: 'Sent, no reply yet' offered, 'No answer' not`);
  }
  ok(outcomesFor("in_person").some((o) => o.value === "spoke_to_owner"), "in person: 'Spoke to owner'");
}

console.log("\n── History says the method ──");
{
  for (const m of LOGGED_CONTACT_METHODS) {
    const kind = m.value === "call" ? "call_outcome" : "contact_logged";
    const line = activityDetail({ kind, body: null, data: { channel: m.value, outcome: m.value === "call" ? "no_answer" : "message_sent" } }, () => "x");
    ok(!!line && (kind === "call_outcome" || line.startsWith(`${m.label}: `)), `${m.value} → "${line}"`);
  }
  ok(activityDetail({ kind: "contact_logged", data: { channel: "carrier_pigeon", outcome: "message_sent" } }, () => "x")?.startsWith("carrier pigeon: ") === true,
    "an unknown stored value still reads, as itself (history is never rewritten)");
  ok(activityDetail({ kind: "report_link", data: { channel: "linkedin" } }, () => "x") === "By LinkedIn message", "a report link sent another way names its method");
}

console.log("\n── the workspace logs every method ──");
{
  const crm = read("src/components/LeadCrmPanel.tsx");
  const ui = crm.slice(crm.indexOf("function LogContact("), crm.indexOf("function InternalNote("));
  ok(/CONTACT_METHODS\.filter\(\(m\) => m\.primary\)/.test(ui) && /CONTACT_METHODS\.filter\(\(m\) => !m\.primary && !m\.social\)/.test(ui) && /SOCIAL_CONTACT_METHODS\.map/.test(ui),
    "pills = the set's primary methods + one Social pill (LinkedIn / Facebook / Instagram, 2026-09-30); the rest under More — every method reachable");
  ok(CONTACT_METHODS.filter((m) => m.primary).length + 1 <= 5, "at most five pills, the Social pill included (compact)");
  ok(/outcomesFor\(channel\)/.test(ui), "the outcome buttons are the method's");
  ok(/recordedBy === 'send'/.test(ui) && /recorded automatically/.test(ui), "WhatsApp explains it is recorded by the send (no second record)");
  ok((ui.match(/'lead_log_contact'/g) ?? []).length === 1, "one write per tap: lead_log_contact, once");
  ok(!/\{ value: 'call'/.test(ui), "no local method list");
}

console.log("\n── the claim rule ──");
{
  const logged = MIG.slice(MIG.indexOf("create or replace function public.lead_logged_contact_at"), MIG.indexOf("-- 7."));
  ok(/a\.kind in \('call_outcome', 'contact_logged'\)/.test(logged), "every logged contact counts (call_outcome + contact_logged — all methods, 'No answer' included)");
  ok(/onboarding_link_events e where e\.lead_id = _lead_id and e\.kind = 'sent'/.test(logged) && /report_link_events e where e\.lead_id = _lead_id and e\.kind = 'sent'/.test(logged),
    "a sign-up or report link SENT on any channel counts; 'generated' does not");
  ok(!/'note'|'audit_run'|'crawl_run'|'lead_added'|'generated'/.test(logged), "notes, audits, crawls, adds and generated links never count");
  const attempt = MIG.slice(MIG.indexOf("create or replace function public.lead_contact_attempt_at"), MIG.indexOf("-- 8b."));
  ok(/least\(public\.lead_first_contact_at\(_lead_id\), public\.lead_logged_contact_at\(_lead_id\)\)/.test(attempt), "the rule = WhatsApp/message history (unchanged) + the logged contacts");
  ok(!/security definer/.test(attempt), "…as a plain expression the planner inlines (the nested-definer version cost 2.5 s)");
  for (const fn of ["claim_lead", "sales_pool", "lead_identity_lookup"]) {
    const body = MIG.slice(MIG.indexOf(`create or replace function public.${fn}(`), MIG.indexOf("$function$;", MIG.indexOf(`create or replace function public.${fn}(`)));
    ok(/lead_contact_attempt_at\(/.test(body) && !/lead_first_contact_at\(/.test(body), `${fn} decides "contacted" with the claim rule`);
  }
  ok(!/function public\.sales_queue_opener/.test(MIG), "the WhatsApp opener queue keeps its own 'never messaged' rule (a phone call does not block the opener)");
}

console.log("\n── campaigns: admin-only in the database ──");
{
  for (const cmd of ["insert", "update", "delete"])
    ok(new RegExp(`on public\\.campaigns as restrictive for ${cmd} to authenticated[\\s\\S]{0,120}my_role\\(\\)\\) = 'admin'`).test(MIG), `a RESTRICTIVE ${cmd} policy requires the admin role`);
  ok(!/drop policy/i.test(MIG), "no existing policy dropped");
  ok(!/on public\.campaigns as restrictive for select/.test(MIG), "reading campaigns is unchanged (Sales still picks one)");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
