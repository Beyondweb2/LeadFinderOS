/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEST-DAY GUARDS (2026-10-14, feat/test-day-outreach; docs/test-day-outreach.md).

   Job 1 — the roles and double-contact check found three narrow gaps; each fix is pinned here:
     A. a salesperson's allow_resend never skips the phone-history check across ANOTHER lead row;
     B. a number already TEXTED never gets a cold WhatsApp opener (both senders ask one SQL rule);
     C. Find Leads' region mode (dearer, and it reads back the day's Google spend) is admin-only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── Job 1: roles and double contact ──");
{
  const swm = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(/isColdOutreachTemplate\(templateName\) && \(!allowResend \|\| actor\.role !== "admin"\)/.test(swm),
    "A: the cross-row phone-history check runs for a salesperson even with allow_resend");
  ok(/!allowResend \|\| !resolvedLeadId \|\| m\.lead_id !== resolvedLeadId/.test(swm),
    "A: with allow_resend, only this lead's OWN thread is waved through");
  ok(/rpc\("phone_already_texted", \{ _phone: to \}\)/.test(swm) && /error: "phone_already_texted"/.test(swm),
    "B: send-whatsapp-message refuses a cold template to a texted number");
  ok(/textedErr\) return json\(\{ ok: false, error: "contact_guard_unreadable"/.test(swm), "B: an unreadable answer refuses (fails closed)");

  const drip = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/rpc\("phone_already_texted", \{ _phone: toNumber \}\)/.test(drip) && /skipped: "phone_already_texted"/.test(drip),
    "B: the drip asks the same rule at send time and drops the lead from the queue");

  const mig = read("supabase/migrations/20261024090000_phone_already_texted.sql");
  ok(/m\.direction = 'outbound'/.test(mig) && /not in \('failed', 'undelivered', 'simulated'\)/.test(mig),
    "B: the SQL rule matches queue_sms_openers' already_texted predicate");
  ok(/revoke all on function public\.phone_already_texted\(text\) from public, anon, authenticated/.test(mig),
    "B: browsers cannot call it (service role only)");

  const search = read("supabase/functions/search-leads/index.ts");
  ok(/const region = regionAsked && role === 'admin';/.test(search), "C: region mode runs only for the admin");
}

