/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALESPERSON ONBOARDING + THE READY TO SELL GATE (2026-10-05, docs/salesperson-onboarding.md).
   The checklist rules in src/lib/salespersonOnboarding.ts (approved documents only), the save validation
   fn admin-users runs, the parity of its keys with the database rule, and the structure that keeps the
   records admin-only. The gate's BEHAVIOUR is proven live by supabase/tests/salesperson-onboarding-rls.sql
   (run against the database, rolled back: 57/57 on 2026-10-05); scripts/sales-ready-gate.test.ts fences
   the gate's wiring.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  BLOCKING_KEYS, INACTIVE_KEYS, ONBOARDING_FIELDS, RTW_CATEGORIES, RTW_METHODS, SEED_DOCUMENT_VERSIONS,
  addMonths, emptyOnboardingRecord, normaliseCompanyNumber, normaliseVatNumber, onboardingSummary, sensitiveTextProblem,
  validateNewDocument, validateOnboardingPatch, type DocumentVersion, type MemberState, type OnboardingRecord,
} from "../src/lib/salespersonOnboarding.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");

const TODAY = "2026-10-20";
const ACTIVE: MemberState = { status: "active", role: "sales", suspended_at: null, has_signed_in: true };
/* The seeds as they are, plus the approved versions Paul will add when the final documents arrive. */
const doc = (id: string, kind: DocumentVersion["kind"], status: DocumentVersion["status"], outstanding: string[] = []): DocumentVersion =>
  ({ id, kind, label: id, status, document_ref: null, outstanding, note: null });
const DOCS: DocumentVersion[] = [
  ...SEED_DOCUMENT_VERSIONS,
  doc("qa-agreement-final", "contractor_agreement", "approved"),
  doc("qa-agreement-old", "contractor_agreement", "superseded"),
  doc("qa-notice-final", "privacy_notice", "approved"),
  doc("qa-notice-old", "privacy_notice", "superseded"),
];
const full = (over: Partial<OnboardingRecord> = {}): OnboardingRecord => ({
  ...emptyOnboardingRecord("u1"),
  agreement_version: "qa-agreement-final", agreement_signed_on: "2026-10-06", agreement_ref: "Secure folder / A",
  privacy_notice_version: "qa-notice-final", privacy_notice_given_on: "2026-10-06",
  age_18_confirmed_on: "2026-10-06",
  rtw_method: "manual_in_person", rtw_checked_on: "2026-10-06", rtw_checked_by: "Paul James Sales", rtw_result: "pass", rtw_evidence_ref: "Secure folder / RTW / A",
  bank_details_received_on: "2026-10-06", vat_registered: false, contractor_type: "individual", start_date: "2026-10-07",
  team_guide_version: "team-guide-2026-10-02", team_guide_acknowledged_on: "2026-10-06",
  ...over,
});
const sum = (r: OnboardingRecord | null, m: MemberState = ACTIVE, docs: DocumentVersion[] = DOCS, server?: string[] | null) => onboardingSummary(r, m, docs, TODAY, server);
const item = (r: OnboardingRecord | null, key: string, m: MemberState = ACTIVE) => sum(r, m).items.find((i) => i.key === key)!;

console.log("── a complete record on a live sales login is READY TO SELL ──");
{
  const s = sum(full());
  ok(s.readyToSell && s.done === s.total && s.missing.length === 0, `ready, ${s.done}/${s.total}`);
  ok(s.total === 10 && BLOCKING_KEYS.length === 10, "ten blocking items (Schedule 2 is optional and never blocks)");
  ok(!BLOCKING_KEYS.some((k) => /tps|ctps/i.test(k)) && !s.items.some((i) => /tps|ctps/i.test(i.label)), "TPS/CTPS is NOT an item (postponed by Paul)");
  const empty = sum(null);
  ok(!empty.readyToSell && empty.done === 1 && empty.missing.length === 9, `no record: only the login counts (${empty.done}/${empty.total})`);
}

