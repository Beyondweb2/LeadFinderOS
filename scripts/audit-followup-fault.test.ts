/* ============================================================
   audit_followup_fault — the SEVEN-variable outreach template, and the two rules that make it safe:
     1. it builds exactly seven Meta body params, in the order Paul registered
        ({{1}} trade+article, {{2}} town, {{3}}{{4}}{{5}} rivals, {{6}} site fault, {{7}} report link);
     2. {{6}} may NEVER be empty (Meta rejects a blank parameter), so an absent fault FAILS CLOSED
        rather than sending a broken message — the whole reason the picker gates it on a crawl fault.

   Run: npx tsx scripts/audit-followup-fault.test.ts
   ============================================================ */
import { WA_TEMPLATES, claimTemplatePayload, renderTemplateBody } from "../supabase/functions/_shared/whatsapp-send.ts";
import { readFileSync } from "node:fs";
import { WA_TEMPLATE_REQS, getTemplateSendability } from "../src/lib/whatsappTemplates.ts";
import { CONTINUATION_TEMPLATES } from "../src/lib/coldOutreach.ts";
import { REPORT_LINK_TEMPLATES } from "../src/lib/templateAttribution.ts";
import { buildsFromAudit, unsuppliedVars } from "../src/lib/templateRouting.ts";
import { siteFaultLine, resolveSiteFault, NO_WEBSITE_FAULT_LINE, CRAWL_CHECK_VERSION, type CrawlSignals } from "../src/lib/crawlCheck.ts";

let f = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) f++; };

const NAME = "audit_followup_fault";
const REPORT = "https://findable.live/r/k4m2p9";

console.log("\n── THE REGISTRY ENTRY ──");
const entry = WA_TEMPLATES[NAME];
ok(!!entry, "registered in WA_TEMPLATES");
ok(JSON.stringify(entry.vars) === JSON.stringify(
  ["trade_article", "town", "rival_1", "rival_2", "rival_3", "site_fault", "audit_url"]),
  `seven vars in Paul's order (got ${JSON.stringify(entry.vars)})`);
ok(!entry.headerVideoUrl, "no video header (it is a plain personal note)");

console.log("\n── IT BUILDS SEVEN BODY PARAMS, IN ORDER ──");
{
  const comps = claimTemplatePayload(NAME, "en", "RG Locksmiths", REPORT, {
    trade: "locksmith", town: "Huntingdon",
    rivals: ["Keytek", "LockRite", "Timpson"],
    siteFault: "Only about 40 characters reach a crawler — the rest loads with JavaScript.",
    auditUrl: REPORT,
  }).template.components as Array<{ type: string; parameters: Array<{ text: string }> }>;
  // No header component → body is the only component.
  ok(comps.length === 1 && (comps[0] as { type: string }).type === "body", "one component, the body (no header)");
  const bp = (comps[0] as { parameters: Array<{ text: string }> }).parameters;
  ok(bp.length === 7, `seven body params (${bp.length})`);
  ok(bp[0].text === "a locksmith", `{{1}} trade WITH article (got ${JSON.stringify(bp[0].text)})`);
  ok(bp[1].text === "Huntingdon", "{{2}} town");
  ok(bp[2].text === "Keytek" && bp[3].text === "LockRite" && bp[4].text === "Timpson", "{{3}}{{4}}{{5}} the three rivals in order");
  ok(bp[5].text.startsWith("Only about 40 characters"), "{{6}} the site fault sentence");
  ok(bp[6].text === REPORT, "{{7}} the short report link");
}

console.log("\n── {{6}} EMPTY FAILS CLOSED (Meta rejects a blank param) ──");
for (const fault of ["", "   "]) {
  let threw = false;
  try {
    claimTemplatePayload(NAME, "en", "X", REPORT, {
      trade: "locksmith", town: "Huntingdon", rivals: ["A", "B", "C"], siteFault: fault, auditUrl: REPORT,
    });
  } catch (e) { threw = String((e as Error).message).startsWith("unsafe_template_var:no_site_fault"); }
  ok(threw, `an empty/blank fault (${JSON.stringify(fault)}) throws unsafe_template_var:no_site_fault`);
}

