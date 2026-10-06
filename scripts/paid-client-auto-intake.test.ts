/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID CLIENT AUTO-INTAKE + SEND TO PAUL (2026-10-06,
   docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md).

   Pins, from the brief's test list:
     Send to Paul — the refusal rule, the one-send-per-client table, idempotency, the snapshot, History,
       the one notice, nothing sent to the client, nothing commercial touched.
     The paid trigger — every route into Paid Clients queues ONE intake; not Interested / a link / a draft.
     The intake — data-source precedence, no overwrite of a confirmed value, conflicts flagged with their
       sources, reject / edit / back-to-automatic, gaps (only what is genuinely missing), the crawl
       (reuse a fresh full crawl, start at most one, wait, give up and carry on, no website), extraction
       from the website evidence, onboarding / agreement / handoff / Places / lead / hook-audit merge,
       auto-fill from client and sales answers ONLY (never a website guess), the baseline NOT started,
       no paid API, no message, failure degradation, duplicate runs, retries.
     Security — the intake table has no policies, the send table is admin-or-sender, the hub is admin-only,
       the worker is internal-only, the crawl door only for a paid client.
     The look — no teal / cyan wash left in Quick Close; Send to Paul is the final state.
   The real intake code (_shared/client-intake.ts) runs against an in-memory stand-in for the database that
   enforces the same unique rules as the migration; the live rules are proven by the rolled-back SQL suite
   supabase/tests/paid-client-auto-intake.sql.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AUTO_APPLY_SOURCES, CONTENT_REUSE_WORDS, INTAKE_CRAWL_MAX_WAIT_MS, INTAKE_FIELDS, INTAKE_MAX_ATTEMPTS, SOURCE_RANK, applyOverride, autoApplyCandidates,
  cleanOverrides, contentReuse, crawlPlan, finishedStatus, intakeCandidates, intakeNoticeTitle, intakeStatusLine, intakeSummary, mergeClientProfile,
  mergeField, normPhone, type IntakeCandidate, type IntakeRows, type IntakeStep,
} from "../src/lib/clientIntake.ts";
import { CRAWL_FRESH_MS } from "../src/lib/crawlCheck.ts";
import { isIntakeCrawlRequest, resolveCrawlMode } from "../src/lib/fullCrawl.ts";
import { HANDOFF_SEND_REFUSAL_TEXT, handoffSendRefusal, handoffSentBody, handoffSentTitle } from "../src/lib/salesHandoff.ts";
import { ACTIVITY_LABEL } from "../src/lib/salesCrm.ts";
import type { KnownForItem } from "../src/lib/clientMissingInfo.ts";
import { SalesHandoffForm } from "../src/components/SalesHandoffForm.tsx";

