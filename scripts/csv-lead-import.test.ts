/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CSV LEAD IMPORT (2026-10-05, fix/csv-lead-import; docs/pre-sales-certification/csv-import-fix.md).

   The browser half (src/lib/csvLeadImport.ts: read the file, map the columns, send only the eleven fields in
   calls of IMPORT_BATCH_MAX, words for every answer) and source checks on the server half (migration
   20261010170000: import_leads decides validity, duplicates and the owner). The server's behaviour is proven
   live by supabase/tests/csv-lead-import.sql (rolled back) — its check names are pinned at the bottom.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  IMPORT_FIELDS, IMPORT_BATCH_MAX, IMPORT_FILE_MAX_ROWS, parseCsv, autoMapColumns, buildImportRows, columnLabel,
  runImport, reasonText, outcomeText, callErrorText, problemRows, possibleMatchRows, matchText, type ImportRow, type ImportRpc, type RowResult,
} from "../src/lib/csvLeadImport.ts";
import { leadPermissions } from "../src/lib/access.ts";
import { activityDetail } from "../src/lib/salesCrm.ts";
import { DEFAULT_PROTECTION_LIMITS, GUARD_ACTIONS } from "../src/lib/protectionLimits.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mapAll = (text: string) => { const p = parseCsv(text); const m = autoMapColumns(p.headers); return { p, m, rows: buildImportRows(p, m.mapping) }; };

console.log("── reading the file ──");
{
  const { p, rows } = mapAll("Business Name,Phone,Email\nAcme Plumbing,07700 900001,a@example.invalid\nBeta Locks,07700 900002,\n");
  ok(p.records.length === 2 && rows.length === 2, "basic valid CSV: 2 rows");
  ok(rows[0].business_name === "Acme Plumbing" && rows[0].phone === "07700 900001" && rows[0].email === "a@example.invalid" && rows[0].row === 2, "fields mapped, spreadsheet row 2");
  ok(!("email" in rows[1]), "an empty cell is absent, never an empty string");
}
{
  const { rows } = mapAll('name,address,phone\n"Smith, Jones & Co","1 High St, Leeds, LS1 1AA",07700 900003\n"He said ""hi""",x,07700 900004\n');
  ok(rows[0].business_name === "Smith, Jones & Co" && rows[0].address === "1 High St, Leeds, LS1 1AA", "quoted commas stay inside the cell");
  ok(rows[1].business_name === 'He said "hi"', "doubled quotes are one quote");
}
{
  const { p, rows } = mapAll("﻿Business,Phone\r\nCafé Ünïcode £ Ltd,07700 900005\r\n");
  ok(p.headers[0] === "Business" && rows[0].business_name === "Café Ünïcode £ Ltd", "UTF-8 BOM stripped from the first header; accents and £ kept");
}
{
  const { p, rows } = mapAll("Business,Phone\n\nA Ltd,07700 900006\n,\n   \nB Ltd,07700 900007\n\n");
  ok(rows.length === 2 && rows[0].row === 3 && rows[1].row === 6 && p.records.length === 2, "blank lines (and all-blank rows) skipped, row numbers still match the spreadsheet");
}
{
  const { rows } = mapAll('Business,Notes,Phone\n"Line Ltd","first line\nsecond line",07700 900008\nNext Ltd,,07700 900009\n');
  ok(rows[0].notes === "first line\nsecond line" && rows[1].business_name === "Next Ltd" && rows[1].row === 3, "a line break inside quotes stays in the cell; the next record is spreadsheet row 3 (one row in Excel, two lines in the file)");
}
{
  const s = mapAll("Company;Telephone;E-mail\nSemi Ltd;07700 900010;s@example.invalid\n");
  ok(s.p.delimiter === ";" && s.rows[0].business_name === "Semi Ltd" && s.rows[0].email === "s@example.invalid", "semicolon-separated (European Excel) read");
  const t = mapAll("Company\tMobile\nTab Ltd\t07700 900011\n");
  ok(t.p.delimiter === "\t" && t.rows[0].phone === "07700 900011", "tab-separated read");
}
{
  const p = parseCsv("Business,Phone\n");
  ok(p.headers.length === 2 && p.records.length === 0, "header only → no rows (the dialog says so)");
  ok(parseCsv("").headers.length === 0, "empty file → no header");
}
{
  const { rows } = mapAll("Business,Phone\n  Spaced   Ltd  ,  07700 900012  \n");
  ok(rows[0].business_name === "Spaced   Ltd" && rows[0].phone === "07700 900012", "cells trimmed at the edges; inner text left to the server (it collapses whitespace)");
}
{
  const lines = ["Business,Phone,Email"];
  for (let i = 0; i < 150; i++) lines.push(`Bulk ${i},07700 9${String(i).padStart(5, "0")},b${i}@example.invalid`);
  const { rows } = mapAll(lines.join("\n"));
  ok(rows.length === 150 && rows[149].row === 151, "a 150-row file reads every row");
}