console.log("── Job 2: CSV import — messy real-world files ──");
{
  const { parseCsv, autoMapColumns, buildImportRows, withDefaultTrade, runImport, callErrorText, IMPORT_BATCH_MAX } =
    await import("../src/lib/csvLeadImport.ts");
  const mapAll = (text: string) => { const p = parseCsv(text); const m = autoMapColumns(p.headers); return { p, m, rows: buildImportRows(p, m.mapping) }; };

  // Quotes, commas inside quotes, an escaped quote, a line break inside a quoted note, blank rows, CRLF, a BOM.
  const messy = "﻿Business Name,Website,Phone,Email,Town,Why this lead\r\n"
    + "\"Smith & Sons, Plumbing\",smithandsons.co.uk,+44 (0)7700 900001,,Leeds,\"Has no site reviews, \"\"old\"\" logo\"\r\n"
    + "\r\n"
    + ",,,,,\r\n"
    + "Beta Locks,https://www.betalocks.com/,7700900002,info@betalocks.com,York,\"Line one\nline two\"\r\n"
    + "Gamma Roofing,,07700-900-003,,Hull,\r\n";
  const { p, m, rows } = mapAll(messy);
  ok(p.records.length === 3, `blank and all-empty rows are dropped (3 records, got ${p.records.length})`);
  ok(m.mapping.notes != null && m.mapping.town != null && m.mapping.website != null, "\"Why this lead\" maps to Notes; Town and Website auto-map");
  ok(rows[0].business_name === "Smith & Sons, Plumbing", "a comma inside quotes stays in the name");
  ok(rows[0].notes === "Has no site reviews, \"old\" logo", "an escaped quote inside a quoted field is kept");
  ok(rows[1].notes === "Line one\nline two", "a line break inside a quoted field stays in that one field");
  ok(rows[1].row === 5 && rows[2].row === 6, "spreadsheet row numbers count the dropped blank rows");
  ok(rows[0].phone === "+44 (0)7700 900001" && rows[2].phone === "07700-900-003", "odd phone formats go to the server untouched (it repairs and judges them)");
  ok(!("email" in rows[0]), "an empty cell is absent");

  const tagged = withDefaultTrade([{ row: 2 }, { row: 3, trade: "Roofers" }], "  Plumbers ");
  ok(tagged[0].trade === "Plumbers" && tagged[1].trade === "Roofers", "the file-wide trade fills only rows with none; a row's own trade wins");
  ok(withDefaultTrade(rows, "  ") === rows, "a blank trade changes nothing");

  // Semicolon-separated (a European Excel export) and a header-only file.
  ok(mapAll("Name;Phone\nAcme;07700 900009\n").rows[0]?.phone === "07700 900009", "a semicolon-separated file reads");
  ok(parseCsv("Business Name,Phone\n").records.length === 0, "a header with no rows reads as no records (the screen says so)");

  // The tags reach every call; large files are sent in parts.
  const calls: Array<Record<string, unknown>> = [];
  const rpc = async (a: Record<string, unknown>) => { calls.push(a); return { data: { ok: true, counts: {}, rows: [] }, error: null }; };
  const many = Array.from({ length: IMPORT_BATCH_MAX * 2 + 7 }, (_, i) => ({ row: i + 2, business_name: `B${i}`, phone: "07700900001" }));
  await runImport(rpc as never, many, false, "f.csv", undefined, false, { assignTo: "u-ethan", batch: "  Ethan batch 14 Oct  " });
  ok(calls.length === 3, `a ${many.length}-row file goes in 3 calls of at most ${IMPORT_BATCH_MAX}`);
  ok(calls.every((c) => c._assign_to === "u-ethan" && c._batch === "Ethan batch 14 Oct"), "owner and trimmed batch name ride on every call");
  calls.length = 0;
  await runImport(rpc as never, many.slice(0, 2), false, null);
  ok(calls[0]._assign_to === null && calls[0]._batch === null, "no tags = the importer owns the leads, no batch");
  ok(/admin/.test(callErrorText({ ok: false, error: "owner_not_yours" })) && /not an active member/.test(callErrorText({ ok: false, error: "not_an_active_member" })), "the two new refusals have words");

  const dialog = read("src/components/CSVImportDialog.tsx");
  ok(/\(('import_leads_v4', args)\)/.test(dialog), "the screen calls import_leads_v4 (v3 + batch default + town confirmation)");
  ok(/assignTo: isAdmin && assignTo \? assignTo : null/.test(dialog), "only the admin's screen ever sends an owner");

  const mig = read("supabase/migrations/20261024100000_csv_import_batch_owner.sql");
  ok(/add column if not exists import_batch text;/.test(mig), "import_batch is a plain nullable column (no default, no rewrite)");
  ok(/if v_role is distinct from 'admin' then return jsonb_build_object\('ok', false, 'error', 'owner_not_yours'\)/.test(mig), "server: a salesperson can only import for themselves");
  ok(/t\.status = 'active' and t\.suspended_at is null and r\.role in \('admin', 'sales'\)/.test(mig), "server: the admin may only name an active, unsuspended teammate");
  ok(/v_book, v_uid, v_owner, now\(\)/.test(mig) && /'manual', v_batch\)/.test(mig), "server: new leads get the chosen owner and the batch");
  ok(/where l\.id = v_id and l\.assigned_to_user_id = v_uid/.test(mig), "server: fill-in-blanks still touches only the importer's own leads");
  ok((mig.match(/perform public\.notify_person/g) ?? []).length === 1 && /'import:' \|\| v_import/.test(mig), "server: ONE notice per import call, never one per lead");
  ok(!/\binsert into public\.(whatsapp|sms)/i.test(mig) && !/status = 'queued'/.test(mig), "server: an import never queues or sends");
  ok(/,\n    import_batch\n   FROM outreach_leads l/.test(mig) && /with \(security_barrier = true\)/.test(mig), "sales_leads appends import_batch and keeps security_barrier");
  ok(/revoke all on function public\.import_leads_v2\(jsonb, boolean, text, boolean, uuid, text\) from public, anon;/.test(mig), "anon cannot call it");
}

