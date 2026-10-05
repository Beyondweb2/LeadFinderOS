/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALESPERSON ONBOARDING (2026-10-05, docs/salesperson-onboarding.md).
   The checklist rules in src/lib/salespersonOnboarding.ts, the save validation fn admin-users runs, and
   the structure that keeps the records admin-only (no RLS policy, no reader but admin-users) — plus the
   fence that this work did not reach any WhatsApp sender.
   The live RLS proof is supabase/tests/salesperson-onboarding-rls.sql (run against the database, rolled back).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CONTRACTOR_AGREEMENT_VERSIONS, ONBOARDING_FIELDS, PRIVACY_NOTICE_VERSIONS, RTW_METHODS, TEAM_GUIDE_VERSIONS,
  addMonths, emptyOnboardingRecord, normaliseCompanyNumber, normaliseVatNumber, onboardingSummary, sensitiveTextProblem,
  validateOnboardingPatch, type MemberState, type OnboardingRecord,
} from "../src/lib/salespersonOnboarding.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const TODAY = "2026-10-20";
const ACTIVE: MemberState = { status: "active", role: "sales", suspended_at: null, has_signed_in: true };
const FINAL_NOTICE = { id: "test-final-notice", label: "Final notice", final: true, outstanding: [] };
const full = (over: Partial<OnboardingRecord> = {}): OnboardingRecord => ({
  ...emptyOnboardingRecord("u1"),
  agreement_version: CONTRACTOR_AGREEMENT_VERSIONS[0].id, agreement_signed_on: "2026-10-06",
  privacy_notice_version: FINAL_NOTICE.id, privacy_notice_given_on: "2026-10-06",
  age_18_confirmed_on: "2026-10-06",
  rtw_method: "in_person_original", rtw_checked_on: "2026-10-06", rtw_checked_by: "Paul James Sales", rtw_result: "pass", rtw_evidence_ref: "Secure folder / RTW / A",
  bank_details_received_on: "2026-10-06", vat_registered: false, contractor_type: "individual", start_date: "2026-10-07",
  team_guide_version: TEAM_GUIDE_VERSIONS[0].id, team_guide_acknowledged_on: "2026-10-06",
  ...over,
});
/* The real registry has no final privacy notice yet (that is the point) — the "complete" cases borrow one. */
(PRIVACY_NOTICE_VERSIONS as unknown as typeof FINAL_NOTICE[]).push(FINAL_NOTICE);
const sum = (r: OnboardingRecord | null, m: MemberState = ACTIVE) => onboardingSummary(r, m, TODAY);
const item = (r: OnboardingRecord | null, key: string, m: MemberState = ACTIVE) => sum(r, m).items.find((i) => i.key === key)!;

console.log("── a complete record on a live sales login is READY TO SELL ──");
{
  const s = sum(full());
  ok(s.readyToSell && s.done === s.total && s.missing.length === 0, `ready, ${s.done}/${s.total}`);
  ok(s.total === 10, "ten blocking items (Schedule 2 is optional and never blocks)");
  const empty = sum(null);
  ok(!empty.readyToSell && empty.done === 1 && empty.missing.length === 9, `no record: only the login counts (${empty.done}/${empty.total})`);
}

console.log("\n── an inactive rep is never treated as fully onboarded ──");
for (const [why, m] of [
  ["disabled", { status: "disabled", role: null } as MemberState],
  ["suspended", { ...ACTIVE, suspended_at: "2026-10-10T10:00:00Z" }],
  ["no sales role", { status: "active", role: null } as MemberState],
  ["an admin", { status: "active", role: "admin" } as MemberState],
] as const) {
  const s = sum(full(), m);
  ok(!s.readyToSell && !s.activeMember && !!s.inactiveReason, `${why}: not ready (${s.inactiveReason})`);
}
{
  const s = sum(full({ end_date: "2026-10-15", end_reason: "resigned" }));
  ok(!s.readyToSell && /Ended/.test(s.inactiveReason ?? ""), "past their end date: not ready even with the login still on");
  ok(s.leaver.accessStillOn && s.notes.some((n) => /Press Disable/.test(n)), "…and the panel says access is still on and to Disable");
  const notice = sum(full({ end_date: "2026-11-01", end_reason: "ended_on_notice" }));
  ok(notice.readyToSell && notice.notes.some((n) => /end date/.test(n)), "working out their notice: still ready, the end date shown");
}