console.log("\n── matching the columns ──");
{
  // 2026-10-07: + the optional Country column (migration 20261014100200), so thirteen headers for thirteen fields.
  const m = autoMapColumns(["Company Name", "Contact Person", "Mobile", "Email Address", "Website URL", "Street Address", "Post Code", "City", "Category", "Comments", "Google Maps Link", "Place ID", "Country"]).mapping;
  ok(IMPORT_FIELDS.every((fld, i) => m[fld] === i), "common header names map to all thirteen fields (Place ID and Country included)");
  const n = autoMapColumns(["Name", "Phone"]).mapping;
  ok(n.business_name === 0, "a bare Name column is the business");
  const both = autoMapColumns(["Contact Name", "Business", "Phone"]).mapping;
  ok(both.business_name === 1 && both.contact_name === 0, "Contact Name is the person, Business is the business");
}
{
  const r = autoMapColumns(["Business", "Phone", "Phone", "Assigned To", "Owner", "Status", "Commission", "Paid", "user_id"]);
  ok(r.mapping.phone === 1, "a repeated header maps to its first column");
  ok(r.notes.some((n) => /"Phone" appears 2 times \(columns 2, 3\)/.test(n)), "…and the screen says which one it used");
  ok(r.notes.some((n) => /Not imported: .*"Assigned To".*"Owner".*"Status".*"Commission".*"Paid".*"user_id"/.test(n)), "owner / status / commission / paid / user_id columns are listed as NOT imported");
  ok(columnLabel(["Business", "Phone", "Phone"], 2) === "Phone (column 3)" && columnLabel(["Business", "Phone"], 1) === "Phone", "repeated headers carry their column number in the picker");
}
{
  const { rows } = mapAll("Business,Phone,Assigned To,Owner,Status,Commission,Paid,user_id,sold_by_user_id,amount_paid,list_type\nX Ltd,07700 900013,rep-b,rep-b,payment_received,50,yes,u,u,999,imported\n");
  const keys = Object.keys(rows[0]).sort().join(",");
  ok(keys === "business_name,phone,row", `only allowlisted fields are ever sent (got: ${keys})`);
}
{
  const { rows, m } = mapAll("Business,Email\nOnly Email Ltd,o@example.invalid\n");
  ok(rows[0].email === "o@example.invalid" && m.mapping.phone === null && m.mapping.website === null, "missing optional columns are simply not imported");
}