console.log("\n── A MISSING RIVAL STILL FAILS CLOSED (it names three) ──");
{
  let threw = false;
  try {
    claimTemplatePayload(NAME, "en", "X", REPORT, {
      trade: "locksmith", town: "Huntingdon", rivals: ["A", "B"], siteFault: "x", auditUrl: REPORT,
    });
  } catch (e) { threw = String((e as Error).message).startsWith("unsafe_template_var:rivals_unavailable"); }
  ok(threw, "only two rivals throws rivals_unavailable");
}

console.log("\nPREVIEW, IMMEDIATE AND QUEUED SEND SHARE THE SAME SITE FAULT");
{
  const fault = "Your service pages don't clearly tell AI which areas you cover.";
  const rendered = renderTemplateBody(NAME, "RG Locksmiths", REPORT, "locksmith", "Keytek, LockRite and Timpson", undefined, "Huntingdon", fault);
  ok(rendered.includes(`Here's the main thing holding you back.\n\n${fault}\n\n`), "preview/transcript inserts the exact non-empty fault after the heading");
  ok(rendered.split(fault).length - 1 === 1, "the real crawl fault appears exactly once in the rendered message");
  let threw = false;
  try { renderTemplateBody(NAME, "RG Locksmiths", REPORT, "locksmith", "Keytek, LockRite and Timpson", undefined, "Huntingdon", "  "); }
  catch (e) { threw = String((e as Error).message).startsWith("unsafe_template_var:no_site_fault"); }
  ok(threw, "the preview/transcript renderer rejects a whitespace-only site fault");

  const immediate = readFileSync("supabase/functions/send-whatsapp-message/index.ts", "utf8");
  const queued = readFileSync("supabase/functions/process-whatsapp-queue/index.ts", "utf8");
  ok(immediate.includes("a.town, a.siteFault ?? undefined"), "immediate send stores the same resolved site fault it sends to Meta");
  ok(queued.includes("auditExtra.siteFault = vars.siteFault ?? \"\""), "queued first-reply path supplies the resolved site fault to Meta");
  ok(queued.includes("vars.town, vars.siteFault ?? undefined"), "queued first-reply path stores that same fault in its transcript");
  ok(queued.includes("templateExtra.siteFault = ar.siteFault ?? \"\""), "queued drip path supplies the resolved site fault to Meta");
  ok(queued.includes("templateExtra.town, templateExtra.siteFault"), "queued drip path stores that same fault in its transcript");
}

console.log("\n── ROUTING, GATING AND ATTRIBUTION AGREE ──");
ok(buildsFromAudit(entry.vars), "routes to the AUDIT branch (needs the completed audit)");
ok(unsuppliedVars(entry.vars).length === 0, `the audit branch supplies every var (unsupplied: ${JSON.stringify(unsuppliedVars(entry.vars))})`);
ok(WA_TEMPLATE_REQS[NAME]?.needsAudit === true, "needsAudit");
ok(WA_TEMPLATE_REQS[NAME]?.needsSiteFault === true, "needsSiteFault (the picker gate)");
ok(!getTemplateSendability(NAME, { shareToken: null }, { reportSlug: REPORT, hasSiteFault: false }).ok,
  "the fault template is disabled when the resolver has no usable fault");
ok(CONTINUATION_TEMPLATES.has(NAME), "a CONTINUATION (Inbox only; holds rather than falling back)");
ok(REPORT_LINK_TEMPLATES.has(NAME), "in REPORT_LINK_TEMPLATES (it carries the report link in {{7}})");