console.log("\n── agreement and privacy-notice versions ──");
{
  ok(validateOnboardingPatch({ agreement_version: "made-up-v9" }, null).ok === false, "an unknown agreement version is refused");
  ok(validateOnboardingPatch({ privacy_notice_version: "made-up" }, null).ok === false, "an unknown privacy-notice version is refused");
  ok(validateOnboardingPatch({ team_guide_version: "made-up" }, null).ok === false, "an unknown team-guide version is refused");
  const draft = PRIVACY_NOTICE_VERSIONS.find((v) => v.id === "salesperson-privacy-notice-draft-2026-10-05")!;
  ok(!!draft && draft.final === false && draft.outstanding.length >= 8, `the uploaded notice is registered as a DRAFT with ${draft?.outstanding.length} outstanding items`);
  ok(validateOnboardingPatch({ privacy_notice_version: draft.id, privacy_notice_given_on: "2026-10-06" }, null).ok, "the draft that was actually given can be RECORDED");
  const it = item(full({ privacy_notice_version: draft.id }), "privacy_notice");
  ok(!it.done && /draft/i.test(it.detail), "…but a draft never completes the privacy-notice item");
  ok(sum(full({ privacy_notice_version: draft.id })).notes.some((n) => /draft/.test(n)), "…and it is flagged as a draft");
  ok(!item(full({ agreement_signed_on: null }), "agreement").done, "an agreement version with no signing date is not done");
  ok(item(full(), "agreement").detail.includes(CONTRACTOR_AGREEMENT_VERSIONS[0].label), "the stored agreement version is what the item names");
  ok(sum(full()).notes.some((n) => /4\.3\(c\)/.test(n)), "the agreement's WhatsApp clause is flagged as being amended, never encoded");
}

console.log("\n── right to work ──");
{
  ok(item(full(), "right_to_work").done, "pass + method + date + checker + evidence location = done");
  ok(!item(full({ rtw_evidence_ref: null }), "right_to_work").done, "no evidence location: not done");
  ok(!item(full({ rtw_checked_by: null }), "right_to_work").done, "no checker: not done");
  ok(!item(full({ rtw_result: "fail" }), "right_to_work").done && /FAILED/.test(item(full({ rtw_result: "fail" }), "right_to_work").detail), "a failed check blocks and says so");
  ok(!item(full({ rtw_result: null }), "right_to_work").done, "no result: not done");
  ok(!item(full({ rtw_method: "certified_provider" }), "right_to_work").done, "a certified-provider check needs the provider's name");
  ok(item(full({ rtw_method: "certified_provider", rtw_provider: "Example IDSP" }), "right_to_work").done, "…and is done with it");
  ok(!item(full({ rtw_recheck_due: "2026-10-19" }), "right_to_work").done, "a follow-up check that has fallen due blocks");
  ok(item(full({ rtw_recheck_due: "2027-04-01" }), "right_to_work").done, "a follow-up check in the future does not");
  const video = sum(full({ rtw_method: "video_call_original_not_held" }));
  ok(video.readyToSell && video.notes.some((n) => /no legal defence/.test(n)), "a video check counts, with the checklist's caution that it gives no legal defence");
  ok(RTW_METHODS.video_call_original_not_held.checklistDefence === false && RTW_METHODS.certified_provider.checklistDefence === true, "the method table carries the checklist's reading, not a claim of its own");
  ok(validateOnboardingPatch({ rtw_provider: "X" }, full()).ok === false, "a provider name without the certified method is refused");
  ok(sum(full({ rtw_checked_on: "2026-10-08" })).notes.some((n) => /after the start date/.test(n)), "a check dated after the start date is flagged");
}

console.log("\n── 18+, bank, VAT ──");
{
  ok(!item(full({ age_18_confirmed_on: null }), "age_18").done, "18+ not confirmed: not done");
  ok(!item(full({ bank_details_received_on: null }), "bank_details").done, "bank details not received: not done");
  ok(!("bank_account" in ONBOARDING_FIELDS) && !Object.keys(ONBOARDING_FIELDS).some((k) => /sort|account_number|iban|passport|birth|dob/.test(k)), "no field exists for an account number, sort code, IBAN, passport or birth date");
  ok(!item(full({ vat_registered: null }), "vat").done, "VAT not asked: not done");
  ok(!item(full({ vat_registered: true }), "vat").done, "VAT registered without a number: not done");
  ok(item(full({ vat_registered: true, vat_number: "GB123456789" }), "vat").done, "VAT registered with a number: done");
  ok(normaliseVatNumber("gb 123 4567 89") === "GB123456789" && normaliseVatNumber("123456789") === "GB123456789" && normaliseVatNumber("12345") === null, "VAT numbers normalise; a wrong shape is refused");
  const v = validateOnboardingPatch({ vat_registered: true, vat_number: "123 456 789" }, null);
  ok(v.ok && v.clean.vat_number === "GB123456789", "the saved VAT number is normalised");
  ok(validateOnboardingPatch({ vat_number: "GB123456789" }, full({ vat_registered: false })).ok === false, "a VAT number on someone marked not registered is refused");
}