console.log("\n── sending: calls of IMPORT_BATCH_MAX, one transaction each, stop and say where ──");
{
  const mk = (n: number): ImportRow[] => Array.from({ length: n }, (_, i) => ({ row: i + 2, business_name: `B${i}`, phone: `07700 9${String(i).padStart(5, "0")}` }));
  const calls: Array<{ n: number; commit: boolean; possible: boolean; keys: string }> = [];
  const rpc: ImportRpc = async (args) => {
    calls.push({ n: args._rows.length, commit: args._commit, possible: args._import_possible, keys: Object.keys(args).sort().join(",") });
    const rows: RowResult[] = args._rows.map((r, i) => ({ i: i + 1, row: r.row, business_name: r.business_name, outcome: args._commit ? "created" : "new", lead_id: args._commit ? `id-${r.row}` : undefined }));
    return { data: { ok: true, committed: args._commit, counts: { rows: rows.length, valid: rows.length, invalid: 0, duplicate_in_file: 0, existing: 0, new: rows.length, update: 0, skipped: 0, created: args._commit ? rows.length : 0, updated: 0, failed: 0 }, rows }, error: null };
  };
  const rep = await runImport(rpc, mk(1201), true, "big.csv");
  ok(calls.length === 3 && calls.map((c) => c.n).join(",") === `${IMPORT_BATCH_MAX},${IMPORT_BATCH_MAX},201`, `1,201 rows → 3 calls of at most ${IMPORT_BATCH_MAX}`);
  ok(calls.every((c) => c.commit && c.keys === "_commit,_file_name,_import_possible,_rows" && c.possible === false), "every call carries only rows, commit, the file name and the held-matches choice (off unless ticked) — never an owner");
  calls.length = 0;
  await runImport(rpc, mk(3), true, "x.csv", undefined, true);
  ok(calls.length === 1 && calls[0].possible === true, "ticking \"import these too\" sends _import_possible = true");
  ok(rep.counts.created === 1201 && rep.createdIds.length === 1201 && !rep.stopped, "counts summed across calls; every created id collected");
  ok(IMPORT_FILE_MAX_ROWS >= 1000 && IMPORT_FILE_MAX_ROWS / IMPORT_BATCH_MAX <= 4, "a whole file is at most a few calls");
}
{
  let n = 0;
  const rpc: ImportRpc = async (args) => {
    n++;
    if (n === 2) return { data: null, error: { message: "network down" } };
    const rows: RowResult[] = args._rows.map((r, i) => ({ i: i + 1, row: r.row, outcome: "created", lead_id: `id-${r.row}` }));
    return { data: { ok: true, counts: { rows: rows.length, valid: rows.length, invalid: 0, duplicate_in_file: 0, existing: 0, new: rows.length, update: 0, skipped: 0, created: rows.length, updated: 0, failed: 0 }, rows }, error: null };
  };
  const rows = Array.from({ length: 1100 }, (_, i) => ({ row: i + 2, business_name: `B${i}`, phone: "x" }));
  const rep = await runImport(rpc, rows, true, null);
  ok(n === 2 && rep.counts.created === 500 && rep.stopped?.fromRow === 502 && rep.stopped?.toRow === 1101 && rep.stopped.message === "network down",
    "a failed call stops the run and names the rows NOT imported (502–1101); the 500 before it stand");
}
{
  const rpc: ImportRpc = async () => ({ data: { ok: false, error: "usage_paused", reason: null }, error: null });
  const rep = await runImport(rpc, [{ row: 2, business_name: "x", phone: "1" }], false, null);
  ok(rep.stopped?.message === "Usage temporarily paused — contact Paul" && rep.rows.length === 0, "a guard refusal reads as the salesperson's usual pause sentence, nothing counted");
  ok(/most is 500/.test(callErrorText({ ok: false, error: "too_many_rows", max: 500 })), "too many rows is explained");
}

console.log("\n── words ──");
{
  const owned: RowResult = { i: 1, row: 9, outcome: "skipped", reasons: ["owned_by_other"], owner_name: "Imp A" };
  ok(reasonText("owned_by_other", owned, true) === "Already owned by Imp A — not changed", "admin: told whose lead it is");
  ok(!/Imp A/.test(reasonText("owned_by_other", owned, false)) && /another team member/.test(reasonText("owned_by_other", owned, false)), "salesperson: never told whose it is, even if a name arrived");
  ok(/claim it there/.test(reasonText("exists_unassigned", owned, true)) && !/claim/.test(reasonText("exists_unassigned", owned, false)), "unassigned: admin pointed to Unassigned; salesperson just told it is not theirs");
  ok(reasonText("invalid_phone", owned, false) === "Phone number not recognised" && reasonText("no_phone_or_email", owned, false) === "Needs a phone number or an email", "invalid rows say why");
  ok(reasonText("duplicate_in_file", { first_row: 2 }, false) === "Repeats row 2 of this file", "in-file duplicate names the first row");
  ok(reasonText("too_long:business_name", {}, false) === "Business name is too long", "too-long field named");
  ok(outcomeText({ i: 1, row: 3, outcome: "update", fields: ["contact_name", "email"] }, false) === "Yours already — will fill in the blank contact, email", "a fill-in says which blanks");
  const nm: RowResult = { i: 1, row: 12, business_name: "Premier Plumbing", outcome: "new", reasons: ["possible_match_name"], match: { others: 2, owners: ["test1", "Unassigned"], towns: ["Leeds", "York"] } };
  ok(/^Will be added — possible match: Same business name as another lead\. Matches 2 leads owned by test1, Unassigned \(Leeds, York\)$/.test(outcomeText(nm, true)), "admin: a same-name row will be ADDED, with the other towns and owners: " + outcomeText(nm, true));
  const nmSales: RowResult = { i: 1, row: 12, business_name: "Premier Plumbing", outcome: "new", reasons: ["possible_match_name"], match: { yours: 0, others: 1 } };
  ok(outcomeText(nmSales, false) === "Will be added — possible match: Same business name as another lead. Matches a lead elsewhere in the system", "salesperson: told only that a lead elsewhere has the name — no owner, no town");
  ok(!/test1/.test(matchText({ others: 1, owners: ["test1"] }, false)), "…and never prints an owner name for a salesperson, even if one arrived");
  ok(/^Held — possible match: Same website as another lead/.test(outcomeText({ i: 1, row: 13, outcome: "held", reasons: ["possible_match_website"], match: { yours: 1 } }, false)) &&
     /Not added unless you tick/.test(outcomeText({ i: 1, row: 13, outcome: "held", reasons: ["possible_match_website"] }, false)), "a held row says why and how to import it");
  const mixed: RowResult[] = [nm, { i: 2, row: 13, outcome: "held", reasons: ["possible_match_name_location"] }, { i: 3, row: 14, outcome: "skipped", reasons: ["owned_by_other"] },
    { i: 4, row: 15, outcome: "duplicate_in_file", reasons: ["duplicate_in_file"] }, { i: 5, row: 16, outcome: "new" }];
  ok(possibleMatchRows(mixed).map((r) => r.row).join(",") === "12,13" && problemRows(mixed).map((r) => r.row).join(",") === "14,15",
    "POSSIBLE MATCHES and DUPLICATES are two separate lists; a plain new row is in neither");
  const pr = problemRows([{ i: 1, row: 2, outcome: "created" }, { i: 2, row: 3, outcome: "invalid", reasons: ["invalid_email"] }, { i: 3, row: 4, outcome: "updated" }, { i: 4, row: 5, outcome: "failed", reasons: ["write_failed"] }]);
  ok(pr.map((r) => r.row).join(",") === "3,5", "the problem list holds every row not added — invalid and failed included");
}