console.log("── Job 3: WhatsApp cap, pace and auto-pause ──");
{
  const P = await import("../src/lib/whatsappPace.ts");
  ok(P.DEFAULT_DAILY_CAP === 800 && P.MAX_DAILY_CAP === 1000 && P.DEFAULT_GAP_FLOOR_MIN === 1, "defaults: 800 a day (was 400), never above 1,000, 1 minute floor (unchanged)");
  const e0 = P.effectivePace(null);
  ok(e0.dailyCap === 800 && e0.gapFloorMin === 1 && e0.personDefault === null, "nothing stored → the defaults, no per-person limit");
  ok(P.effectivePace({ daily_cap: 5000 }).dailyCap === 800, "a stored cap above Meta's ceiling is never used (falls back to the default)");
  ok(P.effectivePace({ daily_cap: 0 }).dailyCap === 0, "a cap of 0 is a real setting (send nothing)");
  ok(P.effectivePace({ daily_cap: 300, min_gap_minutes: 3, person_daily_limit_default: 40 }).gapFloorMin === 3, "stored values are used when in range");
  ok(P.effectivePace({ min_gap_minutes: 0 }).gapFloorMin === 1 && P.effectivePace({ daily_cap: 2.5 }).dailyCap === 800, "out-of-range or fractional values fall back");
  ok(P.checkPaceValue("daily_cap", "1001").ok === false && P.checkPaceValue("daily_cap", "-1").ok === false, "the admin's cap is refused above 1,000 or below 0 (never clamped)");
  const okCap = P.checkPaceValue("daily_cap", " 650 ");
  ok(okCap.ok === true && okCap.value === 650, "a typed cap is read as a whole number");
  const blank = P.checkPaceValue("person_limit", "");
  ok(blank.ok === true && blank.value === null, "blank = back to the default");
  ok(P.checkPaceValue("min_gap_minutes", "abc").ok === false, "not a number → refused");

  ok(P.autoPauseVerdict(7, 7).pause === false, "auto-pause: fewer than 8 attempts never pauses (one bad number is not a pattern)");
  ok(P.autoPauseVerdict(20, 19).pause === true, "auto-pause: 19 of 20 failed (8 Oct 2026) → paused");
  ok(P.autoPauseVerdict(20, 9).pause === false && P.autoPauseVerdict(20, 10).pause === true, "auto-pause: the line is half of them failing");
  ok(P.autoPauseVerdict(40, 2).pause === false, "auto-pause: a normal day's ~5% failures never pauses");
  ok(/press Resume/.test(P.autoPauseVerdict(10, 9).reason ?? ""), "auto-pause says why and what to do");

  const q = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(!/^const DAILY_CAP = /m.test(q) && /const DAILY_CAP = pace\.dailyCap;/.test(q), "the drip's cap comes from the one rule, not a constant");
  ok(/Math\.max\(pace\.gapFloorMin, Math\.round\(baseGap \* jitter\)\)/.test(q), "the pacing floor is the admin-set floor (the formula is unchanged)");
  ok(/select\("daily_cap, min_gap_minutes, person_daily_limit_default, auto_paused_at, auto_pause_reason"\)/.test(q)
    && /\.select\("next_send_at, paused"\)/.test(q), "the pace is read separately — the pause flag's own read is untouched");
  const tick = q.slice(q.indexOf('skipped: "outside_window"'), q.indexOf('skipped: "cap_reached"'));
  ok(/autoPauseVerdict\(rows\.length, failed\)/.test(tick) && /\.is\("user_id", null\)\.eq\("test_mode", false\)/.test(tick), "auto-pause runs in the tick, on the queue's own non-test sends, before any send");
  ok(/update\(\{ auto_paused_at: null, auto_pause_reason: null \}\)/.test(q), "Resume clears the auto-pause note");
  const setPace = q.slice(q.indexOf('if (mode === "set_pace")'), q.indexOf('if (mode === "set_auto_reply")'));
  ok(/checkPaceValue\(k, body\[k\]\)/.test(setPace) && /not_a_salesperson/.test(setPace) && /\.eq\("status", "active"\)/.test(setPace), "set_pace checks every value and writes person limits only for active salespeople");
  const gate = q.slice(q.indexOf("let isAdmin = false;"), q.indexOf('if (mode === "queue_state")'));
  ok(/mode === "contact_check" \|\| mode === "suppress_lead" \|\| mode === "queue_state"/.test(gate) && !/set_pace/.test(gate), "set_pace and the status read stay admin-only (Sales gets three read/safety modes only)");

  const mig = read("supabase/migrations/20261024110000_whatsapp_pace_settings.sql");
  ok(/add column if not exists daily_cap integer/.test(mig) && !/drop |delete from|truncate/i.test(mig.replace(/--.*$/gm, "")), "the migration only adds columns and replaces one function");
  ok(/v_limit := coalesce\(\(select daily_send_limit from public\.team_members where user_id = v_uid\),\s*case when public\.my_role\(\) = 'sales' then \(select person_daily_limit_default/.test(mig),
    "sales_queue_opener: own limit first, then the default — for a salesperson only");

  const panel = read("src/components/WhatsAppQueuePanel.tsx");
  ok(/\{teamControls && <WhatsAppPaceSettings/.test(panel), "the limits, per-person counts and auto-pause note show only with team controls (admin)");
}

/* Job 4 (the £99 / £499-upfront price model switch) was removed 2026-10-29: the three payment plans replaced it (paymentPlans.ts). */
console.log(f ? `\n${f} FAILURE(S)` : "\nALL PASS");
process.exit(f ? 1 : 0);