console.log("\n── {{6}} HAS A LINE FOR A NO-WEBSITE LEAD, NOT JUST A CRAWL FAULT ──");
const FAULTY: CrawlSignals = { homeUrl: "https://x", fetchFailed: false, searchBlocked: ["OAI-SearchBot"], readableAs: null, clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0 };
const CLEAN: CrawlSignals = { ...FAULTY, searchBlocked: [] };
const now = Date.now();
// No website → the no-website line, whether or not a crawl row exists.
ok(siteFaultLine(false, null, 0) === NO_WEBSITE_FAULT_LINE, "no website → the no-website line (no crawl needed)");
ok(NO_WEBSITE_FAULT_LINE === "You don't currently have a website, which means Google and other AI tools have very little first-party information to use when deciding whether to recommend your business.", "the no-website line is truthful about limited first-party information");
ok(!/\n|\t/.test(NO_WEBSITE_FAULT_LINE) && !/ {4,}/.test(NO_WEBSITE_FAULT_LINE), "it is one clean line (Meta rejects newline/tab/4+ spaces)");
{
  const noWebsiteFault = resolveSiteFault(false, [], null);
  const rendered = renderTemplateBody(NAME, "No Site Ltd", REPORT, "electrician", "A, B and C", undefined, "Stockton-on-Tees", noWebsiteFault ?? undefined);
  ok(noWebsiteFault === NO_WEBSITE_FAULT_LINE, "the shared resolver returns the valid no-website fault without a crawl");
  ok(getTemplateSendability(NAME, { shareToken: null }, { reportSlug: REPORT, hasSiteFault: !!noWebsiteFault }).ok, "a no-website lead is selectable because it has the valid no-website fault");
  ok(rendered.includes(NO_WEBSITE_FAULT_LINE), "the no-website fault reaches preview/immediate/queued body rendering");
  const params = (claimTemplatePayload(NAME, "en", "No Site Ltd", REPORT, {
    trade: "electrician", town: "Stockton-on-Tees", rivals: ["A", "B", "C"], siteFault: noWebsiteFault ?? "", auditUrl: REPORT,
  }).template.components as Array<{ parameters: Array<{ text: string }> }>)[0].parameters;
  ok(params[5].text === NO_WEBSITE_FAULT_LINE, "the no-website fault is the exact Meta {{6}} value");
}
// A website: the crawl fault when there is one (fresh + v2), else null.
ok(siteFaultLine(true, { version: CRAWL_CHECK_VERSION, signals: FAULTY }, now) !== null, "website + a fresh v2 fault → the crawl fault");
ok(siteFaultLine(true, { version: CRAWL_CHECK_VERSION, signals: CLEAN }, now) === null, "website + a clean crawl → null (not offered)");
ok(siteFaultLine(true, null, 0) === null, "website + no crawl at all → null (not offered)");
ok(siteFaultLine(true, { version: 1, signals: FAULTY }, now) === null, "website + a PRE-v2 crawl → null (its findings aren't trusted)");
ok(siteFaultLine(true, { version: CRAWL_CHECK_VERSION, signals: FAULTY }, now - 40 * 86_400_000) === null, "website + a STALE crawl → null");

console.log("\nRUN-LEVEL SOURCE OF TRUTH");
ok(
  resolveSiteFault(true, [{ result: { status: "complete", version: CRAWL_CHECK_VERSION, signals: FAULTY }, createdAtMs: now, complete: true }], null) !== null,
  "a completed audit run's crawl fault enables the template without a lead cache row",
);
ok(
  resolveSiteFault(true, [{ result: { status: "unavailable", version: CRAWL_CHECK_VERSION, signals: FAULTY }, createdAtMs: now, complete: false }], null) === null,
  "an unavailable run never invents a usable fault",
);
ok(
  resolveSiteFault(true, [], { result: { version: CRAWL_CHECK_VERSION, signals: FAULTY }, createdAtMs: now }) !== null,
  "a fresh lead-level manual crawl remains a valid fallback",
);
ok(
  resolveSiteFault(true, [{ result: { status: "complete", version: CRAWL_CHECK_VERSION, signals: CLEAN }, createdAtMs: now, complete: true }], { result: { version: CRAWL_CHECK_VERSION, signals: FAULTY }, createdAtMs: now }) !== null,
  "a clean run can fall back to a fresh real lead-level fault",
);
ok(
  getTemplateSendability("audit_followup_call", { shareToken: null }, { reportSlug: REPORT, hasSiteFault: false }).ok,
  "the call follow-up remains available when no site fault exists",
);

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) throw new Error(`${f} failures`);
