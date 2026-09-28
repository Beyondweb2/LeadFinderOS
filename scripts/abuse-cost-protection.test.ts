/* Abuse / API-cost / lead protection (2026-09-29, docs/abuse-cost-protection.md).
 *
 * What this file holds (the database behaviour — thresholds, bursts, suspension, modes, masking — is
 * proven by supabase/tests/abuse-cost-protection.sql against the live schema, always rolled back):
 *   · the thresholds live ONCE: the migration's seed is byte-equal to DEFAULT_PROTECTION_LIMITS;
 *   · EVERY edge function a signed-in person can reach that spends on a provider asks the guard —
 *     a sweep over supabase/functions, so a new paid function cannot forget it;
 *   · a salesperson never sees a cost: every refusal sentence they can receive has no $ and no provider;
 *   · CSV export is admin-only on screen and on the server; Copy Numbers asks the server first;
 *   · the Meta signature check (a published HMAC vector, the raw bytes, every malformed header);
 *   · the alert email says who / role / what / when / restricted / where to act.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  DEFAULT_PROTECTION_LIMITS, GUARD_ACTIONS, USAGE_PAUSED_DETAIL, guardRefusalDetail, validateLimits,
} from "../src/lib/protectionLimits.ts";
import { alertEmail, describeSecurityEvent, eventRestricted } from "../src/lib/securityAlerts.ts";
import { metaSignatureHex, validMetaSignature } from "../src/lib/metaSignature.ts";
import { dataAccessRefusalMessage } from "../src/lib/dataAccessLog.ts";
import { leadPermissions } from "../src/lib/access.ts";

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  PASS ${m}`); else { f++; console.log(`  FAIL ${m}`); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20260929100000_abuse_cost_protection.sql");

console.log("── the thresholds live once ──");
{
  const m = MIG.match(/insert into public\.protection_settings \(id, mode, limits\) values \(1, 'running', '(\{.*?\})'::jsonb\)/);
  ok(m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(DEFAULT_PROTECTION_LIMITS), "the migration's seed JSON == DEFAULT_PROTECTION_LIMITS");
  ok(validateLimits(DEFAULT_PROTECTION_LIMITS).ok, "the defaults validate");
  ok(GUARD_ACTIONS.every((a) => a in DEFAULT_PROTECTION_LIMITS.actions), "every guard action has a default entry");
  const L = DEFAULT_PROTECTION_LIMITS;
  ok(L.actions.claim.warn_day === 100 && L.actions.claim.per_hour === 60 && L.actions.claim.per_day === 200, "claims: warn 100/day, hard 60/hour and 200/day (Paul, 2026-09-29)");
  ok(L.actions.export_csv.sales_allowed === false, "CSV export: not allowed for sales (Paul, 2026-09-29)");
  ok(L.user_hour_warn_usd < L.user_hour_hard_usd && L.user_day_warn_usd < L.user_day_hard_usd && L.team_day_warn_usd < L.team_day_cap_usd, "every warning line sits below its hard line");
  const bad = (x: unknown, why: string) => ok(!validateLimits(x).ok, `refused: ${why}`);
  bad({ ...L, typo_usd: 1 }, "an unknown top-level key");
  bad({ ...L, user_day_hard_usd: -1 }, "a negative number");
  bad({ ...L, user_hour_warn_usd: 99 }, "a warning above its hard line");
  bad({ ...L, actions: { ...L.actions, lead_search: { paid: true, per_mni: 3 } } }, "a mistyped limit name");
  const { claim: _c, ...noClaim } = L.actions;
  bad({ ...L, actions: noClaim }, "a missing action");
  bad("{}", "not an object");
}

console.log("\n── a salesperson never sees a cost ──");
for (const reason of ["spend_cap", "rate_limit", "team_cap", "suspended", "paused", "all_stop", "not_allowed", "guard_unavailable", null]) {
  const s = guardRefusalDetail(reason, "sales");
  ok(s === USAGE_PAUSED_DETAIL, `sales refusal for ${reason ?? "null"} is the one sentence`);
}
ok(USAGE_PAUSED_DETAIL === "Usage temporarily paused — contact Paul", "the sentence is Paul's wording");
ok(!/\$|£|apify|google|openai|gemini|cost|spend/i.test(USAGE_PAUSED_DETAIL), "…and names no money or provider");
ok(MIG.split("'Usage temporarily paused — contact Paul'").length - 1 >= 4, "the SQL functions answer with the same sentence");
for (const r of [{ error: "too_many_rows", max_rows: 200 }, { error: "not_your_leads" }, { error: "usage_paused", detail: USAGE_PAUSED_DETAIL }, null]) {
  ok(!/\$|£|apify|google|openai|cost|spend/i.test(dataAccessRefusalMessage(r)), `copy refusal "${dataAccessRefusalMessage(r)}" names no money or provider`);
}
ok(/Usage temporarily paused — contact Paul/.test(read("src/lib/salesCrm.ts")) && /usage_paused/.test(read("src/lib/edgeInvokeCore.ts")), "the claim/add refusal and the edge error map carry the same sentence");

console.log("\n── every paid function a person can reach asks the guard ──");
/* THE SWEEP. A function is "paid" if it calls a paid provider directly or through the shared runners;
   "person-reachable" if it resolves a signed-in caller. Then it must import guardAction (or, for a
   single-purpose admin tool, allStopRefusal). Positive list of exemptions, each with a reason. */
