/* Audit verdict rules v3 — the evidence rule (Paul, 2026-11-16; docs/AUDIT_RULES.md): each AI judged on its own asks,
   "Couldn't measure" for an unread answer, "AI doesn't name businesses here", registers never firms, the named % over every
   answer, "Audit incomplete", the alerts, and the real case that started it (16 Nov London Discovery: Winnable 39 of 39). */
import {
  AUDIT_INCOMPLETE_AT, AUDIT_RULES_V2_FROM, AUDIT_RULES_V3_FROM, CROWDED_AT, NAMES_IN_ASKS, auditCompleteness, auditRulesFor, clientLineOf,
  decideVerdict, decideVerdictV3, guaranteeIdentityFor, isRegisterName, registersInAnswer, type AnswerFacts,
} from "../src/lib/auditVerdict.ts";
import { firmKey, oppQuestion, type OppContext, type OppRow } from "../src/lib/reportOpportunity.ts";
import { buildReportModel } from "../src/lib/reportModel.ts";
import { renderReport, splitLine, verdictSplitOf, winnableOf } from "../src/lib/reportDesign.ts";
import { renderLeadfinderReport } from "../src/lib/leadfinderReport.ts";
import { incompleteAlert, isIncomplete, providerAlert, providerRefusal, refusalsIn, unmeasuredAnswers } from "../src/lib/auditAlerts.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type E = "chatgpt" | "gemini";
const A = (engine: E, firms: string[], o: Partial<AnswerFacts> = {}): AnswerFacts => ({ engine, failed: false, you: "no", near: [], firms, dirs: [], wrongPlace: false, text: "Some advice on choosing a firm.", registers: [], ...o });
const six = (fn: (e: E, i: number) => AnswerFacts) => [0, 1, 2].flatMap((i) => [fn("chatgpt", i), fn("gemini", i)]);
const V = (answers: AnswerFacts[], o: Partial<Parameters<typeof decideVerdictV3>[0]> = {}) => decideVerdictV3({ question: "EICR certificate in Tower Hamlets", answers, head: "EICR certificate", leftOut: null, area: "Tower Hamlets", key: firmKey, ...o });

/* ── The constants Paul set ─────────────────────────────────────────────────────────────────── */
ok(NAMES_IN_ASKS === 2 && CROWDED_AT === 0.7 && AUDIT_INCOMPLETE_AT === 0.1, "the lines: 2 of 3 asks, top 3 at 70%, incomplete over 10%");

/* ── THE BUG: ChatGPT names firms every time, Gemini gives advice (the 16 Nov London pattern) ─── */
const ldm = six((e, i) => e === "chatgpt" ? A(e, [`SCV Electrical ${i}`, `Lloyd Hallowell ${i}`, `Certified Electricians ${i}`, "AC1 Electrical"]) : A(e, [], { dirs: [], registers: ["NICEIC", "NAPIT"] }));
const vl = V(ldm);
ok(vl.rule === "open" && vl.verdict === "winnable", "ChatGPT names varied firms in 3 of 3 asks, Gemini none: Winnable (judged on ChatGPT's own asks)");
ok(decideVerdict({ question: "q", answers: ldm, head: "EICR certificate", leftOut: null, area: null, key: firmKey }).verdict === "winnable", "(v2 also said Winnable here, but for any one stored firm; v3 needs the evidence)");
const crowdedOne = six((e) => e === "chatgpt" ? A(e, ["SCV Electrical", "Lloyd Hallowell", "Certified Electricians"]) : A(e, []));
const vc = V(crowdedOne);
ok(vc.rule === "crowded" && vc.verdict === "not_winnable" && vc.lockedBy.length === 3, "ChatGPT names the same 3 firms in all its asks (100%), Gemini none: Not winnable, the 3 stored");
const oneAsk = six((e, i) => e === "chatgpt" && i === 0 ? A(e, ["SCV Electrical"]) : A(e, [], { dirs: ["Checkatrade"], registers: ["Gas Safe Register"] }));
const vn = V(oneAsk);
ok(vn.rule === "no_names" && vn.verdict === "no_names", "one firm in 1 of 3 ChatGPT asks, none on Gemini: AI doesn't name businesses here (v2 called this Winnable)");
ok(vn.directories.includes("Checkatrade") && vn.registers?.includes("Gas Safe Register") && /points people to Checkatrade/.test(vn.reason) && /check Gas Safe Register/.test(vn.reason), "it says where AI points people instead: directories, then registers");
ok(winnableOf({ tier: "some", repeatShare: 0, top: 0, answers: 6, verdict: vn }) === "no_names", "never Winnable on the report");
ok(clientLineOf(vn) === "AI doesn't name businesses here yet." && !/\d/.test(clientLineOf(vn)), "its client line, no counts, no names");