console.log("\n── DOCUMENTS: only the CURRENT APPROVED version counts ──");
{
  const seedAgreement = SEED_DOCUMENT_VERSIONS.find((d) => d.kind === "contractor_agreement")!;
  const seedNotice = SEED_DOCUMENT_VERSIONS.find((d) => d.kind === "privacy_notice")!;
  ok(seedAgreement.id === "contractor-agreement-draft-v2" && seedAgreement.status === "draft", "the uploaded agreement is seeded as DRAFT v2");
  ok(seedNotice.status === "draft" && seedNotice.outstanding.length === 10, "the uploaded privacy notice is seeded as a DRAFT with 10 outstanding items");
  ok(!SEED_DOCUMENT_VERSIONS.some((d) => d.kind !== "team_guide" && d.status === "approved"), "no agreement or notice is approved until Paul approves the final version (no invented version)");
  const draftAg = item(full({ agreement_version: "contractor-agreement-draft-v2" }), "agreement");
  ok(!draftAg.done && /DRAFT/.test(draftAg.detail) && /does not count/.test(draftAg.detail), "draft contractor agreement does NOT satisfy the item");
  ok(!sum(full({ agreement_version: "contractor-agreement-draft-v2" })).readyToSell, "…and does NOT make them Ready to Sell");
  ok(item(full(), "agreement").done, "the approved current agreement does");
  ok(!item(full({ agreement_version: "qa-agreement-old" }), "agreement").done && /SUPERSEDED/.test(item(full({ agreement_version: "qa-agreement-old" }), "agreement").detail), "a superseded agreement does not");
  ok(!item(full({ agreement_ref: null }), "agreement").done, "the approved agreement also needs where the signed copy is kept");
  ok(!item(full({ agreement_signed_on: null }), "agreement").done, "…and a signing date");
  const draftPn = item(full({ privacy_notice_version: "salesperson-privacy-notice-draft-2026-10-05" }), "privacy_notice");
  ok(!draftPn.done && /DRAFT/.test(draftPn.detail), "draft privacy notice does NOT satisfy the item");
  ok(!sum(full({ privacy_notice_version: "salesperson-privacy-notice-draft-2026-10-05" })).readyToSell, "…and does NOT make them Ready to Sell");
  ok(item(full(), "privacy_notice").done, "the approved current notice does");
  ok(!item(full({ privacy_notice_version: "qa-notice-old" }), "privacy_notice").done, "a superseded notice does not");
  const onlySeeds = sum(full({ agreement_version: "contractor-agreement-draft-v2", privacy_notice_version: "salesperson-privacy-notice-draft-2026-10-05" }), ACTIVE, [...SEED_DOCUMENT_VERSIONS]);
  ok(!onlySeeds.readyToSell && onlySeeds.notes.some((n) => /no approved contractor agreement yet/.test(n)), "with today's documents nobody can be Ready to Sell, and the panel says why");
  ok(validateOnboardingPatch({ agreement_version: "contractor-agreement-draft-v2", agreement_signed_on: "2026-10-06" }, null, DOCS).ok, "the draft v2 that was actually signed can be RECORDED for history");
  ok(validateOnboardingPatch({ agreement_version: "made-up" }, null, DOCS).ok === false, "an unknown version is refused");
  ok(validateOnboardingPatch({ privacy_notice_version: "qa-agreement-final" }, null, DOCS).ok === false, "a version of the wrong kind is refused");
  ok(validateNewDocument({ id: "contractor-agreement-v3", kind: "contractor_agreement", label: "Agreement v3", outstanding: ["", " "] }).ok, "Paul can add a new version (blank outstanding lines dropped)");
  ok(!validateNewDocument({ id: "Bad Id!", kind: "contractor_agreement", label: "x y z" }).ok, "a malformed version id is refused");
}

console.log("\n── the server's answer is the one shown ──");
{
  const s = sum(full(), ACTIVE, DOCS, ["right_to_work"]);
  ok(!s.readyToSell && s.serverDisagrees, "when the gate says not ready, the panel says not ready (and flags the disagreement)");
  ok(sum(full(), ACTIVE, DOCS, []).readyToSell && !sum(full(), ACTIVE, DOCS, []).serverDisagrees, "agreement with the server: no flag");
  ok(!sum(full(), ACTIVE, DOCS, null).serverDisagrees, "server answer unreadable: the local rule is shown without a false flag");
}

console.log("\n── the keys match the database rule ──");
{
  const fn = MIG.slice(MIG.indexOf("create or replace function public.salesperson_onboarding_missing"), MIG.indexOf("create or replace function public.salesperson_ready_to_sell"));
  const emitted = new Set([...fn.matchAll(/'([a-z_0-9]+)'::text/g)].map((m) => m[1]).concat([...fn.matchAll(/array\['([a-z_]+)'\]/g)].map((m) => m[1])));
  for (const k of [...BLOCKING_KEYS, ...INACTIVE_KEYS]) ok(emitted.has(k), `the database rule can return "${k}"`);
  for (const k of emitted) ok((BLOCKING_KEYS as readonly string[]).includes(k) || (INACTIVE_KEYS as readonly string[]).includes(k), `"${k}" from the database is a key the screen knows`);
  ok(!/tps|ctps|phone_tps/i.test(fn), "the database rule never reads TPS/CTPS");
  ok(/d\.status = 'approved'/.test(fn) && (fn.match(/d\.status = 'approved'/g) ?? []).length === 3, "the database rule counts APPROVED versions only (agreement, notice, guide)");
  ok(!/schedule2/.test(fn), "Schedule 2 never blocks in the database either");
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
  ok(sum(full({ end_date: "2026-11-01", end_reason: "ended_on_notice" })).readyToSell, "working out their notice: still ready, the end date shown");
}