console.log("\n── individual or limited company ──");
{
  ok(item(full(), "contractor_status").done, "individual: done");
  const ltd = full({ contractor_type: "limited_company" });
  ok(!item(ltd, "contractor_status").done && /contract has to be with their company/.test(item(ltd, "contractor_status").detail), "limited company without its details: not done, says the contract must be with the company");
  ok(sum(ltd).notes.some((n) => /adviser/.test(n)), "limited company: flagged for advice (checklist Part 13)");
  ok(item(full({ contractor_type: "limited_company", company_name: "A Ltd", company_number: "01234567", company_contract_confirmed_on: "2026-10-06" }), "contractor_status").done, "limited company with name, number and contract confirmed: done");
  ok(validateOnboardingPatch({ company_name: "A Ltd" }, full()).ok === false, "company details on an individual are refused");
  ok(normaliseCompanyNumber("1234567") === "01234567" && normaliseCompanyNumber("sc123456") === "SC123456" && normaliseCompanyNumber("ABC") === null, "company numbers normalise");
}

console.log("\n── Schedule 2 and the team guide ──");
{
  ok(sum(full()).readyToSell && !item(full(), "schedule2").blocking, "Schedule 2 outstanding never blocks (it is optional)");
  ok(/due by 14 Oct 2026|ended 14 Oct 2026/.test(item(full(), "schedule2").detail), `Schedule 2 shows its 7-day deadline (${item(full(), "schedule2").detail})`);
  ok(item(full({ schedule2_status: "received", schedule2_on: "2026-10-10" }), "schedule2").done, "Schedule 2 received: done");
  ok(item(full({ schedule2_status: "none" }), "schedule2").done, "Schedule 2 none listed: done");
  ok(!item(full({ team_guide_acknowledged_on: null }), "team_guide").done, "team guide version without a date: not done");
  ok(!item(full({ team_guide_version: null, team_guide_acknowledged_on: null }), "team_guide").done, "team guide not acknowledged: not done");
}

console.log("\n── the login is read from the live account, never stored ──");
{
  ok(!("login_created" in ONBOARDING_FIELDS), "there is no stored 'login created' tick");
  ok(item(full(), "login", { ...ACTIVE, has_signed_in: false }).done, "an active sales login that has not signed in yet still counts as created");
}

console.log("\n── save validation ──");
{
  ok(validateOnboardingPatch({ is_ready: true }, null).ok === false, "an unknown field is refused, never dropped");
  ok(validateOnboardingPatch({ start_date: "2026-02-30" }, null).ok === false, "an impossible date is refused");
  ok(validateOnboardingPatch({ vat_registered: "yes" }, null).ok === false, "a yes/no must be a boolean");
  ok(validateOnboardingPatch({ end_date: "2026-11-01" }, full()).ok === false, "an end date without a reason is refused");
  ok(validateOnboardingPatch({ end_date: "2026-11-01", end_reason: "misconduct" }, full()).ok, "an end date with a reason saves");
  ok(validateOnboardingPatch({ misconduct_notified_on: "2026-12-01" }, full({ end_date: "2026-11-01", end_reason: "resigned" })).ok, "misconduct found later, inside 6 months, saves");
  ok(validateOnboardingPatch({ misconduct_notified_on: "2027-06-01" }, full({ end_date: "2026-11-01", end_reason: "resigned" })).ok === false, "…outside 6 months is refused");
  ok(validateOnboardingPatch({ misconduct_notified_on: "2026-12-01" }, full({ end_date: "2026-11-01", end_reason: "misconduct" })).ok === false, "…and on someone already ended for misconduct is refused");
  ok(validateOnboardingPatch({ data_deletion_confirmed_on: "2026-11-02" }, full()).ok === false, "data deletion needs an end date first");
  ok(addMonths("2026-08-31", 6) === "2027-02-28", "six months from 31 Aug is 28 Feb");
}