/* ── Each AI separately: one open AI is enough; both crowded = Not winnable ──────────────────── */
const mixed = six((e, i) => e === "chatgpt" ? A(e, ["Gas First", "Best Gas", "MAMOSS"]) : A(e, [`Firm ${i}a`, `Firm ${i}b`, `Firm ${i}c`]));
ok(V(mixed).verdict === "winnable", "ChatGPT crowded but Gemini rotates: Winnable (at least one AI has room)");
const both = six((e) => A(e, e === "chatgpt" ? ["Gas First", "Best Gas", "MAMOSS"] : ["Hackney Heating", "Full Flame", "East End"]));
ok(V(both).rule === "crowded", "both AIs each name their own same 3 firms: Not winnable");
const twoOfThree = six((e, i) => e === "chatgpt" && i < 2 ? A(e, [`A${i}`, `B${i}`, `C${i}`, `D${i}`]) : A(e, []));
ok(V(twoOfThree).verdict === "winnable", "2 of 3 asks on one AI is enough evidence");

/* ── Already named beats everything; a failed or unread answer = Couldn't measure ─────────────── */
ok(V(six((e, i) => A(e, ["Gas First", "Best Gas", "MAMOSS"], { you: i === 0 && e === "gemini" ? "named" : "no" }))).rule === "visible", "named once beats a crowded list");
const unread = V(six((e, i) => A(e, ["X"], { failed: e === "gemini" && i === 1 })));
ok(unread.rule === "unmeasured" && unread.verdict === null && unread.label === "Couldn't measure" && unread.unmeasured === 1, "one failed or unread answer: Couldn't measure, never a verdict, counted as unmeasured");

/* ── Registers are never firms, never a directory gap ─────────────────────────────────────────── */
ok(["Gas Safe Register", "the Gas Safe Register", "NICEIC", "NAPIT", "gov.uk", "HSE", "TrustMark"].every(isRegisterName) && !isRegisterName("Gas Safe Medic Ltd") && !isRegisterName("NICEIC Approved Electricians Ltd Hackney"), "the register list (and real firms with those words are not registers)");
ok(registersInAnswer("Always use a Gas Safe registered engineer; see gov.uk and the HSE.", []).join() === "Gas Safe Register,gov.uk,HSE", "registers read from an answer's text");
ok(registersInAnswer("", ["niceic.com", "www.napit.org.uk"]).join() === "NICEIC,NAPIT", "and from its cited sites");
const regOnly = six((e) => A(e, ["Gas Safe Register", "NICEIC"]));
ok(V(regOnly).rule === "no_names", "an answer listing only registers names no business");

/* ── Through the real reader: an answer without the firms_read mark is not measured ──────────── */
const ID = { name: "London Domestic Maintenance Ltd", domains: ["londondomesticmaintenance.com"] };
const ctx3: OppContext = { businessName: "London Domestic Maintenance Ltd", services: [], rules: 3, identity: ID };
const cell = (text: string, competitors: string[], read: boolean) => ({ answer_text: text, competitors, citations: [{ url: "https://www.niceic.com/find" }], ...(read ? { firms_read: true } : {}) });
const rowsRead: OppRow[] = [0, 1, 2].map((i) => ({ question: "EICR certificate in Tower Hamlets", result: { chatgpt: cell("1. SCV Electrical", [`SCV Electrical ${i}`, `Lloyd Hallowell ${i}`, "Gas Safe Register"], true), gemini: cell("Use an NICEIC electrician.", [], true) } }));
const rowsUnread: OppRow[] = rowsRead.map((r) => ({ ...r, result: { chatgpt: { ...(r.result!.chatgpt as object), firms_read: undefined }, gemini: r.result!.gemini } }));
const qRead = oppQuestion("EICR certificate in Tower Hamlets", rowsRead, ctx3);
const qUnread = oppQuestion("EICR certificate in Tower Hamlets", rowsUnread, ctx3);
ok(qRead.verdict?.rules === 3 && qRead.verdict.rule === "open", "read answers: a v3 verdict (Winnable on ChatGPT's own asks)");
ok(qRead.verdict?.registers?.includes("NICEIC") === true && !qRead.verdict.toBeat.some((x) => /gas safe/i.test(x.name)), "a register in the firm list or the sources is never a firm");
ok(qUnread.verdict?.rule === "unmeasured", "THE 16 NOV BUG: firm lists that were never read = Couldn't measure, not \"AI named nobody\"");
ok(oppQuestion("EICR certificate in Tower Hamlets", rowsUnread, { ...ctx3, rules: 2 }).verdict?.rules === 2, "a v2 audit keeps v2 (no mark needed): its link keeps its page");

