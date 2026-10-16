/* ============================================================
   LEAD READINESS MUST AGREE WITH THE GATES (2026-10-15).
   leadReadiness (src/lib/leadReadiness.ts) says up front what a lead needs. It is only useful if it says
   exactly what the real gates do. This suite fails when they drift:
   ⛔ 1. The server lines it mirrors are still there (bulk-jobs' auditTownCheck, create-ai-audit's name and town
        gates, the drip's and the SMS sender's number rules). If one changes, this fails until both are re-checked.
   ⛔ 2. A table of leads runs through an ORACLE built from those server rules and through leadReadiness; every
        verdict must match (audit, WhatsApp, SMS), with every country switch combination.
   ⛔ 3. leadReadiness imports the gates' own predicates (no copy), pending vs missing, grouping and words.
   ============================================================ */
import { readFileSync } from "node:fs";
import {
  leadReadiness, auditReadiness, TEMPLATES_NEEDING_REAL_NAME, summariseReadiness, readinessHeadline, readinessLines, READINESS_WORDS,
  type ReadinessLead,
} from "../src/lib/leadReadiness.ts";
import { auditTownCheck, townWasTyped } from "../supabase/functions/_shared/typed-town.ts";
import { townGated } from "../src/lib/townVerdict.ts";
import { cleanTypedTown } from "../src/lib/typedTown.ts";
import { toWhatsAppDigits } from "../src/lib/waNumber.ts";
import { mobileMarketOf, channelOn, countrySettingsFrom, DEFAULT_COUNTRY_SETTINGS, type CountrySettings } from "../src/lib/outreachMarkets.ts";
import { isUkColdDestination } from "../src/lib/ukColdDestination.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\r/g, "");

console.log("── 1. the server lines this mirrors are still there ──");
const bulk = strip(readFileSync("supabase/functions/bulk-jobs/index.ts", "utf8"));
ok(/const townCheck = auditTownCheck\(lead\);/.test(bulk) && /problem === "town_unverified"/.test(bulk) && /status: "skipped_town_unverified", error: NO_USABLE_TOWN_REASON/.test(bulk),
  "bulk-jobs decides the audit town with auditTownCheck (the function leadReadiness calls)");
ok(/checkSuppressed\(service, \{ phone: lead\.phone, email: lead\.email, leadId: lead\.id \}\)/.test(bulk), "bulk-jobs skips a suppressed lead (leadReadiness: optedOut)");
const caa = strip(readFileSync("supabase/functions/create-ai-audit/index.ts", "utf8"));
ok(/if \(!businessName && !reuseAuditId\) return json\(\{ ok: false, error: "business_name required" \}, 400\);/.test(caa), "create-ai-audit refuses an empty business name");
ok(/const handTypedTown = !!lead && \(townWasTyped\(lead\) \|\| townConfirmedByPerson\(lead\)\)\s*&& locationSource === "search" && hasUsableTown\(locationText\);/.test(caa)
  && /!townConfirmed && !handTypedTown && townGated\(lead\)\)/.test(caa), "create-ai-audit's town gate: townGated unless a real typed town");
