/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BUSINESS TYPE FROM EVIDENCE ONLY (2026-10-05, docs/salesperson-onboarding.md §6).
   ⛔ Unknown unless there is evidence; a missing Companies House match is never "sole trader".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import path from "node:path";
import { businessTypeFromCompaniesHouse, businessTypeOf, type BusinessTypeRecord, type ChEvidence } from "../src/lib/businessType.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");

const ch = (over: Partial<ChEvidence> = {}): ChEvidence => ({ match: "strong", company_name: "SMITH PLUMBING LTD", company_number: "01234567", company_status: "active", company_type: "ltd", ...over });
const rec = (over: Partial<BusinessTypeRecord> = {}): BusinessTypeRecord => ({ business_type: "sole_trader", source: "stated_by_business", evidence_note: "told me on the call", recorded_at: "2026-10-10T10:00:00Z", ...over });

console.log("── Companies House ──");
ok(businessTypeFromCompaniesHouse(ch()) === "limited_company", "strong match, active, ltd → limited company");
ok(businessTypeFromCompaniesHouse(ch({ company_type: "llp" })) === "llp", "strong match, active, llp → LLP");
ok(businessTypeFromCompaniesHouse(ch({ company_type: "private-limited-guarant-nsc" })) === "limited_company", "company limited by guarantee → limited company");
ok(businessTypeFromCompaniesHouse(ch({ match: "possible" })) === null, "a POSSIBLE match says nothing");
ok(businessTypeFromCompaniesHouse(ch({ match: "none" })) === null, "no match says nothing (never 'sole trader')");
ok(businessTypeFromCompaniesHouse(ch({ company_status: "dissolved" })) === null, "a dissolved company says nothing about today's business");
ok(businessTypeFromCompaniesHouse(ch({ company_type: "limited-partnership" })) === null, "an unmapped type (limited partnership) says nothing");
ok(businessTypeFromCompaniesHouse(null) === null, "no check on file says nothing");

console.log("\n── the verdict ──");
{
  const none = businessTypeOf({});
  ok(none.type === "unknown" && none.source === "none" && /Do not assume/.test(none.detail), "no evidence: unknown");
  ok(businessTypeOf({ ch: ch({ match: "none" }) }).type === "unknown", "no Companies House match: unknown, not sole trader");
  const m = businessTypeOf({ ch: ch() });
  ok(m.type === "limited_company" && m.source === "companies_house_match" && /not confirmed by a person/.test(m.detail), "a strong match is labelled the machine's, not confirmed");
  const p = businessTypeOf({ ch: null, records: [rec()] });
  ok(p.type === "sole_trader" && p.source === "person" && /told me on the call/.test(p.detail), "a person's record with evidence: sole trader");
  const c = businessTypeOf({ ch: ch(), records: [rec()] });
  ok(c.type === "sole_trader" && c.conflict && /Companies House matched/.test(c.detail), "a person's record and a Companies House match that disagree: the conflict is shown");
  const newest = businessTypeOf({ records: [rec({ business_type: "partnership", recorded_at: "2026-10-01T00:00:00Z" }), rec({ business_type: "limited_company", source: "companies_house_confirmed", recorded_at: "2026-10-12T00:00:00Z" })] });
  ok(newest.type === "limited_company", "the newest record wins");
  ok(businessTypeOf({ records: [rec({ business_type: "bogus" as BusinessTypeRecord["business_type"] })] }).type === "unknown", "an unknown value in a record is ignored");
}

console.log("\n── the database: evidence, append-only, own leads ──");
{
  const mig = readFileSync(path.join(ROOT, "supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql"), "utf8").replace(/\r\n/g, "\n");
  ok(/if _type <> 'unknown' and v_note is null then\s+return jsonb_build_object\('ok', false, 'error', 'evidence_needed'\)/.test(mig), "a type other than unknown needs a note of the evidence");
  ok(/perform public\._require_work\(_lead_id\)/.test(mig.slice(mig.indexOf("function public.lead_record_business_type"))), "only someone who may work the lead can record it");
  ok(/lead_business_type_records is append-only/.test(mig), "records are append-only");
  ok(/revoke all on public\.lead_business_type_records from public, anon, authenticated;\ngrant select on public\.lead_business_type_records to authenticated;/.test(mig), "signed-in users write only through the function");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