{
  const name = () => "x";
  ok(activityDetail({ kind: "lead_added", data: { source: "csv_import", file: "leeds.csv", row: 7 } }, name) === "Source: CSV import (leeds.csv, row 7)", "lead history: \"Source: CSV import (file, row)\"");
  ok(activityDetail({ kind: "lead_added", data: { source: "referral" } }, name) === "Source: referral", "…other sources unchanged");
  ok(activityDetail({ kind: "details_set", data: { email: "a@example.invalid", source: "CSV import" } }, name) === "email: a@example.invalid · from: CSV import", "a fill-in reads which field and \"from: CSV import\"");
}

console.log("\n── who may import ──");
{
  ok(leadPermissions("admin").importLeads === true, "Paul imports");
  ok(leadPermissions("sales", true).importLeads === true, "a Ready-to-Sell salesperson imports (into their own leads)");
  ok(leadPermissions("sales", false).importLeads === false, "a salesperson not Ready to Sell does not");
  ok(leadPermissions(null).importLeads === false, "no role, no import");
  ok((GUARD_ACTIONS as readonly string[]).includes("lead_import") && DEFAULT_PROTECTION_LIMITS.actions.lead_import.paid === false
    && DEFAULT_PROTECTION_LIMITS.actions.lead_import.max_rows === IMPORT_BATCH_MAX, "the guard knows lead_import (unpaid; max_rows = the per-call ceiling)");
}