/* ── The named % is over every answer returned (item 6) ───────────────────────────────────────── */
const m3 = buildReportModel(rowsRead, ctx3, { kind: "opportunity", businessName: "London Domestic Maintenance Ltd", town: "London", dateLabel: "16 Nov 2026", website: { state: "not_checked", issues: [] } });
ok(m3.score.denominator === 6 && m3.score.answers === 6 && m3.score.overAll === true && m3.score.value === 0, "v3: 0 of 6 answers (every answer), never 0 of the 3 that kept a firm list");
const m2 = buildReportModel(rowsRead, { ...ctx3, rules: 2 }, { kind: "opportunity", businessName: "London Domestic Maintenance Ltd", town: "London", dateLabel: "16 Nov 2026", website: { state: "not_checked", issues: [] } });
ok(m2.score.denominator === 3 && !m2.score.overAll, "v2 keeps its old denominator (a sent link keeps its page)");
const html3 = renderReport(m3);
ok(/AI named you in 0 of 6 answers\./.test(html3) && !/answers that named a business named you/.test(html3), "the v3 page words it over every answer");

/* ── The four groups and the summary line ─────────────────────────────────────────────────────── */
const sp = verdictSplitOf([{ verdict: vl }, { verdict: vc }, { verdict: vn }, { verdict: unread }, { verdict: V(six((e) => A(e, ["X"], { you: "named" }))) }]);
ok(!!sp && sp.named === 1 && sp.winnable === 1 && sp.notWinnable === 1 && sp.noNames === 1 && sp.unmeasured === 1, "split: named 1, winnable 1, not winnable 1, AI doesn't name 1, couldn't measure 1");
ok(splitLine(sp!) === "Already named 1 · Winnable 1 · Not winnable 1 · AI doesn't name businesses 1", "the client summary line (Paul's words)");
ok(splitLine({ named: 1, winnable: 2, notWinnable: 3 }) === "Already named 1 · Winnable 2 · Not winnable 3", "a v2 report keeps its three-group line");

/* ── Audit incomplete ─────────────────────────────────────────────────────────────────────────── */
ok(!auditCompleteness([{ answers: 6, unmeasured: 0 }, { answers: 5, unmeasured: 1 }]).incomplete, "1 of 12 unmeasured (8%): complete");
ok(auditCompleteness([{ answers: 6, unmeasured: 0 }, { answers: 4, unmeasured: 2 }]).incomplete, "2 of 12 unmeasured (17%): Audit incomplete");
const allUnread: OppRow[] = rowsUnread.map((r) => ({ ...r, result: { chatgpt: { ...(r.result!.chatgpt as object) }, gemini: { ...(r.result!.gemini as object), firms_read: undefined } } }));
const mi = buildReportModel(allUnread, ctx3, { kind: "opportunity", businessName: "London Domestic Maintenance Ltd", town: "London", dateLabel: "16 Nov 2026", website: { state: "not_checked", issues: [] } });
ok(mi.incomplete?.unmeasured === 6 && mi.incomplete.answers === 6, "nothing read: the model is incomplete (6 of 6)");
const noCss = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/g, "");
const hi = noCss(renderReport(mi));
ok(/Audit incomplete/.test(hi) && !/rp-big-n/.test(hi) && !/Winnable/.test(hi) && !/rp-split/.test(hi) && !/%/.test(hi), "the incomplete page shows no score, no groups, no Winnable");
const li = noCss(renderLeadfinderReport(mi)).replace(/^[\s\S]*?<body[^>]*>/, "");
ok(/Audit incomplete/.test(li) && !/lf-ring/.test(li) && !/\d%/.test(li), "the LeadFinderOS page too");
const mb = buildReportModel(allUnread, ctx3, { kind: "baseline", businessName: "London Domestic Maintenance Ltd", town: "London", dateLabel: "16 Nov 2026", website: { state: "not_checked", issues: [] } });
ok(mb.incomplete === null, "a baseline's numbers never come from the firm lists, so it is never gated by them");