const table = strip(readFileSync("src/components/OutreachTable.tsx", "utf8"));
ok(/items: auditReadiness\(l, \{ suppressed: auditSuppressedIds\.has\(l\.id\) \}\)/.test(table)
  && /const auditSelectedLeads = useMemo\(\(\) => auditReadinessRows\.filter\(\(r\) => r\.items\.length === 0\)/.test(table),
  "the bulk audit sends only leads auditReadiness passes (the refused ones are never sent)");
ok(/if \(!filled\(lead\.search_keyword\) && !filled\(lead\.category\)\) out\.push\(item\('audit', 'no_trade'/.test(readFileSync("src/lib/leadReadiness.ts", "utf8")),
  "the trade rule is the bulk audit's own (search_keyword || category)");
const drip = strip(readFileSync("supabase/functions/process-whatsapp-queue/index.ts", "utf8"));
ok(/if \(isColdOutreachTemplate\(templateName\) && !isUkColdDestination\(toNumber\) && !\(coldMarket && coldMarket !== "UK"\)\)/.test(drip), "the drip's cold number rule");
const sms = strip(readFileSync("supabase/functions/_shared/twilio-sms.ts", "utf8"));
ok(/if \(market && market !== "UK" && !channelOn\(await loadCountrySettings\(service\), market, "sms"\)\)/.test(sms)
  && /if \(!isUkColdDestination\(digits\) && !\(market && market !== "UK"\)\)/.test(sms), "the SMS sender's number and country rules");
const sender = readFileSync("supabase/functions/_shared/whatsapp-send.ts", "utf8");
const senderSet = sender.match(/export const TEMPLATES_NEEDING_REAL_NAME = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
const SERVER_NEEDS_NAME = new Set([...senderSet.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
ok(SERVER_NEEDS_NAME.size > 0 && [...SERVER_NEEDS_NAME].sort().join(",") === [...TEMPLATES_NEEDING_REAL_NAME].sort().join(","),
  `the name-needing templates match the sender's own set (${[...SERVER_NEEDS_NAME].join(", ")})`);
ok(/if \(TEMPLATES_NEEDING_REAL_NAME\.has\(templateName\) && !\(\(lead\.business_name as string\) \?\? ""\)\.trim\(\)\)/.test(drip), "the drip refuses a nameless lead only for those templates");
const lr = readFileSync("src/lib/leadReadiness.ts", "utf8");
ok(/import \{ auditTownCheck/.test(lr) && /import \{ coldWhatsAppVerdict/.test(lr) && /import \{ isTextableMobile \}/.test(lr) && /import \{ reportOfferRefusal/.test(lr) && /import \{ optOutBlocksTemplate \}/.test(lr),
  "leadReadiness imports the gates' own predicates");
ok(!/44\[1-3\]|07\\d|\^447/.test(lr), "no hand-typed number pattern in leadReadiness");

console.log("── 2. the oracle (server rules) vs leadReadiness, over a table of leads ──");
/* The SERVER's answer, written from the lines pinned above. */
const serverAuditOk = (l: ReadinessLead): boolean => {
  if (!String(l.business_name ?? "").trim()) return false;                      // create-ai-audit
  if (!String(l.search_keyword ?? "").trim() && !String(l.category ?? "").trim()) return false;   // bulk eligibility
  if (!auditTownCheck(l).ok) return false;                                      // bulk-jobs
  // create-ai-audit's own 409 (it must never refuse a lead bulk-jobs let through).
  const typed = cleanTypedTown(l.search_location || l.address);
  if (townGated(l) && !(townWasTyped(l) && typed)) return false;
  return true;
};
const serverWhatsAppOk = (l: ReadinessLead, s: CountrySettings, opener = "initial_contact"): boolean => {
  if (SERVER_NEEDS_NAME.has(opener) && !String(l.business_name ?? "").trim()) return false;   // the drip / Inbox name rule
  const d = toWhatsAppDigits(l.phone, l.country ?? null);
  if (!d) return false;
  const m = mobileMarketOf(d);
  if (m && !channelOn(s, m, "whatsapp")) return false;                          // COUNTRY_OFF (incl. a UK switch-off)
  return isUkColdDestination(d) || !!(m && m !== "UK");
};
const serverSmsOk = (l: ReadinessLead, s: CountrySettings): boolean => {
  const d = toWhatsAppDigits(l.phone, l.country ?? null);
  if (!d) return false;
  const m = mobileMarketOf(d);
  if (m && m !== "UK" && !channelOn(s, m, "sms")) return false;
  if (!isUkColdDestination(d) && !(m && m !== "UK")) return false;
  return m !== "UK" || channelOn(s, "UK", "sms");
};
const base: ReadinessLead = { business_name: "Ace Plumbing", search_keyword: "plumbers", place_id: "ChIJabcdefghij", derived_town: "Rugby", search_location: "Rugby", country: "UK", phone: "07700 900123" };
const leads: Array<[string, ReadinessLead]> = [
  ["complete UK lead", base],
  ["no name", { ...base, business_name: "  " }],
  ["no trade", { ...base, search_keyword: null, category: null }],
  ["trade from category", { ...base, search_keyword: null, category: "Plumber" }],
  ["Google could not find a town", { ...base, derived_town: null, town_fetch_note: "no_town_in_address" }],
  ["Google place, town not derived yet", { ...base, derived_town: null, town_fetch_note: null }],
  ["CSV import, real typed town", { ...base, place_id: null, derived_town: null, town_fetch_note: "no_place_id", import_batch: "Oct", search_location: "Klang (Pandamaran)", country: "Malaysia", phone: "+60 12-345 6789" }],
  ["CSV import, Online", { ...base, place_id: null, derived_town: null, town_fetch_note: "no_place_id", import_batch: "Oct", search_location: "Online; tutors in Singapore", address: null }],
  ["hand-added, typed town", { ...base, place_id: null, derived_town: null, town_fetch_note: "no_place_id", lead_source: "referral", search_location: "Wisbech" }],
  ["derived Online", { ...base, derived_town: "Online" }],
  ["landline", { ...base, phone: "01788 123456" }],
  ["no phone", { ...base, phone: null }],
  ["junk phone", { ...base, phone: "call us" }],
  ["Malaysia mobile", { ...base, country: "Malaysia", phone: "+60 12-345 6789" }],
  ["Singapore mobile", { ...base, country: "Singapore", phone: "+65 9123 4567" }],
  ["Australian mobile", { ...base, country: "Australia", phone: "+61 412 345 678" }],
  ["UK mobile +44", { ...base, phone: "+44 7700 900123" }],
];
const settingsSets: Array<[string, CountrySettings]> = [
  ["defaults", countrySettingsFrom([])],
  ["MY + SG on", countrySettingsFrom([{ country: "MY", whatsapp_enabled: true, sms_enabled: true }, { country: "SG", whatsapp_enabled: true, sms_enabled: true }] as never)],
  ["UK off", countrySettingsFrom([{ country: "UK", whatsapp_enabled: false, sms_enabled: false }] as never)],
];
let compared = 0;
for (const [label, l] of leads) {
  const a = leadReadiness(l).ready.audit;
  ok(a === serverAuditOk(l), `audit · ${label}: readiness ${a ? "ready" : "not ready"} = server`);
  for (const [sl, s] of settingsSets) {
    for (const opener of ['initial_contact', 'initial_contact_short']) {
      const r = leadReadiness(l, { countrySettings: s, opener });
      if (r.ready.whatsapp !== serverWhatsAppOk(l, s, opener) || r.ready.sms !== serverSmsOk(l, s)) {
        ok(false, `send · ${label} · ${sl} · ${opener}: whatsapp ${r.ready.whatsapp} vs ${serverWhatsAppOk(l, s, opener)}, sms ${r.ready.sms} vs ${serverSmsOk(l, s)}`);
      }
      compared++;
    }
  }
}
ok(compared === leads.length * settingsSets.length * 2, `WhatsApp + SMS agreed with the senders on ${compared} lead × switch cases (failures listed above)`);
ok(JSON.stringify(Object.keys(DEFAULT_COUNTRY_SETTINGS)) === JSON.stringify(["UK", "MY", "SG"]), "the markets covered are UK, Malaysia, Singapore");

console.log("── 3. what it says ──");
const words = (l: ReadinessLead, ctx = {}) => leadReadiness(l, ctx).needs.map((i) => i.key).join(",");
ok(words(base) === "", "a complete lead needs nothing");
ok(words({ ...base, business_name: "" }) === "no_name", "no name → no_name (once, not per feature)");
ok(words({ ...base, derived_town: null, town_fetch_note: "no_town_in_address" }) === "town_unverified", "unconfirmed town");
ok(words({ ...base, place_id: null, derived_town: null, import_batch: "Oct", search_location: "Online" }) === "no_usable_town", "Online is no town");
ok(words({ ...base, phone: "01788 123456" }) === "landline", "a landline: both channels blocked → one item");
ok(words({ ...base, country: "Malaysia", phone: "+60 12-345 6789" }) === "country_off", "a Malaysian mobile with Malaysia off → country_off (not fixable)");
ok(leadReadiness({ ...base, country: "Malaysia", phone: "+60 12-345 6789" }).needsInfo.length === 0, "…and not a Needs info item");
ok(words({ ...base, phone: null }) === "no_phone", "no phone");
const looked = leadReadiness({ ...base, phone: null, derived_town: null }, { willLookUp: true });
ok(looked.ok && looked.pending.some((i) => i.key === "no_phone" && /will be looked up/.test(i.words)), "Coverage / Find Leads add: the phone is 'will be looked up', not missing");
ok(!leadReadiness({ ...base, place_id: null, phone: null }, { willLookUp: true }).ok, "…but only when there is a place to look it up from");
ok(words(base, { optedOut: true }) === "opted_out" && leadReadiness(base, { optedOut: true }).needsInfo.length === 0, "an opt-out is a stop, not missing info");
ok(leadReadiness(base).byFeature.report_offer[0]?.key === "needs_audit" && leadReadiness(base).byFeature.report_offer[0].pending, "report offer waits for a finished audit (pending)");
const withFacts = leadReadiness(base, { reportFacts: { hasAudit: true, competitors: "", score: "40%", link: "https://findable.live/r/abc123", namedInAnswers: false } });
ok(withFacts.byFeature.report_offer[0]?.words === "Report offer: its AI check named no competitors", "report offer refusal in reportOfferTemplate's own words");
ok(auditReadiness({ ...base, business_name: "", search_keyword: "" }).map((i) => i.fix).join(",") === "name,trade", "each item says what to edit");
const sum = summariseReadiness([
  { name: "A", readiness: leadReadiness(base) },
  { name: "B", readiness: leadReadiness({ ...base, business_name: "" }) },
  { name: "C", readiness: leadReadiness({ ...base, phone: "01788 123456" }) },
  { name: "D", readiness: leadReadiness({ ...base, phone: "01788 123456", business_name: "" }) },
]);
ok(readinessHeadline(sum) === "1 ready, 3 need something", readinessHeadline(sum));
ok(sum.groups.find((g) => g.key === "landline")?.names.join(",") === "C,D" && sum.groups.find((g) => g.key === "no_name")?.names.join(",") === "B,D", "grouped by what is missing, with names");
ok(readinessLines(leadReadiness({ ...base, phone: null })).some((l) => /^WhatsApp: No phone number/.test(l)), "tooltip lines per feature");
ok(Object.values(READINESS_WORDS).every((w) => !/[a-z]+_[a-z]+/.test(w)), "no machine token in the words");

console.log("── 4. what can be fixed on the lead ──");
const gTown = leadReadiness({ ...base, derived_town: null, town_fetch_note: "no_town_in_address" }).needs[0];
ok(gTown?.fix === null && /cannot be audited/.test(gTown.words), "a Google lead Google could not place: not fixable by typing a town (the gate only exempts typed-town leads)");
const iTown = leadReadiness({ ...base, place_id: null, derived_town: null, town_fetch_note: "no_place_id", import_batch: "Oct", search_location: "Online" }).needs[0];
ok(iTown?.fix === "town", "an import with no real town: fixable by typing one");
const fixed = leadReadiness({ ...base, place_id: null, derived_town: null, town_fetch_note: "no_place_id", import_batch: "Oct", search_location: "Wisbech" });
ok(fixed.ready.audit, "…and once a real town is typed, the audit is ready (the typed-town gate, 7a8c06d2)");
ok(leadReadiness(base, { suppressed: true }).byFeature.audit.some((i) => i.key === "suppressed"), "do-not-contact: the audit is skipped, as bulk-jobs skips it");

console.log("── 5. every add path and screen uses it ──");
const src = (p: string) => strip(readFileSync(p, "utf8"));
/* The Coverage multi-town add (CoverageMultiTown) was removed 2026-10-16: ticked towns open Find Leads, whose add is checked below. */
const csv = src("src/components/CSVImportDialog.tsx");
ok(/readinessLeadFromImport\(r, outcome\.get\(r\.row\)\?\.country \?\? null, batchName\)/.test(csv) && /Import only the ready ones/.test(csv) && /data-testid="csv-fix-row"/.test(csv), "CSV import: grouped readiness, fix in place, import only the ready ones");
ok(/leadReadiness\(typed, \{ countrySettings \}\)/.test(src("src/components/AddLeadDialog.tsx")), "manual add: said before saving");
const uo = src("src/hooks/useOutreach.ts");
ok(/noteNeedsInfo\(item\.businessName, updated\)/.test(uo) && /noteNeedsInfo\(lead\.name, salesAddPayload\(/.test(uo), "Find Leads add: re-checked after the lookup (both roles), one notice");
ok(/<NeedsInfoTag readiness=\{readinessFor\(lead\)\}/.test(src("src/components/OutreachTable.tsx")) && /readiness=\{readinessFor\(lead\)\}/.test(src("src/components/OutreachTable.tsx")), "Outreach: Needs info tag on desktop rows and phone cards");
ok(/<NeedsInfoTag readiness=\{activeReadiness\}/.test(src("src/pages/Inbox.tsx")), "Inbox: Needs info tag on the conversation");
ok(/data-testid="audit-skip-groups"/.test(src("src/components/OutreachTable.tsx")), "bulk audit dialog: skipped leads grouped by reason");

console.log(f ? `\n${f} FAILURE(S)` : "\nALL PASS");
process.exit(f ? 1 : 0);