let failures = 0;
const ok = (c: unknown, label: string) => { if (!c) failures++; console.log(`${c ? "PASS" : "FAIL"} ${label}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const NOW = Date.parse("2026-10-06T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/* ═══ 1. SEND TO PAUL — the rule ═══════════════════════════════════════════════════════════════════ */
console.log("── SEND TO PAUL: the rule ──");
const fullHandoff = { work_type: "new_site", site_situation: "no_website", client_wants: "A site that gets calls", promised: "Nothing beyond the standard package", why_bought: "Losing work to rivals", decision_maker_name: "Sam Owner" } as const;
ok(handoffSendRefusal({ fields: fullHandoff, closed: false }) === null, "a complete handoff may be sent");
/* 2026-10-07 (Paul): the handoff is LIGHTWEIGHT — nothing is required, so an unknown answer never blocks Send to Paul. */
ok(handoffSendRefusal({ fields: { ...fullHandoff, why_bought: "" }, closed: false }) === null, "a partial handoff may be sent (nothing is required since 2026-10-07)");
ok(handoffSendRefusal({ fields: null, closed: false }) === null, "even an empty handoff may be sent — the system already filled what it knows");
ok(handoffSendRefusal({ fields: fullHandoff, closed: true }) === "client_closed", "an ended / refunded client is refused");
ok(/Send to Paul/.test(HANDOFF_SEND_REFUSAL_TEXT.handoff_incomplete), "the refusal says what to do");
ok(handoffSentTitle("ABC Plumbing") === "NEW CLIENT HANDOFF · ABC Plumbing" && handoffSentTitle(null) === "NEW CLIENT HANDOFF · A client", "Paul's bell line: NEW CLIENT HANDOFF · <client>");
ok(/^From Tom\. Awaiting payment/.test(handoffSentBody({ sellerName: "Tom", paid: false })) && /^From Tom\. Paid/.test(handoffSentBody({ sellerName: "Tom", paid: true })), "…from <salesperson>, and Awaiting payment before they pay");

/* ═══ 2. SEND TO PAUL — the form's final state ═════════════════════════════════════════════════════ */
console.log("\n── SEND TO PAUL: the form ──");
const noop = async () => true;
const formHtml = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(SalesHandoffForm, { prefilled: [], onSave: noop, ...props } as never));
const complete = formHtml({ fields: fullHandoff, onSend: noop });
ok(/Ready to send/.test(complete) && /Send to Paul/.test(complete) && /Save without sending/.test(complete), "complete → READY TO SEND + Send to Paul (primary), saving without sending is secondary");
ok(!/>Save handoff</.test(complete), "…and the primary action is no longer 'Save handoff'");
const partial = formHtml({ fields: { ...fullHandoff, why_bought: "" }, onSend: noop });
ok(/data-testid="send-to-paul"/.test(partial) && !/required answer/.test(partial), "partial → still Send to Paul (no required answers since 2026-10-07)");
const sentHtml = formHtml({ fields: fullHandoff, onSend: noop, sent: { at: "2026-10-06T10:00:00Z", by: null, changed_since: false } });
ok(/Sent to Paul/.test(sentHtml) && /Save changes/.test(sentHtml) && !/data-testid="send-to-paul"/.test(sentHtml), "sent → 'Sent to Paul · <time>', later edits are Save changes (no second send)");
const paulsPage = formHtml({ fields: fullHandoff });
ok(!/Send to Paul/.test(paulsPage) && /Save handoff/.test(paulsPage), "Paul's own page (no onSend) never shows Send to Paul");

/* ═══ 3. SEND TO PAUL — the server ═════════════════════════════════════════════════════════════════ */
console.log("\n── SEND TO PAUL: fn quick-close ──");
{
  const qc = read("supabase/functions/quick-close/index.ts");
  const block = qc.slice(qc.indexOf('if (mode === "send_to_paul")'), qc.indexOf("SAVE THE CLIENT DETAILS THE SELLER COLLECTED"));
  ok(block.length > 200, "the send_to_paul mode exists");
  ok(qc.indexOf('if (mode === "send_to_paul")') < qc.indexOf('if (!access.ok) return json({ ok: false, error: "not_your_lead"'), "…before the pre-payment gate, so it works after payment too (seller only)");
  ok(/if \(!mayHandoff\) \{\s*await recordDenial\(service, actor\.id, "quick-close:send_to_paul"/.test(block), "only someone who may hand off (the admin, the rep working it before payment, the SELLER after) — a refusal is recorded");
  ok(/handoffSendRefusal\(\{ fields, closed \}\)/.test(block) && /\}, 409\);/.test(block), "the server re-checks every required answer (never trusts the screen)");
  ok(/saveHandoffFrom\(body\.handoff as Obj\)/.test(block), "Send saves what the form holds first (the same save path as Save handoff)");
  ok(/if \(await handoffSendFor\(leadId\)\) return json\(await view\(\)\);/.test(block), "a second press reads the first send back (idempotent)");
  ok(/from\("client_handoff_sends"\)\.insert\(\{/.test(block) && /"23505"\) return json\(await view\(\)\)/.test(block), "…and two presses at once: the unique row decides, the loser reads the winner");
  ok(/sent_by_user_id: actor\.id, sent_by_name: sellerName/.test(block) && /sent_by_role:/.test(block) && /paid_when_sent: paidLead, handoff: fields/.test(block) && /onboarding_id: \(row\?\.id/.test(block), "the snapshot: who sent it (name kept), their role, paid or not, the answers, the exact sign-up");
  const afterInsert = block.slice(block.indexOf('"23505"'));
  ok(/recordLeadEvent\(service, leadId, "handoff_sent"/.test(afterInsert) && /_kind: "client_handoff"/.test(afterInsert) && /_dedupe: `handoff_sent:\$\{leadId\}`/.test(afterInsert), "only the WINNING send writes History and Paul's ONE notification (dedupe key per client)");
  ok(/_link: paidLead \? `\/paid-clients\/\$\{leadId\}` : `\/paid-clients\?handoff=\$\{leadId\}`/.test(block), "the notice links straight into Paid Clients (the client, or the awaiting-payment card)");
  ok(/if \(actor\.role !== "admin"\)/.test(block), "Paul's own send does not notify Paul");
  ok(!/send-whatsapp|sendOperatorAlert|resend|Resend|functions\/v1|sendEmail/.test(strip(block)), "Send to Paul never messages anyone outside the app (no WhatsApp, no email)");
  ok(!/plan_tier|amount_paid\s*:|contract_total_payments|sold_by_user_id\s*:|stripe/i.test(strip(block).replace(/paid_when_sent/g, "")), "…and changes nothing commercial (route, money, term, seller stamp, Stripe)");
  ok(/sent: sent \? \{/.test(qc) && /changed_since:/.test(qc), "the Close view carries the send (and whether the answers changed after it)");
  const myH = qc.slice(qc.indexOf('if (mode === "my_handoffs")'), qc.indexOf("const leadId = typeof body.lead_id"));
  ok(/sent_to_paul: sentIds\.has/.test(myH), "the rep's 'Finish the handoff' list knows which sales were sent");
}

/* ═══ 4. THE DATABASE (migration) ═══════════════════════════════════════════════════════════════════ */
console.log("\n── THE MIGRATION ──");
{
  const mig = read("supabase/migrations/20261013120000_paid_client_auto_intake.sql");
  const prev = read("supabase/migrations/20261009090000_client_info_requests.sql");
  const kinds = (sql: string, name: string) => {
    const at = sql.lastIndexOf(`add constraint ${name}`);
    return [...sql.slice(at, sql.indexOf(";", at)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };
  const prevNotif = kinds(prev, "notifications_kind_check"); const nowNotif = kinds(mig, "notifications_kind_check");
  ok(prevNotif.length > 10 && prevNotif.every((k) => nowNotif.includes(k)) && nowNotif.includes("client_handoff") && nowNotif.includes("client_intake"), "notification kinds: every earlier kind kept, client_handoff + client_intake added");
  const prevAct = kinds(prev, "lead_activity_kind_check"); const nowAct = kinds(mig, "lead_activity_kind_check");
  ok(prevAct.length > 20 && prevAct.every((k) => nowAct.includes(k)) && ["handoff_sent", "client_intake", "client_fact_set"].every((k) => nowAct.includes(k)), "History kinds: every earlier kind kept, handoff_sent / client_intake / client_fact_set added");
  ok(["handoff_sent", "client_intake", "client_fact_set"].every((k) => ACTIVITY_LABEL[k]), "…each with its History label");
  const setup = read("supabase/functions/_shared/client-setup.ts");
  ok(/"handoff_sent" \| "client_intake" \| "client_fact_set"/.test(setup), "…and in LeadEventKind");
  ok(/constraint client_handoff_sends_one_per_lead unique \(lead_id\)/.test(mig), "ONE send per client (unique) — the database is the dedupe");
  ok(/create table if not exists public\.client_intake \(\s*lead_id uuid primary key/.test(mig), "ONE intake per client (primary key) — a duplicate webhook can never start a second");
  ok(/lead_activity_one_handoff_sent on public\.lead_activity \(lead_id\) where kind = 'handoff_sent'/.test(mig) && /lead_activity_one_intake_ready[\s\S]*?where kind = 'client_intake' and \(data->>'event'\) = 'ready'/.test(mig), "History once: one 'sent to Paul', one 'intake ready' per client (no spam)");
  ok(/revoke all on public\.client_intake from anon, authenticated;/.test(mig) && !/create policy [a-z_]+ on public\.client_intake/.test(mig), "client_intake: no grants, no policies — the service role only (Sales can never read research notes)");
  ok(/create policy client_handoff_sends_read on public\.client_handoff_sends for select to authenticated using \(\s*\(select public\.my_role\(\)\) = 'admin' or sent_by_user_id = \(select auth\.uid\(\)\)\)/.test(mig) && !/grant (insert|update|delete)[^;]*client_handoff_sends/.test(mig), "client_handoff_sends: the admin reads all, a rep only their own; no write grant");
  const trg = mig.slice(mig.indexOf("create or replace function public.trg_client_intake_on_paid"), mig.lastIndexOf("drop trigger if exists trg_client_intake_on_paid"));
  ok(/v_now := new\.service_terminated_at is null and new\.status is distinct from 'refunded'\s*and \(coalesce\(new\.amount_paid, 0\) > 0 or new\.status in \('payment_received', 'in_delivery', 'completed'\)\)/.test(trg), "the trigger fires on Paid Clients membership (an amount, or Mark Paid's status) — never refunded / ended");
  ok(/if v_was then return new; end if;/.test(trg) && /tg_op = 'UPDATE' and \(coalesce\(old\.amount_paid, 0\) > 0/.test(trg), "…only on the TRANSITION into the list (a replayed payment does nothing)");
  ok(!/interested|onboarding_link|sales_handoff|quick_close/.test(trg), "…and never on Interested, a sign-up link or a drafted handoff");
  ok(/on conflict \(lead_id\) do nothing/.test(trg) && /exception when others then raise warning/.test(trg), "idempotent insert, and a failure never blocks the payment");
  ok(/after insert or update of amount_paid, status on public\.outreach_leads/.test(mig), "every path writes the same row: Stripe, the QA simulation, Mark Paid and the manual add all reach it");
  ok(/cron\.schedule\('client-intake-run', '\* \* \* \* \*', 'select public\.invoke_client_intake\(\)'\)/.test(mig) && /if not exists \(select 1 from public\.client_intake\s*where status = 'queued'/.test(mig), "the backstop cron posts only while an intake is due");
  ok(!/alter table public\.outreach_leads add/.test(mig), "no column added to the large outreach_leads table");
}

/* ═══ 5. PRECEDENCE, CONFLICTS, OVERRIDES ═══════════════════════════════════════════════════════════ */
console.log("\n── PRECEDENCE ──");
ok(SOURCE_RANK.manual < SOURCE_RANK.onboarding && SOURCE_RANK.onboarding < SOURCE_RANK.handoff && SOURCE_RANK.handoff < SOURCE_RANK.companies_house
  && SOURCE_RANK.companies_house < SOURCE_RANK.website && SOURCE_RANK.website < SOURCE_RANK.places && SOURCE_RANK.places < SOURCE_RANK.audit,
  "Paul > client > salesperson > structured records > website > Google business data > inferred");
const phoneDef = INTAKE_FIELDS.find((f) => f.key === "phone")!;
const phone = mergeField(phoneDef, [{ source: "places", value: "01234 567890" }, { source: "onboarding", value: "07700 900123" }]);
ok(phone.value === "07700 900123" && phone.source === "onboarding" && phone.status === "conflict" && phone.conflict, "the client's phone wins over Google's — and the disagreement is FLAGGED, never silently chosen");
ok(phone.sources.length === 2 && phone.sources[0].label === "Client onboarding" && phone.sources[1].label === "Google business data", "…with both sources listed, strongest first");
ok(!mergeField(phoneDef, [{ source: "places", value: "+44 7700 900123" }, { source: "onboarding", value: "07700 900123" }]).conflict, "the same number written two ways is NOT a conflict (+44 / spaces normalised)");
ok(normPhone("+447700900123") === "07700900123" && normPhone("0044 7700 900123") === "07700900123" && normPhone("07700-900-123") === "07700900123", "UK numbers normalise to the 0… form");
const areasDef = INTAKE_FIELDS.find((f) => f.key === "service_areas")!;
const areas = mergeField(areasDef, [{ source: "sales", values: ["Sheffield", "Rotherham"] }, { source: "website", values: ["Rotherham"] }]);
ok(areas.values.join(",") === "Sheffield,Rotherham" && areas.conflict && areas.status === "conflict", "Paul's example: handoff Sheffield + Rotherham vs website Rotherham → shown as the handoff's, marked Needs review");
const servicesDef = INTAKE_FIELDS.find((f) => f.key === "services")!;
const services = mergeField(servicesDef, [{ source: "onboarding", values: ["Boiler repair"] }, { source: "website", values: ["Boiler repair", "Home", "Bathrooms"] }]);
ok(services.values.join() === "Boiler repair" && !services.conflict && services.sources.length === 2, "lists are never merged: the client's list wins whole; website menu items stay a listed source, not a conflict");
const confirmed = mergeField(phoneDef, [{ source: "onboarding", value: "07700 900123" }, { source: "website", value: "01111 222333" }], { confirmed: { value: "07700 900999", by: "paul", at: daysAgo(1) } });
ok(confirmed.value === "07700 900999" && confirmed.status === "confirmed" && !confirmed.conflict && confirmed.sources[0].source === "manual", "a value Paul confirmed outranks every source — automatic research cannot overwrite it");
const rejected = mergeField(phoneDef, [{ source: "onboarding", value: "07700 900123" }, { source: "places", value: "01234 567890" }], { rejected: [normPhone("07700 900123")] });
ok(rejected.value === "01234 567890" && rejected.sources.find((s) => s.source === "onboarding")?.rejected === true, "a value Paul rejected is never shown again (whichever source repeats it)");
ok(mergeField(phoneDef, []).status === "missing", "nothing anywhere → missing (never invented)");
const t1 = applyOverride({}, "phone", "edit", { value: "07700 900555", by: "paul", at: "t" });
ok(t1.next.phone?.confirmed?.value === "07700 900555", "Edit stores Paul's value as confirmed");
ok(!!applyOverride({}, "email", "edit", { value: "not-an-email", by: "p", at: "t" }).refused && !!applyOverride({}, "phone", "edit", { value: "12", by: "p", at: "t" }).refused, "a bad email / phone is refused");
ok(!!applyOverride({}, "credentials", "edit", { value: "NICEIC", by: "p", at: "t" }).refused, "website evidence (credentials) is shown, never edited into a fact");
const t2 = applyOverride(t1.next, "phone", "reject", { value: "07700 900555", by: "p", at: "t" });
ok(!t2.next.phone?.confirmed && t2.next.phone?.rejected?.includes("07700900555"), "rejecting Paul's own confirmed value undoes the confirmation");
ok(!("phone" in applyOverride(t1.next, "phone", "clear", { by: "p", at: "t" }).next), "Back to automatic clears his decision");
ok(Object.keys(cleanOverrides({ phone: { confirmed: { value: "1" } }, bogus: { confirmed: { value: "x" } } })).join() === "phone", "stored overrides are read through an allowlist of fields");

/* ═══ 6. THE CANDIDATES — every source mapped once ═════════════════════════════════════════════════ */
console.log("\n── SOURCES ──");
const rows: IntakeRows = {
  lead: { business_name: "ABC Plumbing", phone: "01234 567890", email: "info@abc.example", website: "https://abc.example", place_id: "ChIJ1", derived_town: "Rugby", category: "plumber",
    services_included: ["Boilers"], service_areas: ["Rugby", "Coventry"], rating: 4.8, review_count: 56, contact_name: null },
  onboarding: { business_name: "ABC Plumbing Ltd", confirmed_phone: "07700 900123", contact_email: "sam@abc.example", contact_name: "Sam Owner", confirmed_location: "Rugby", services_list: ["Boiler repair", "Bathrooms"], areas_list: [] },
  agreement: { legal_business_name: "ABC Plumbing Ltd", typed_name: "Sam Owner", company_number: "01234567" },
  handoff: { decision_maker_name: "Sam Owner" },
  quickClose: {},
  placeCache: { phone: "01234 567890", category: "Plumber" },
  companiesHouse: { match: "strong", company_name: "ABC PLUMBING LIMITED", company_number: "1234567" },
  crawl: { url: "https://abc.example", siteInfo: { phone: "01234 567890", email: "info@abc.example", towns: ["Rugby", "Coventry", "Leamington"], services: ["Boiler repair"], openingHours: ["Mo-Fr 08:00-18:00"], companyNumber: "01234567" },
    business: { credentials: [{ value: "Gas Safe — 123456", url: "https://abc.example/about" }], guarantees: [{ value: "24-hour emergency call-outs", url: "https://abc.example/" }], people: [], experience: [{ value: "Established 1998", url: "https://abc.example/about" }] } },
  hookAudit: { business_type: "plumbers", location_text: "Rugby" },
};
const cands = intakeCandidates(rows);
const profile = mergeClientProfile(cands);
const f = (k: string) => profile.find((x) => x.key === k)!;
ok(f("business_name").source === "onboarding" && !f("business_name").conflict, "business name: the client's form wins; 'Ltd' / LIMITED spellings are one name");
ok(f("phone").value === "07700 900123" && f("phone").conflict && f("phone").sources.some((s) => s.source === "website") && f("phone").sources.some((s) => s.source === "places"), "phone: client's, flagged against the number on their website and Google (conflicting phone)");
ok(f("services").values.join() === "Boiler repair,Bathrooms" && f("services").source === "onboarding", "onboarding merge: the client's services win over the lead's (no click needed)");
ok(f("service_areas").source === "sales" && f("service_areas").conflict && f("service_areas").sources.find((s) => s.source === "website")?.values?.includes("Leamington"), "an empty client list falls back to the salesperson's; the website's extra town is flagged");
ok(f("contact_name").value === "Sam Owner" && f("contact_name").sources.some((s) => s.label.includes("decision maker")), "handoff merge: the decision maker is a source for the contact");
ok(f("company_number").value === "01234567" && !f("company_number").conflict, "agreement / Companies House / website company numbers agree (leading zeros normalised)");
ok(f("trade").source === "lead" && f("trade").sources.some((s) => s.source === "audit"), "lead merge: the trade from the lead record; the hook audit's is listed as inferred, never above it");
ok(f("credentials").values[0] === "Gas Safe — 123456" && f("credentials").sources[0].urls?.[0] === "https://abc.example/about", "website extraction: a credential keeps the page it was read on");
ok(f("guarantees").values.includes("24-hour emergency call-outs") && f("experience").values.includes("Established 1998"), "…guarantees / 24-hour cover / history, each from the site with evidence");
ok(f("opening_hours").values[0] === "Mo-Fr 08:00-18:00", "…opening hours (schema.org only — never guessed from prose)");
ok(f("reviews").value === "4.8★ · 56 Google reviews" && f("reviews").source === "places", "Places merge: rating and review count, labelled Google business data");
const handLead = mergeClientProfile(intakeCandidates({ ...rows, lead: { ...rows.lead, place_id: null }, onboarding: null, agreement: null }));
ok(handLead.find((x) => x.key === "phone")!.source === "lead", "a hand-added lead's phone is the lead record, never 'Google'");
const noWeb = mergeClientProfile(intakeCandidates({ ...rows, crawl: null }));
ok(noWeb.find((x) => x.key === "credentials")!.status === "missing", "no crawl → website facts are simply not found (nothing invented)");

/* ═══ 7. GAPS AND STATUS ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── GAPS ──");
const steps: IntakeStep[] = [{ key: "lead", label: "Lead", status: "done", cost: "none" }, { key: "crawl", label: "Crawl", status: "reused", cost: "none" }, { key: "autofill", label: "Fill", status: "done", cost: "none" }];
const sum = intakeSummary(profile, steps, "build");
ok(sum.sources_checked === 2 && sum.fields_populated > 10 && sum.still_needed.length === 0, "a well-known client: nothing still needed (auto-fill is not counted as a source)");
ok(sum.conflicts.includes("Phone") && sum.conflicts.includes("Service areas"), "conflicts are counted separately as 'to review'");
ok(finishedStatus(sum) === "needs_attention" && finishedStatus({ ...sum, conflicts: [] }) === "ready", "Ready only with nothing needed and nothing to review");
const thin = mergeClientProfile(intakeCandidates({ lead: { business_name: "X", phone: "07700 900111" }, onboarding: null, agreement: null, handoff: null, quickClose: null, placeCache: null, companiesHouse: null, crawl: null, hookAudit: null }));
const thinSum = intakeSummary(thin, steps, "optimise");
ok(thinSum.still_needed.includes("Services") && thinSum.still_needed.includes("Home town") && !thinSum.still_needed.includes("Email") && thinSum.still_needed.includes("Website"), "only genuine gaps: a phone without an email is enough contact; Optimise needs their website, Build does not");
ok(!intakeSummary(thin, steps, "build").still_needed.includes("Website"), "…a Build client without a website is not 'missing' one");
const guessed = mergeClientProfile(intakeCandidates({ lead: { business_name: "X", phone: "07700 900111", derived_town: "Rugby", category: "plumber", contact_name: "Sam" }, onboarding: null, agreement: null, handoff: null, quickClose: null, placeCache: null, companiesHouse: null,
  crawl: { url: "https://x.example", siteInfo: { services: ["Boilers"], towns: ["Rugby"] }, business: null }, hookAudit: null }));
const guessedSum = intakeSummary(guessed, steps, "build");
ok(guessedSum.still_needed.includes("Services (confirm what we found)") && guessedSum.still_needed.includes("Service areas (confirm what we found)"), "services / areas found only on their website still need confirming (a guess is not an answer — as the setup checklist says)");
ok(guessed.find((x) => x.key === "services")!.values.join() === "Boilers", "…while the website's list is still shown, labelled, for Paul to confirm in one press");
ok(intakeStatusLine("crawling", null).startsWith("Crawling website") && intakeStatusLine("queued", null).startsWith("Gathering") && intakeStatusLine(null, null) === "Not run yet", "live states: Gathering existing information / Crawling website / Merging findings");
ok(/12 sources checked · 18 fields populated · 3 items still needed/.test(intakeStatusLine("needs_attention", { sources_checked: 12, sources_with_data: 9, fields_populated: 18, still_needed: ["a", "b", "c"], conflicts: [] })), "the summary line Paul reads: N sources checked · N fields populated · N items still needed (no percentages)");
ok(intakeNoticeTitle("ABC", "ready") === "CLIENT READY · ABC" && /needs attention/.test(intakeNoticeTitle("ABC", "needs_attention")), "Paul's notice when it finishes");

/* ═══ 8. THE CRAWL DECISION ═════════════════════════════════════════════════════════════════════════ */
console.log("\n── THE CRAWL ──");
const base = { website: "https://abc.example", crawl: null, job: null, intakeJobId: null, intakeCrawlStartedAt: null, nowMs: NOW };
ok(crawlPlan({ ...base, website: null }).action === "not_needed", "no website → no crawl (and nothing fails)");
ok(crawlPlan({ ...base, crawl: { url: "https://www.abc.example/", created_at: daysAgo(3), mode: "full", completeness: "complete" } }).action === "reuse", "a recent FULL crawl of the same site (www ignored) is reused — no second crawl");
ok(crawlPlan({ ...base, crawl: { url: "https://abc.example", created_at: daysAgo(3), mode: "standard", completeness: null } }).action === "start", "a quick (standard) crawl is not enough → one full crawl starts");
ok(crawlPlan({ ...base, crawl: { url: "https://abc.example", created_at: new Date(NOW - CRAWL_FRESH_MS - 1000).toISOString(), mode: "full", completeness: "complete" } }).action === "start", "an out-of-date full crawl → a fresh one starts");
ok(crawlPlan({ ...base, crawl: { url: "https://other.example", created_at: daysAgo(1), mode: "full", completeness: "complete" } }).action === "start", "a crawl of a different site is never reused");
ok(crawlPlan({ ...base, crawl: { url: "https://abc.example", created_at: daysAgo(1), mode: "full", completeness: "failed" } }).action === "start", "a failed crawl is not reused");
ok(crawlPlan({ ...base, job: { id: "j1", status: "running", started_at: daysAgo(0) } }).action === "wait", "a crawl already running (anyone's) is waited on — never a second one");
ok(crawlPlan({ ...base, job: { id: "j1", status: "running", started_at: new Date(NOW - INTAKE_CRAWL_MAX_WAIT_MS - 1).toISOString() }, intakeJobId: "j1", intakeCrawlStartedAt: new Date(NOW - INTAKE_CRAWL_MAX_WAIT_MS - 1).toISOString() }).action === "give_up", "a crawl still running after the wait limit → the intake carries on without it");
ok(crawlPlan({ ...base, job: { id: "j1", status: "failed" }, intakeJobId: "j1", intakeCrawlStartedAt: daysAgo(0) }).action === "give_up", "the intake's own crawl failed (website down) → it is NOT retried; the rest of the intake finishes");
ok(isIntakeCrawlRequest(true, { mode: "full", requested_from: "client_intake", lead_id: "x" }) && !isIntakeCrawlRequest(false, { mode: "full", requested_from: "client_intake", lead_id: "x" })
  && !isIntakeCrawlRequest(true, { mode: "full", requested_from: "client_intake", lead_id: "x", url: "https://evil.example" }) && !isIntakeCrawlRequest(true, { mode: "full", requested_from: "outreach", lead_id: "x" })
  && resolveCrawlMode("full", false) === "standard", "the ONE internal full-crawl door: internal + client_intake + a lead id only (no URL); every other internal caller stays standard");
{
  const cc = read("supabase/functions/crawl-check/index.ts");
  ok(/if \(intakeCrawl && !isClient\) return json\(\{ ok: false, error: "not_a_client"/.test(cc), "crawl-check refuses the intake door for anyone who is not a paid client");
  ok(/userId: intakeCrawl \? intakeOwnerId : rowOwnerId/.test(cc), "…and files the job under the book (the lead's owner)");
}

/* ═══ 9. AUTO-FILL — client and sales answers only ═════════════════════════════════════════════════ */
console.log("\n── AUTO-FILL ──");
const known: KnownForItem[] = [
  { key: "services", clientOnly: false, candidates: [{ id: "services:0:crawl", source: "crawl", label: "Their website", note: null, items: ["Boilers"], apply: "services" }] },
  { key: "service_areas", clientOnly: false, candidates: [{ id: "a:0:onboarding", source: "onboarding", label: "An earlier form", note: null, items: ["Rugby"], apply: "service_areas" }, { id: "a:1:crawl", source: "crawl", label: "Their website", note: null, items: ["Rugby", "Leamington"], apply: "service_areas" }] },
  { key: "website_access", clientOnly: false, candidates: [{ id: "w:0:handoff", source: "handoff", label: "Handoff", note: null, value: "client_controls", apply: "website_control" }] },
  { key: "domain", clientOnly: true, candidates: [{ id: "d:0:onboarding", source: "onboarding", label: "x", note: null, value: "y", apply: null }] },
];
const applied = autoApplyCandidates(known);
ok(applied.map((c) => c.id).join() === "a:0:onboarding,w:0:handoff", "auto-fill applies the client's earlier form and the handoff — never a website guess, never a client-only item");
ok(![...AUTO_APPLY_SOURCES].includes("crawl" as never), "…the website (crawl) is not an auto-apply source at all");

/* ═══ 10. BUILD CONTENT RIGHTS ═════════════════════════════════════════════════════════════════════ */
console.log("\n── BUILD: CONTENT RIGHTS ──");
ok(contentReuse({ quickCloseRights: "yes" }) === "permitted" && contentReuse({ siteRights: "yes" }) === "permitted", "an explicit yes (sales call or the client's own answer) permits reuse");
ok(contentReuse({ quickCloseRights: "no" }) === "not_permitted" && contentReuse({ quickCloseRights: "yes", siteRights: "no" }) === "not_permitted", "a no anywhere → not permitted (the client's no beats the call's yes)");
ok(contentReuse({}) === "unknown" && contentReuse({ quickCloseRights: "not_sure" }) === "unknown", "public is not permission: unknown stays unknown");
ok(/REFERENCE ONLY — DO NOT REUSE/.test(CONTENT_REUSE_WORDS.not_permitted) && /REFERENCE ONLY — DO NOT REUSE/.test(CONTENT_REUSE_WORDS.unknown), "…shown as REFERENCE ONLY — DO NOT REUSE");

/* ═══ 11. THE INTAKE CODE — what it may and may not do ════════════════════════════════════════════ */
console.log("\n── THE INTAKE: SAFETY SWEEP ──");
{
  const mod = strip(read("supabase/functions/_shared/client-intake.ts"));
  const fn = strip(read("supabase/functions/client-intake/index.ts"));
  ok(!/googleapis|fetchPlaceDetails|google-place-details|apify|openai|create-ai-audit|extract-competitors|run-seo-scan/i.test(mod + fn), "no paid API: Google Places, Apify, OpenAI, audits — none are called (stored data is reused)");
  ok(!/send-whatsapp|whatsapp_send|sendOperatorAlert|resend|sendEmail|mailto/i.test(mod + fn), "never contacts the client (no WhatsApp, no email, no reminders)");
  ok(!/paid-baseline|startPaidBaseline|baseline_status|discovery|audit_purpose:\s*"baseline"/i.test(mod.replace(/PROSPECT_AUDIT_OR = [^\n]+/, "")), "the formal baseline is NOT started or faked — the hook audit is only read");
  ok((mod.match(/functions\/v1\//g) ?? []).length === 1 && /functions\/v1\/crawl-check/.test(mod) && /requested_from: "client_intake"/.test(mod), "the only outward call is crawl-check's intake door (the client's own public site)");
  ok(/\.eq\("lead_id", leadId\)\.eq\("status", prev\.status\)/.test(mod) && /claimQ\.eq\("lease_until", prev\.lease_until\)/.test(mod), "a run starts only by a conditional claim on the state it read (two ticks never run one client)");
  ok(/attempts > INTAKE_MAX_ATTEMPTS/.test(mod) && INTAKE_MAX_ATTEMPTS <= 10, "a capped number of attempts — no runaway retry loop");
  ok(/\(prev\.status === "crawling" \? 0 : 1\)/.test(mod), "…and waiting on a crawl is not an attempt");
  ok(/crawl: null,/.test(mod) && /autoApplyCandidates\(known\)/.test(mod), "auto-fill never reads the crawl (website finds stay suggestions)");
  ok(/services_included\.is\.null,services_included\.eq\.\{\}/.test(mod) && /website\.is\.null,website\.eq\./.test(mod), "…and writes only BLANK lead fields (the filter is on the update itself)");
  ok(/async function step</.test(mod) && /status: "failed", detail: msg\.slice/.test(mod), "each source is its own step: one failed read never fails the intake");
  ok(/x-cron-secret/.test(fn) && /if \(!internal\) return json\(\{ ok: false, error: "not_authorised" \}, 401\)/.test(fn), "fn client-intake is internal only (CRON_SECRET)");
  ok(/\[functions\.client-intake\]\nverify_jwt = false/.test(read("supabase/config.toml")), "config.toml lists client-intake (handler-side auth)");
  const hook = read("supabase/functions/stripe-webhook/index.ts");
  ok(!/client_intake|client-intake/.test(hook), "stripe-webhook is unchanged — the database trigger starts the intake for EVERY paid path");
}

/* ═══ 12. PAUL'S SCREEN AND CONTROLS ═══════════════════════════════════════════════════════════════ */
console.log("\n── PAID CLIENTS ──");
{
  const hub = read("supabase/functions/paid-client-hub/index.ts");
  ok(hub.indexOf("const gate = await requireAdmin(") < hub.indexOf('if (action === "intake_run")') && hub.indexOf("const gate = await requireAdmin(") < hub.indexOf('if (action === "intake_fact")'), "the intake actions sit behind requireAdmin (a salesperson can never reach them)");
  ok(/intake = await intakeView\(service, leadId\)/.test(hub) && /catch \(e\) \{ console\.error\("\[paid-client-hub\] intake view failed \(non-blocking\)/.test(hub), "the client page carries the intake, and a failure never fails the page");
  ok(/isIntakeFieldKey\(key\)/.test(hub) && /applyOverride\(cleanOverrides\(rec\?\.overrides\)/.test(hub), "Paul's decisions go through the allowlist and applyOverride");
  ok(/value = src \? src\.value \?\? null : field\?\.value \?\? null/.test(hub), "Confirm takes the value the SERVER shows now — never a value the browser sends");
  ok(/recordLeadEvent\(service, leadId, "client_fact_set"/.test(hub), "each decision is in History");
  ok(/queueIntake\(service, leadId, "rerun"\)/.test(hub) && /clientClosed\(own as never\)\) return json\(\{ ok: false, error: "client_closed"/.test(hub), "Refresh research re-runs the ONE intake; refused for an ended client");
  ok(/handoffs_awaiting_payment: awaiting/.test(hub) && /isPaidClient\(l as never\)\) return \[\]/.test(hub), "Paid Clients lists handoffs sent before payment as Awaiting payment (a paid one moves into the client list)");
  const card = read("src/components/ClientIntakeCard.tsx");
  ok(["Who are they", "What did they buy", "What did Sales tell us", "What did the client tell us", "What did we find"].every((h) => card.includes(h)) && /Still needed:/.test(card), "the card answers who / what they bought / Sales / the client / what we found / what we still need");
  ok(/Needs review — conflicting evidence/.test(card) && /Sources \(/.test(card) && /Wrong — reject/.test(card) && /Confirm/.test(card) && /Back to automatic/.test(card), "conflicts, expandable sources, Confirm / Edit / reject / Back to automatic");
  ok(/Refresh research/.test(card) && /Refresh Google data/.test(card) && /#hub-setup/.test(card), "re-run controls; the existing Missing information box stays the fallback (Find again / Ask salesperson / Contact client)");
  ok(/action: 'intake_view'/.test(card) && /POLL_MS = 15_000/.test(card) && !/action: 'get'/.test(card), "while research runs the card polls only the intake — the client stays usable");
  ok(/This is the prospect check, not the guarantee/.test(card) && /paid baseline/.test(card), "the hook audit is shown as the prospect check, never confused with the paid 20-question baseline");
  ok(/For the new website \(Build\)/.test(card) && /For optimising their website \(Optimise\)/.test(card), "Build and Optimise each get their own preparation block");
  const page = read("src/pages/ClientHub.tsx");
  ok(/<ClientIntakeCard leadId=\{lead\.id\} initial=\{hub\.intake\}/.test(page) && page.indexOf("<ClientIntakeCard") < page.indexOf("<ClientSetupCard"), "the intake sits at the top of the client page, above the setup checklist");
  ok(/intake: prev\?\.intake/.test(page), "the baseline poller keeps the intake on screen");
  const nc = read("src/components/NotificationCenter.tsx");
  ok(/client_handoff:/.test(nc) && /client_intake:/.test(nc), "the bell draws both new notices");
}

/* ═══ 13. THE LOOK ═════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── QUICK CLOSE: THE LOOK ──");
{
  const dlg = read("src/components/QuickCloseDialog.tsx");
  const code = strip(dlg);
  ok(!/teal-|cyan-/.test(code), "no teal / cyan class left in Quick Close");
  ok(!/TONE\.green\.(tint|bar|soft|text|ring)/.test(code) && !/tone="green"/.test(code), "…and no use of the teal 'green' tone's washes");
  ok(/const MONEY_CTA = '[^']*bg-blue-600/.test(dlg) && /TONE\.blue\.bar/.test(dlg), "the primary action and the progress bar are workflow blue");
  ok(/className=\{cn\('min-w-0', PANEL, EDGE\.blue\)\} data-testid="qc-route-terms"/.test(dlg), "the Build / Optimise card is a dashboard surface with a thin accent edge (no coloured wash)");
  ok(/EMPHASIS_TEXT = 'text-yellow-500/.test(dlg) && /ShieldCheck className=\{cn\('h-4 w-4 shrink-0', EMPHASIS_TEXT\)\}/.test(dlg), "Findable yellow is used for emphasis (the guarantee)");
  ok(/SUCCESS_CHIP = 'bg-emerald-500/.test(dlg), "green is kept for genuine success (paid, link ready, sent)");
  ok(/onSend=\{sendToPaul\}/.test(dlg) && /mode: 'send_to_paul'/.test(dlg), "the Close tab's handoff ends with Send to Paul");
  const form = strip(read("src/components/SalesHandoffForm.tsx"));
  ok(!/teal-|cyan-|emerald-500 bg-emerald/.test(form) && /border-blue-500 bg-blue-500\/10/.test(form), "the handoff form's choices are blue, not emerald");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall passed");
if (failures) process.exit(1);