console.log("\n── the server function (source) ──");
const MIG = read("supabase/migrations/20261010170000_csv_lead_import.sql");
{
  const body = MIG.slice(MIG.indexOf("create or replace function public.import_leads"));
  ok(/security definer/.test(body) && /set search_path to 'public'/.test(body), "import_leads is SECURITY DEFINER with a fixed search_path");
  ok(/if v_role is null or v_uid is null then raise exception 'no_role'/.test(body), "no role → refused");
  ok(/v_n > v_max then return jsonb_build_object\('ok', false, 'error', 'too_many_rows'/.test(body) && /v_max constant integer := 500;/.test(body), "more than 500 rows in one call → refused (= IMPORT_BATCH_MAX)");
  ok(/public\.guard_action\(v_uid, 'lead_import', null, 0, v_n,/.test(body), "every call goes through the usage guard with its row count");
  const keys = [...body.matchAll(/x ->> '([a-z_]+)'/g)].map((m) => m[1]);
  const allowed = new Set([...IMPORT_FIELDS, "row"]);
  ok(keys.length > 0 && keys.every((k) => allowed.has(k)), `the function reads ONLY the eleven fields + row from a CSV row (read: ${[...new Set(keys)].join(", ")})`);
  ok(!/x ->> '(assigned_to_user_id|user_id|status|amount_paid|sold_by_user_id|list_type|campaign_id|is_archived)'/.test(body), "…never an owner, status, payment, seller, list type, campaign or archive flag");
  const ins = body.slice(body.indexOf("insert into public.outreach_leads ("), body.indexOf("returning id into v_id;"));
  ok(/v_book, v_uid, v_uid, now\(\)/.test(ins), "insert: user_id = the book owner; added_by AND owner = the caller (auth.uid())");
  ok(/'not_contacted', 'none', 'UK', 'manual'\)/.test(ins), "insert: not_contacted, no next action, UK, list_type 'manual'");
  ok(!/imported/.test(ins) && !/alter table[^;]*list_type/i.test(MIG), "no 'imported' list type and the CHECK is not widened");
  ok(!/(whatsapp|queued_at|campaign_id|sold_|amount_paid|is_potential_work|paid_|subscription|contract)/.test(ins), "insert sets no WhatsApp / queue / campaign / seller / payment / star / sign-up / subscription / contract field");
  ok(/'lead_added', jsonb_strip_nulls\(jsonb_build_object\('source', 'csv_import'/.test(body), "the origin is recorded on the lead's history: lead_added source csv_import");
  ok(/from public\._lead_identity_rows\(v_items\)/.test(body), "duplicates: the canonical _lead_identity_rows (place id → phone → Maps link)");
  ok(/pg_advisory_xact_lock\(hashtextextended\('outreach_leads\.phone_key:'/.test(body), "…under the same phone-key lock sales_add_lead takes");
  ok(/when 'owned' then 'owned_by_other'/.test(body) && /else 'exists_unassigned'/.test(body), "another owner's lead or an unassigned one → skipped, never claimed");
  ok(/where l\.id = v_id and l\.assigned_to_user_id = v_uid and not public\.lead_is_client/.test(body) && /coalesce\(nullif\(btrim\(coalesce\(l\.email, ''\)\), ''\), v_fill ->> 'email'\)/.test(body),
    "a fill-in touches only the caller's own non-client lead, and only blank fields");
  ok(/'owner_name', case when v_role = 'admin'/.test(body), "an owner's name is returned to the admin only");
  ok(/'lead_id', case when v_outcome in \('created', 'updated'\)/.test(body), "a lead id is returned only for the caller's own created / filled lead");
  ok(/exception when others then\n\s+v_outcome := 'failed'/.test(body), "a row that fails to write is reported as failed; the rest of the call stands");
  ok(/revoke all on function public\.import_leads\(jsonb, boolean, text, boolean\) from public, anon;/.test(MIG) && /grant execute on function public\.import_leads\(jsonb, boolean, text, boolean\) to authenticated;/.test(MIG), "anon cannot call it; signed-in users can (the role check is inside)");
  // ── DUPLICATE vs POSSIBLE MATCH (Paul, 2026-10-05: a name alone never blocks) ──
  ok(!/possible_duplicate/.test(body), "no 'possible duplicate' skip remains");
  ok(/foreach v_key in array array_remove\(array\['g:' \|\| c_pid, 'p:' \|\| c_pk, 'm:' \|\| coalesce\(c_cid, lower\(c_maps\)\)\], null\)/.test(body),
    "a HARD repeat inside the file is only the same Place ID, phone or Maps listing (never name, website or email)");
  ok(/v_items := v_items \|\| jsonb_build_object\('k', i::text, 'place_id', c_pid, 'phone', c_phone, 'maps_url', c_maps\)/.test(body), "the Place ID goes to the canonical lookup");
  ok(/substring\(l\.google_maps_url from '\[\?&\]cid=\(\[0-9\]\+\)'\)/.test(body), "the Maps listing is also matched by its cid (stored links carry a per-search g_mp)");
  const nameOnly = body.slice(body.indexOf("-- The same name ONLY: a warning."), body.indexOf("if v_reason is not null then", body.indexOf("-- The same name ONLY: a warning.")));
  ok(/v_reason := 'possible_match_name';/.test(nameOnly) && !/v_held := true/.test(nameOnly), "same name ONLY → a warning, never held, never skipped");
  ok(/v_reason := 'possible_match_website'; v_held := true;/.test(body) && /v_reason := 'possible_match_name_location'; v_held := true;/.test(body),
    "same website (sales_add_lead's confirm rule) or same name + same postcode / address → held");
  ok(/if v_held and not v_confirm then v_outcome := 'held'; end if;/.test(body) && /v_confirm boolean := coalesce\(_import_possible, false\);/.test(body), "a held row is imported only when the person ticked \"import these too\"");
  ok(/'owners', case when v_role = 'admin' then/.test(body) && /\(v_role = 'admin' or \(e ->> 'owner'\)::uuid = v_uid\)/.test(body),
    "a possible match's owners go to the admin only; its towns only to the admin or for the caller's OWN leads");
  ok(!/\b(whatsapp_sends|whatsapp_messages|sales_queue_opener|campaign_launch|lead_set_stage|lead_mark_interested|net\.http)/.test(body), "the function sends, queues, launches and changes stage NOTHING");
}

console.log("\n── the browser no longer writes leads itself ──");
{
  const hook = read("src/hooks/useOutreach.ts");
  ok(!/list_type: 'imported'/.test(hook) && !/bulkImportLeads/.test(hook), "useOutreach: the old insert loop (list_type 'imported') is gone");
  const at = hook.indexOf("const afterCsvImport = useCallback(");
  const body = hook.slice(at, hook.indexOf("const updateClientDetails", at));
  ok(at > 0 && !/\.from\('outreach_leads'\)/.test(body) && /if \(isSales\(\) \|\| !importedIds\.length\)/.test(body) && /backfill-lead-towns/.test(body),
    "afterCsvImport writes no lead; only the admin's created leads get the town check");
  const salesBranch = body.slice(body.indexOf("if (isSales() || !importedIds.length)"), body.indexOf("/* ── VERIFY AS IT LANDS"));
  ok(/await fetchLeads\(\);\n\s+return \{ verified: 0, unverifiable: 0 \};/.test(salesBranch) && !/backfill-lead-towns/.test(salesBranch),
    "a SALESPERSON's import never triggers the paid town check (Paul, 2026-10-05: same as their manual Add a lead)");
  const dlg = read("src/components/CSVImportDialog.tsx");
  ok(/\('import_leads', args\)/.test(dlg) && !/\.from\(/.test(dlg), "the dialog imports through import_leads only");
  ok(!/assigned_to|user_id|owner_id|status:/.test(dlg), "the dialog never sends an owner or a status");
  ok(/Nobody is messaged/.test(dlg) && /nothing is queued/.test(dlg), "the dialog says nobody is messaged and nothing is queued");
  const page = read("src/pages/Outreach.tsx");
  ok(/onImportLeads=\{perms\.importLeads \? async \(\{ createdIds \}\) => \{\n\s+await afterCsvImport\(createdIds\);/.test(page), "Outreach gates the import on perms.importLeads and hands the created ids on");
}

console.log("\n── the live SQL suite covers ──");
const sqlSuite = read("supabase/tests/csv-lead-import.sql");
for (const name of [
  "A preview: wrote nothing", "new row: owned by A, added by A, user_id = the book owner", "new row: list_type manual (no ''imported''), country UK",
  "new row: NO injected field landed", "B''s lead: untouched", "unassigned lead: still unassigned, no activity (never claimed)",
  "NO CONTACT: nothing queued or sent for any ZZ import row", "120 rows with ONE bad row: 119 created, 1 invalid named, nothing else lost",
  "B importing A''s phone: skipped owned_by_other, no name, no id, nothing created", "not-onboarded salesperson: refused",
  "Paul import: owned by Paul even when the CSV names a salesperson", "anon cannot execute import_leads",
  "A preview: SAME NAME ONLY (other town) → will be added, flagged possible_match_name",
  "A preview (salesperson): the same-name match names NO owner and NO town of someone else''s lead",
  "A preview: same website → HELD possible_match_website", "A preview: same name + same postcode → HELD possible_match_name_location",
  "A preview: DUPLICATE by Place ID", "A preview: DUPLICATE by Maps listing (same cid, different g_mp)", "A preview: DUPLICATE by phone",
  "A preview: same name twice in the file, two towns → both added", "A confirms the held possible matches → both created",
  "same name in another town LANDED as A''s own lead", "B, same name as A''s lead: ADDED for B, flagged — no owner, no town, no id of A''s lead",
  "Paul, same name as A''s lead (other phone): ADDED as a possible match; the admin sees the town and the owner",
]) {
  ok(sqlSuite.includes(name), `live SQL suite covers: ${name.replace(/''/g, "'")}`);
}

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