/* ── Which rules: v3 from its date, or a copy stamped 3; the guarantee ruler is unchanged ─────── */
ok(auditRulesFor({ createdAt: new Date(Date.parse(AUDIT_RULES_V3_FROM) + 1000).toISOString() }) >= 3, "an audit made after v3's start uses v3 or later (v4 took v3's start time, 2026-11-16)");
ok(auditRulesFor({ createdAt: new Date(Date.parse(AUDIT_RULES_V3_FROM) - 1000).toISOString() }) === 2, "the 16 Nov London Discovery (made before v3) keeps v2 on its own link");
ok(auditRulesFor({ createdAt: "2026-11-11T09:33:15Z", runRules: [3, null] }) === 3, "a re-scored copy stamped report_rules 3 uses v3");
ok(Date.parse(AUDIT_RULES_V3_FROM) > Date.parse(AUDIT_RULES_V2_FROM), "v3 starts after v2");
ok(guaranteeIdentityFor(new Date(Date.parse(AUDIT_RULES_V3_FROM) + 1000).toISOString(), "Moments Wedding Content", "momentsweddingcontent.com")?.name === "Moments Wedding Content", "a baseline made on v3 keeps the strict guarantee ruler (it did not fall back to the old one)");

/* ── The alerts ───────────────────────────────────────────────────────────────────────────────── */
ok(providerRefusal('batch 1: openai_http_429: {"error": {"message": "You have no credits remaining. Add credits"')?.provider === "OpenAI", "the 16 Nov OpenAI refusal is recognised");
ok(providerRefusal("Apify start apify~google-search-scraper HTTP 402")?.provider === "Apify" && /402/.test(providerRefusal("Apify start apify~google-search-scraper HTTP 402")!.why), "the Apify out-of-credit refusal");
ok(providerRefusal("Apify start apify~google-search-scraper HTTP 403")?.provider === "Apify", "the Apify limit refusal");
ok(providerRefusal("The signal has been aborted") === null && providerRefusal("model omitted 3 of 24 ids") === null && providerRefusal("openai_http_429: Rate limit reached for requests") === null, "an ordinary failure or a plain rate limit is not a credit refusal");
ok(refusalsIn(["Apify start x HTTP 402", "Apify start y HTTP 402", "no credits remaining"]).length === 2, "one refusal per provider");
const rowsQ = [
  { status: "done", result: { chatgpt: { answer_text: "x", firms_read: true }, gemini: { answer_text: "y", firms_read: true } } },
  { status: "done", result: { chatgpt: { answer_text: "x" }, gemini: { answer_text: "y", firms_read: true } } },
  { status: "failed", result: { error: "Apify start x HTTP 402" } },
  { status: "pending", result: null },
];
const u = unmeasuredAnswers(rowsQ);
ok(u.answers === 6 && u.unread === 1 && u.failed === 2 && u.unmeasured === 3 && isIncomplete(u), "the finaliser's count: 3 of 6 settled answers unmeasured (pending rows not judged) = incomplete");
const al = incompleteAlert({ businessName: "London Domestic Maintenance Ltd", shortCode: "qs44zg", auditId: "a1", ...u, refusals: refusalsIn(["no credits remaining"]) });
ok(al.dedupeKey === "audit_incomplete:a1" && /OpenAI refused/.test(al.body) && al.link.startsWith("/"), "one alert per audit, saying why, linking inside the app");
const pa = providerAlert({ provider: "OpenAI", why: "OpenAI refused: no credit left on the account", where: "x", dayIso: "2026-11-16T07:00:00Z" });
ok(pa.dedupeKey === "provider_refused:openai:2026-11-16", "one provider alert per provider per day");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