console.log("\n── right to work: factual, never a legal conclusion ──");
{
  ok(item(full(), "right_to_work").done, "pass + method + date + checker + evidence location = recorded");
  ok(!item(full({ rtw_evidence_ref: null }), "right_to_work").done, "no evidence location: not done");
  ok(!item(full({ rtw_result: "fail" }), "right_to_work").done && /FAILED/.test(item(full({ rtw_result: "fail" }), "right_to_work").detail), "a failed check blocks and says so");
  ok(!item(full({ rtw_method: "certified_provider" }), "right_to_work").done, "a certified-provider check needs the provider's name");
  ok(item(full({ rtw_method: "certified_provider", rtw_provider: "Example IDSP" }), "right_to_work").done, "…and is done with it");
  ok(!item(full({ rtw_recheck_due: "2026-10-19" }), "right_to_work").done, "a follow-up check that has fallen due blocks");
  ok(RTW_METHODS.manual_video_call.category === "manual_video" && RTW_METHODS.certified_provider.category === "certified_provider"
    && RTW_METHODS.manual_in_person.category === "other_approved" && RTW_METHODS.home_office_share_code.category === "other_approved",
    "three categories: manual/video, certified provider, other approved method");
  ok(Object.keys(RTW_CATEGORIES).length === 3, "…and only those");
  const video = item(full({ rtw_method: "manual_video_call" }), "right_to_work");
  ok(video.done && /Manual \/ video check recorded/.test(video.detail), "a video check is RECORDED as a manual/video check");
  ok(sum(full({ rtw_method: "manual_video_call" })).notes.some((n) => /not a certified right-to-work check/.test(n) && /does not show that Findable has a statutory defence/.test(n)), "…and the panel says it is not certified and shows no defence");
  const allText = read("src/lib/salespersonOnboarding.ts") + read("src/components/SalespersonOnboardingPanel.tsx");
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(!/gives? (findable )?(a |the )?(full )?(legal|statutory) (defence|excuse)/i.test(strip(allText)), "no screen text says a method GIVES a legal/statutory defence");
}

console.log("\n── 18+, bank, VAT, contractor status, Schedule 2, team guide ──");
{
  ok(!item(full({ age_18_confirmed_on: null }), "age_18").done, "18+ not confirmed: not done");
  ok(!item(full({ bank_details_received_on: null }), "bank_details").done, "bank details not received: not done");
  ok(!Object.keys(ONBOARDING_FIELDS).some((k) => /sort|account_number|iban|passport|birth|dob/.test(k)), "no field exists for an account number, sort code, IBAN, passport or birth date");
  ok(!item(full({ vat_registered: null }), "vat").done && !item(full({ vat_registered: true }), "vat").done, "VAT not asked / registered without a number: not done");
  ok(item(full({ vat_registered: true, vat_number: "GB123456789" }), "vat").done, "VAT registered with a number: done");
  ok(normaliseVatNumber("gb 123 4567 89") === "GB123456789" && normaliseVatNumber("12345") === null, "VAT numbers normalise; a wrong shape is refused");
  ok(validateOnboardingPatch({ vat_number: "GB123456789" }, full({ vat_registered: false }), DOCS).ok === false, "a VAT number on someone marked not registered is refused");
  const ltd = full({ contractor_type: "limited_company" });
  ok(!item(ltd, "contractor_status").done && /contract has to be with their company/.test(item(ltd, "contractor_status").detail), "limited company without the contracting entity recorded: not done");
  ok(item(full({ contractor_type: "limited_company", company_name: "A Ltd", company_number: "01234567", company_contract_confirmed_on: "2026-10-06" }), "contractor_status").done, "limited company with name, number and contract confirmed: done");
  ok(validateOnboardingPatch({ company_name: "A Ltd" }, full(), DOCS).ok === false, "company details on an individual are refused");
  ok(normaliseCompanyNumber("1234567") === "01234567" && normaliseCompanyNumber("ABC") === null, "company numbers normalise");
  ok(sum(full()).readyToSell && !item(full(), "schedule2").blocking, "Schedule 2 outstanding never blocks (it is optional)");
  ok(item(full({ schedule2_status: "none" }), "schedule2").done, "Schedule 2 none listed: done");
  ok(!item(full({ team_guide_acknowledged_on: null }), "team_guide").done, "team guide version without a date: not done");
  ok(!("login_created" in ONBOARDING_FIELDS), "there is no stored 'login created' tick");
  ok(item(full(), "login", { ...ACTIVE, has_signed_in: false }).done, "an active sales login that has not signed in yet still counts as created");
}