console.log("\n── no raw sensitive data ──");
for (const [t, l] of [
  ["Passport 123456789", "a 9-digit passport number"], ["passport no. on file", "the words passport number"], ["sort code 12-34-56", "a sort code"],
  ["acc 12345678", "an 8-digit account number"], ["GB29 NWBK 6016 1331 9268 19", "an IBAN"], ["DOB 1 Jan 1990", "a date of birth"],
] as const) {
  ok(sensitiveTextProblem(t) !== null, `refuses ${l}`);
  ok(validateOnboardingPatch({ rtw_notes: t }, null).ok === false, `a save with ${l} in the notes is refused`);
}
ok(sensitiveTextProblem("Secure folder / RTW / Jane Smith") === null && sensitiveTextProblem("Original seen on video, 6 Oct") === null, "an ordinary evidence location and note are accepted");
ok(validateOnboardingPatch({ rtw_evidence_ref: "Folder 123456789" }, null).ok === false, "the evidence location is scanned too");

console.log("\n── the records are admin-only by construction ──");
{
  const mig = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");
  ok(/alter table public\.salesperson_onboarding enable row level security/.test(mig), "salesperson_onboarding: RLS on");
  ok(/revoke all on public\.salesperson_onboarding from public, anon, authenticated/.test(mig), "salesperson_onboarding: every privilege revoked from anon and authenticated");
  ok(!/create policy [^\n]* on public\.salesperson_onboarding(_log)?\b/.test(mig), "salesperson_onboarding and its log: NO policy (zero policies = no signed-in reader at all)");
  ok(/revoke all on public\.salesperson_onboarding_log from public, anon, authenticated/.test(mig), "the change log: revoked too");
  ok(/salesperson_onboarding_log is append-only/.test(mig), "the change log is append-only");
  const cols = new Set([...mig.slice(mig.indexOf("create table if not exists public.salesperson_onboarding ("), mig.indexOf("alter table public.salesperson_onboarding enable")).matchAll(/^\s{2}([a-z0-9_]+)\s/gm)].map((m) => m[1]));
  for (const k of Object.keys(ONBOARDING_FIELDS)) ok(cols.has(k), `column exists for ${k}`);
  const fn = read("supabase/functions/admin-users/index.ts");
  const adminGate = fn.indexOf("Not authorized - no admin role");
  ok(adminGate > 0 && fn.indexOf("'team_onboarding_list'") > adminGate && fn.indexOf("'team_onboarding_save'") > adminGate, "both onboarding actions sit after admin-users' admin check");
  ok(/validateOnboardingPatch\(body\.patch/.test(fn), "every save is validated by the shared rule file");
  ok(/not_a_salesperson/.test(fn), "the book owner and admins get no onboarding record");
  /* No other reader: only admin-users touches the table, and no client code queries it directly. */
  const readers: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(path.join(ROOT, dir))) {
      const p = path.join(dir, n);
      if (n === "node_modules") continue;
      if (statSync(path.join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && /['"`]salesperson_onboarding(_log)?['"`]/.test(read(p))) readers.push(p.replace(/\\/g, "/"));
    }
  };
  walk("src"); walk("supabase/functions");
  ok(readers.length === 1 && readers[0] === "supabase/functions/admin-users/index.ts", `the only code that names the table is fn admin-users (${readers.join(", ")})`);
  const team = read("src/pages/Team.tsx");
  ok(/team_onboarding_list/.test(team) && !/from\('salesperson_onboarding/.test(team), "the Team page reads onboarding through admin-users, never the table");
}

console.log("\n── no WhatsApp behaviour changed ──");
{
  const senders = [
    "supabase/functions/send-whatsapp-message/index.ts", "supabase/functions/send-whatsapp-voice/index.ts",
    "supabase/functions/process-whatsapp-queue/index.ts", "supabase/functions/_shared/whatsapp-send.ts", "supabase/functions/_shared/whatsapp-inbound.ts",
  ];
  for (const s of senders) {
    const t = read(s);
    ok(!/salespersonOnboarding|tpsCheck|businessType|salesperson_onboarding|phone_tps_checks|lead_business_type_records/.test(t), `${s} reads none of this work`);
  }
  for (const s of ["src/lib/salespersonOnboarding.ts", "src/lib/tpsCheck.ts", "src/lib/businessType.ts"]) {
    ok(!/^import /m.test(read(s)), `${s} imports nothing (edge-safe, and cannot reach a sender)`);
  }
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