const PAID = /api\.openai\.com|places\.googleapis\.com|maps\.googleapis\.com|api\.apify\.com|runEnrichSource\(|mapsEnrich\(|callModel\(|startAiSearch\(|runSeoScanCore\(|chat\/completions|sendVoiceNote\(|sendViaGraph\(|graph\.facebook\.com|generate-report|fetch\(`\$\{[^}]*\}\/functions\/v1\/create-ai-audit/;
const PERSON = /resolveActor\(|userTeamRole\(|requireAdmin\(|auth\.getUser\(|auth\.getClaims\(/;
const EXEMPT: Record<string, string> = {
  "page-generator": "admin-only (requireAdmin), client delivery work that must keep running under the prospecting pause; mixed read/write actions",
  "mockup": "admin-only (role admin), the live mockup product; mixed read/write actions",
  "paid-baseline": "admin-only; client measurement work — it only calls create-ai-audit internally, which checks the emergency stop",
  "paid-client-hub": "admin-only client delivery; no paid provider call of its own",
  "extract-competitors": "no role: a person's call must own the run (the book owner); the queue worker (stopped by the emergency stop) is its caller",
  "generate-report": "admin/internal; called by the queue worker after a run finishes",
  "backfill-lead-towns": "filters to leads the CALLER owns (user_id) — a salesperson owns none, so it spends nothing for them",
  "check-directory-listings": "owner-only (lead.user_id = caller) and refuses at REFUSE_AT_PCT of the Apify cap",
  "process-whatsapp-queue": "cron; the person modes are read-only/suppress; its paid audit-ahead honours paidMode()",
  "process-ai-audit-queue": "cron / admin; honours paidMode() per tick",
  "clear-enrichment-cache": "deletes cache rows, spends nothing",
  "whatsapp-auto-replies": "cron; replies inside Meta's window, not paid API",
  "template-request": "one email to Paul per request; not paid API",
  "admin-users": "admin-only team actions; no paid provider",
  "enrich-lead": "a stub: no real provider call",
  "crawl-check": "fetches the lead's own website (free); sales limited to a lead they work",
  "crawl-worker": "cron; fetches websites (free)",
  "stripe-webhook": "Meta/Stripe/Resend callbacks, no person",
};
const fnDirs = readdirSync(new URL("../supabase/functions", import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(new URL(`../supabase/functions/${d.name}/index.ts`, import.meta.url)))
  .map((d) => d.name);
const guarded: string[] = [];
for (const fn of fnDirs) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  if (!PAID.test(src) || !PERSON.test(src)) continue;
  if (EXEMPT[fn]) { ok(true, `${fn}: exempt — ${EXEMPT[fn]}`); continue; }
  const asks = /guardAction\(/.test(src) || /allStopRefusal\(/.test(src);
  ok(asks, `${fn}: spends on a provider for a signed-in caller → asks the guard`);
  if (asks) guarded.push(fn);
}
for (const fn of ["search-leads", "google-place-details", "enrich-business", "check-website", "extract-email", "extract-facebook", "scan-site-details", "create-ai-audit", "warm-lead-reply", "voice-note-script", "prospect-preview", "niche-sample", "send-whatsapp-message", "send-whatsapp-voice", "send-whatsapp-media", "bulk-jobs"]) {
  ok(/guardAction\(service|guardAction\(supabase|guardAction\(serviceClient|guardAction\(guardService/.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} calls guardAction`);
}
for (const fn of ["review-reply", "admin-ai-opener", "run-seo-scan", "apply-seo-paste"]) {
  ok(/allStopRefusal\(/.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} (admin tool) refuses under the emergency stop`);
}

console.log("\n── the guard's placement ──");
{
  const pd = read("supabase/functions/google-place-details/index.ts");
  ok(pd.indexOf("mayLookUpBusiness(") > 0 && pd.indexOf("mayLookUpBusiness(") < pd.indexOf("CACHE CHECK ──") && pd.indexOf("guardAction(") < pd.indexOf("CACHE CHECK ──"),
    "place details: the business check and the guard run BEFORE the cache (a cached phone is still a phone)");
  for (const fn of ["enrich-business", "check-website"]) ok(/mayLookUpBusiness\(/.test(read(`supabase/functions/${fn}/index.ts`)), `${fn}: a salesperson cannot look up a business that is someone else's`);
  const eb = read("supabase/functions/enrich-business/index.ts");
  ok(/if \(force\) return json\(\{ success: false, error: "refresh_admin_only"/.test(eb), "enrich-business: the cache-busting re-run is admin-only");
  const ca = read("supabase/functions/create-ai-audit/index.ts");
  ok(ca.indexOf("already_running: true") < ca.indexOf('const action = !isSales ? "audit_manual"'), "create-ai-audit: the in-flight dedupe answers BEFORE the guard (a double-click is free and uncounted)");
  ok(ca.indexOf('const action = !isSales ? "audit_manual"') < ca.indexOf("if (preview) {") && ca.indexOf('const action = !isSales ? "audit_manual"') < ca.indexOf("resolveDerivedTown(service, leadId)"),
    "…and the guard runs before any question is generated or town looked up");
  ok(/estCostUsd: isSales && !preview \? OUTREACH_AUDIT_EST_USD : 0/.test(ca), "a salesperson's hook carries its estimate (its Apify rows are billed to the book)");
  ok(/SALES_HOOKS_PER_LEAD_PER_DAY = 3;/.test(ca), "at most three hooks on one lead a day for a salesperson");
  ok(/else if \(\(await paidMode\(service\)\) === "all_stop"\)/.test(ca), "internal audit creation (baselines, re-measures, free checks) stops only for the emergency stop");
  const ns = read("supabase/functions/niche-sample/index.ts");
  ok(ns.indexOf('already_running: true, sample_id') > 0 && ns.indexOf('already_running: true, sample_id') < ns.indexOf('from("niche_samples").insert('), "Niche Check: a second start for a niche in flight returns the first, never a second sample");
  const sw = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(sw.indexOf('"whatsapp_send"') > 0 && sw.indexOf('"whatsapp_send"') < sw.indexOf("THE DRY RUN STOPS HERE"), "send-whatsapp-message: a suspended salesperson's REAL send is refused (dry runs untouched)");
  ok(/const BUILD_ID = "2026-09-29a";/.test(sw), "send-whatsapp-message BUILD_ID bumped (the deploy marker)");
}

console.log("\n── the pause modes reach the background work ──");
{
  const aq = read("supabase/functions/process-ai-audit-queue/index.ts");
  ok(/if \(candidateIds\.length < START_BATCH && tickMode === "running"\)/.test(aq), "audit queue: under the prospecting pause only measurement (baseline-priority) rows start");
  ok(/if \(tickMode === "all_stop"\) candidateIds\.length = 0;/.test(aq), "audit queue: the emergency stop starts no new run");
  ok(aq.indexOf("PHASE A: POLL") < aq.indexOf('if (tickMode === "all_stop") candidateIds.length = 0;'), "…while runs already started are still polled (nothing stranded)");
  ok(/if \(tickMode === "all_stop"\) \{\n\s+console\.log\("\[process-ai-audit-queue\] emergency stop is on - no SEO scan this tick"\);/.test(aq), "audit queue: no SEO scan under the emergency stop");
  const wq = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/if \(\(windowOpen \|\| force\) && auditAheadMode === "running"\) try \{/.test(wq), "WhatsApp queue: the pre-send hook audits stop under either pause; the sends do not");
  ok(/suspendedIds\.has\(l\.assigned_to_user_id\)/.test(wq) && /skipped: "team_read_failed"/.test(wq), "WhatsApp queue: a suspended rep's queued leads are held (fail closed), never deleted");
  ok(/if \(sweepMode !== "running"\) return json\(\{ ok: true, skipped: sweepMode \}\);/.test(read("supabase/functions/bulk-jobs/index.ts")), "bulk jobs wait under either pause");
}

console.log("\n── lead data ──");
{
  ok(leadPermissions("sales").exportData === false && leadPermissions("admin").exportData === true && leadPermissions(null).exportData === false, "exportData: admin only");
  const ot = read("src/components/OutreachTable.tsx");
  ok(/\{perms\.exportData && \(\n\s+<Button[\s\S]{0,200}exportToCsv\('crm'\)/.test(ot), "Outreach: the Export CSV button renders only for exportData");
  ok(/if \(!perms\.exportData\) return;/.test(ot), "…and exportToCsv refuses without it");
  const copy = ot.slice(ot.indexOf("const copySelectedPhones"), ot.indexOf("markMultipleAsCopied(leadIds)"));
  ok(copy.indexOf("logDataAccess(supabase, 'copy_numbers'") > 0 && copy.indexOf("logDataAccess(") < copy.indexOf("navigator.clipboard.writeText"), "Copy Numbers asks the server BEFORE the clipboard");
  ok(/if \(!logged\.ok\) \{[\s\S]{0,160}return;/.test(copy), "…and copies nothing on a refusal");
  const idx = read("src/pages/Index.tsx");
  ok(/onExport=\{canExport \?/.test(idx) && /onExportWithEmails=\{canExport \?/.test(idx) && /const canExport = viewerRole === 'admin';/.test(idx), "Find Leads: no Export menu for Sales");
  ok(/\{onExport && renderExportMenu\(\)\}/.test(read("src/components/LeadsTable.tsx")), "LeadsTable hides the Export menu when there is no export");
  const lda = MIG.slice(MIG.indexOf("create or replace function public.log_data_access"), MIG.indexOf("__never__") > 0 ? 0 : undefined);
  ok(/x\.id not in \(select public\.my_sales_lead_ids\(\)\)/.test(lda), "log_data_access: every copied id must be the salesperson's own lead");
  ok(/revoke execute on function public\.sales_pool\(text, integer, integer\) from authenticated;/.test(MIG), "sales_pool: no longer callable from a browser");
  ok(/lead_id is null and phone in \(select public\.my_sales_message_phones\(\)\)/.test(MIG), "messages: a phone match only for a message that belongs to no lead");
  ok(/case when v_role = 'admin' or r\.state in \('yours', 'claimable'\) then r\.lead_id end/.test(MIG), "lookup: a lead id only for yours / claimable");
  ok(/select \* into v_hit from public\._lead_identity_rows\(jsonb_build_array\(/.test(MIG), "sales_add_lead's duplicate check reads the UNMASKED rows (masking must not let a duplicate in)");
  ok(/v_g := public\.guard_action\(v_uid, 'claim', _lead_id, 0, 1, 'claim_lead'\);\n\s+if not coalesce\(\(v_g ->> 'ok'\)::boolean, false\) then\n\s+return jsonb_build_object\('ok', false, 'error', 'usage_paused'/.test(MIG), "claim_lead: the guard runs before the write");
  ok(MIG.indexOf("'claim', _lead_id") > MIG.indexOf("lead_contact_attempt_at(_lead_id) is not null then return"), "…after every existing refusal (only a claim that would succeed is counted)");
}

console.log("\n── suspension ──");
{
  const au = read("supabase/functions/admin-users/index.ts");
  ok(/action === 'team_suspend' \|\| action === 'team_unsuspend'/.test(au), "admin-users: suspend / reactivate");
  const block = au.slice(au.indexOf("action === 'team_suspend'"), au.indexOf("/* Move EVERY lead"));
  ok(!/user_roles'\)\.delete|ban_duration|\.delete\(\)/.test(block), "suspend never removes the role, bans, or deletes anything");
  ok(/suspended_at: new Date\(\)\.toISOString\(\), suspended_by: adminUserId/.test(block) && /suspended_at: null, suspended_by: null/.test(block), "…it sets / clears suspended_at only");
  ok(/select \(t\.suspended_at is not null\) into v_susp from public\.team_members t where t\.user_id = _actor;/.test(MIG), "the guard reads suspension on EVERY call (an open session stops at once)");
  ok(/Suspend Sales access/.test(read("src/pages/Team.tsx")) && /Reactivate/.test(read("src/pages/Team.tsx")), "Team: Suspend Sales access / Reactivate");
}

console.log("\n── Meta webhook signature ──");
{
  // GitHub's published HMAC-SHA256 webhook example (same algorithm and header format as Meta's).
  const secret = "It's a Secret to Everybody";
  const body = new TextEncoder().encode("Hello, World!");
  const good = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
  ok((await metaSignatureHex(body, secret)) === good.slice(7), "HMAC matches the published vector");
  ok(await validMetaSignature(body, good, secret), "a genuine signature verifies");
  ok(await validMetaSignature(body, good.toUpperCase().replace("SHA256=", "sha256="), secret), "…hex case does not matter");
  ok(!(await validMetaSignature(body, null, secret)), "no header → refused");
  ok(!(await validMetaSignature(body, good.slice(7), secret)), "no sha256= prefix → refused");
  ok(!(await validMetaSignature(body, "sha256=" + "0".repeat(64), secret)), "wrong digest → refused");
  ok(!(await validMetaSignature(body, "sha256=abc", secret)), "wrong length → refused");
  ok(!(await validMetaSignature(new TextEncoder().encode("Hello, World?"), good, secret)), "a changed body → refused");
  ok(!(await validMetaSignature(body, good, "")), "an empty secret verifies nothing");
  const uni = new TextEncoder().encode('{"text":"café 👍"}');
  ok(await validMetaSignature(uni, "sha256=" + (await metaSignatureHex(uni, "s")), "s"), "non-ASCII bodies are judged on their bytes");
  const ws = read("supabase/functions/whatsapp-status/index.ts");
  ok(/new Uint8Array\(await req\.arrayBuffer\(\)\)/.test(ws) && /validMetaSignature\(rawBytes, req\.headers\.get\("x-hub-signature-256"\), appSecret\)/.test(ws), "whatsapp-status checks the RAW bytes");
  ok(/if \(!ok\) \{\n\s+console\.error\("\[whatsapp-status\] bad or missing signature — rejecting"\);\n\s+return new Response\("invalid signature", \{ status: 401 \}\);/.test(ws), "…and refuses 401 before reading anything");
  ok(ws.indexOf("validMetaSignature(") < ws.indexOf("JSON.parse(rawBody"), "…before the body is parsed");
  ok(/webhookSignatureEnforced/.test(read("supabase/functions/security-admin/index.ts")) && /WhatsApp webhook signatures are NOT being checked/.test(read("src/components/SecurityPanel.tsx")), "an unset secret is SHOWN to the admin, never silent");
}

console.log("\n── alerts ──");
{
  const KINDS = ["spend_warning", "spend_cap", "rate_limit", "team_cap", "volume_warning", "large_copy", "too_many_rows", "not_allowed", "suspended", "denied_burst", "team_spend_warning", "team_spend_cap", "spend_spike", "apify_near_cap", "webhook_unsigned", "data_export", "paused", "all_stop", "suspended_by_admin", "reactivated_by_admin", "mode_changed", "limits_changed", "user_unlocked", "denied"];
  for (const k of KINDS) ok(!describeSecurityEvent({ kind: k, severity: "warning", detail: {} }).startsWith("Security event \""), `the words cover "${k}"`);
  const mail = alertEmail([
    { kind: "spend_cap", severity: "restricted", action: "hook_audit", actor_name: "Test", actor_email: "t@example.invalid", actor_role: "sales", created_at: "2026-09-29T10:00:00Z", detail: { spend_hour_usd: 16, spend_day_usd: 20 } },
    { kind: "spend_spike", severity: "warning", created_at: "2026-09-29T10:05:00Z", detail: { team_last_hour_usd: 14 } },
  ], "2026-09-29T10:06:00Z");
  const text = mail.lines.join("\n");
  ok(/Test <t@example\.invalid> \(sales\) — spend_cap/.test(text), "email: who, email, role, event");
  ok(/When: 2026-09-29T10:00:00Z/.test(text) && /Automatically restricted: yes/.test(text) && /Automatically restricted: no/.test(text), "email: when, and whether it was restricted");
  ok(/\$16\.00/.test(text) && /System — spend_spike/.test(text), "email: the spend, and system events named as System");
  ok(/https:\/\/leadfinderos-next\.pages\.dev\/admin\/api-usage/.test(text), "email: where to act");
  ok(/2 alerts \(1 restricted\/critical\)/.test(mail.subject), "one email per sweep, counted in the subject");
  ok(eventRestricted("spend_cap") && !eventRestricted("spend_warning"), "restricted vs warning");
  const sa = read("supabase/functions/security-admin/index.ts");
  ok(sa.indexOf("sendOperatorAlert(subject, lines)") < sa.indexOf('update({ alerted_at'), "alerts are marked sent only AFTER Resend accepted them");
  ok(/if \(!isInternalCall\(req\)\) return json\(\{ ok: false, error: "forbidden" \}, 403\);/.test(sa), "the sweep is CRON_SECRET only");
  ok(/coalesce\(v_reason, v_warn\) not in \('paused', 'all_stop'\)\)/.test(MIG), "the admin's own pause is never emailed back");
  ok(/_actor::text \|\| ':' \|\| coalesce\(v_reason, v_warn\) \|\| ':' \|\| _action \|\| ':' \|\| v_day/.test(MIG) && /on conflict \(alert_key\) do update/.test(MIG), "one alert per person / event / action / day (repeats count, never re-email)");
  const cfg = read("supabase/config.toml");
  ok(/\[functions\.security-admin\]\nverify_jwt = false/.test(cfg), "security-admin has its config.toml entry");
}

console.log("\n── the ledger ──");
{
  ok(/add column if not exists action text,\n\s+add column if not exists actor_role text,\n\s+add column if not exists lead_id uuid,\n\s+add column if not exists outcome text,\n\s+add column if not exists reason text;/.test(MIG), "api_usage_log is the ONE ledger, extended (no second cost log)");
  ok(/api_type is distinct from 'guard'/.test(MIG), "a guard row is never counted as a provider charge in team totals");
  ok(/\.or\('api_type\.is\.null,api_type\.neq\.guard'\)/.test(read("supabase/functions/admin-api-usage/index.ts")) && /\.or\('api_type\.is\.null,api_type\.neq\.guard'\)/.test(read("supabase/functions/search-leads/index.ts")),
    "…nor by the older readers (admin-api-usage, search-leads' region budget) — with .or(), because .neq() drops NULLs");
  ok(/revoke all on public\.security_events from anon, authenticated;\ngrant select on public\.security_events to authenticated;/.test(MIG) && /for select to authenticated using \(\(select public\.my_role\(\)\) = 'admin'\)/.test(MIG), "security_events: the admin reads, nobody signed in writes");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