console.log("\n── save validation and sensitive data ──");
{
  ok(validateOnboardingPatch({ is_ready: true }, null, DOCS).ok === false, "an unknown field is refused, never dropped");
  ok(validateOnboardingPatch({ start_date: "2026-02-30" }, null, DOCS).ok === false, "an impossible date is refused");
  ok(validateOnboardingPatch({ end_date: "2026-11-01" }, full(), DOCS).ok === false, "an end date without a reason is refused");
  ok(validateOnboardingPatch({ misconduct_notified_on: "2026-12-01" }, full({ end_date: "2026-11-01", end_reason: "resigned" }), DOCS).ok, "misconduct found later, inside 6 months, saves");
  ok(validateOnboardingPatch({ misconduct_notified_on: "2027-06-01" }, full({ end_date: "2026-11-01", end_reason: "resigned" }), DOCS).ok === false, "…outside 6 months is refused");
  ok(addMonths("2026-08-31", 6) === "2027-02-28", "six months from 31 Aug is 28 Feb");
  for (const [t, l] of [["Passport 123456789", "a passport number"], ["sort code 12-34-56", "a sort code"], ["acc 12345678", "an account number"], ["GB29 NWBK 6016 1331 9268 19", "an IBAN"], ["DOB 1 Jan 1990", "a date of birth"]] as const) {
    ok(sensitiveTextProblem(t) !== null && validateOnboardingPatch({ rtw_notes: t }, null, DOCS).ok === false, `refuses ${l}`);
  }
  ok(validateOnboardingPatch({ agreement_ref: "Folder 123456789" }, null, DOCS).ok === false, "the signed-copy location is scanned too");
  ok(sensitiveTextProblem("Secure folder / RTW / Jane Smith") === null, "an ordinary evidence location is accepted");
}

console.log("\n── the records are admin-only by construction ──");
{
  ok(/revoke all on public\.salesperson_onboarding from public, anon, authenticated/.test(MIG) && /revoke all on public\.salesperson_document_versions from public, anon, authenticated/.test(MIG), "onboarding + document tables: every privilege revoked");
  ok(!/create policy [^\n]* on public\.(salesperson_onboarding|salesperson_onboarding_log|salesperson_document_versions)\b/.test(MIG), "NO policy on them (zero policies = no signed-in reader)");
  const cols = new Set([...MIG.slice(MIG.indexOf("create table if not exists public.salesperson_onboarding ("), MIG.indexOf("alter table public.salesperson_onboarding enable")).matchAll(/^\s{2}([a-z0-9_]+)\s/gm)].map((m) => m[1]));
  for (const k of Object.keys(ONBOARDING_FIELDS)) ok(cols.has(k), `column exists for ${k}`);
  const fn = read("supabase/functions/admin-users/index.ts");
  const adminGate = fn.indexOf("Not authorized - no admin role");
  for (const a of ["team_onboarding_list", "team_onboarding_save", "team_document_add", "team_document_outstanding", "team_document_approve"]) {
    ok(adminGate > 0 && fn.indexOf(`'${a}'`) > adminGate, `${a} sits after admin-users' admin check`);
  }
  const readers: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(path.join(ROOT, dir))) {
      const p = path.join(dir, n);
      if (n === "node_modules") continue;
      if (statSync(path.join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && /from\(['"`]salesperson_onboarding(_log)?['"`]\)/.test(read(p))) readers.push(p.replace(/\\/g, "/"));
    }
  };
  walk("src"); walk("supabase/functions");
  ok(readers.length === 1 && readers[0] === "supabase/functions/admin-users/index.ts", `the only code that reads the table is fn admin-users (${readers.join(", ")})`);
  ok(/my_onboarding_status/.test(MIG) && !/'agreement_ref'|rtw_evidence_ref/.test(MIG.slice(MIG.indexOf("function public.my_onboarding_status"), MIG.indexOf("function public.my_acknowledge_team_guide"))), "a salesperson's own status returns keys only, never stored values");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
