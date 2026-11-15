/* Audit verdict rules v2 (Paul, 2026-11-15; docs/AUDIT_RULES.md): the strict name match, the six rules in order, the
   rules switch (old links keep the old rule), and the real cases that started it (Moments: Mayo / Westport / iPhone Mayo). */
import { checkName } from "../src/lib/strictName.ts";
import { auditRulesFor, AUDIT_RULES_V2_FROM, clientLineOf, decideVerdict, emptyWhyOf, otherTrade, unnaturalReason, type AnswerFacts } from "../src/lib/auditVerdict.ts";
import { firmKey, oppQuestion, type OppContext, type OppRow } from "../src/lib/reportOpportunity.ts";
import { winnableOf, winnableWhy } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── Strict name match ─────────────────────────────────────────────────────────────────────── */
const MWC = { name: "Moments Wedding Content", domains: ["https://momentsweddingcontent.com"] };
const cell = (answer_text: string, citations: string[] = []) => ({ answer_text, citations: citations.map((url) => ({ url })) });
ok(checkName(cell("1\\. Moments Wedding Content\n\n5.0 rating · Based in County Mayo"), MWC).match === "named", "exact name in a numbered list counts");
ok(checkName(cell("* **Moments Wedding Content** (Co. Mayo) – packages from €790"), MWC).match === "named", "exact name in bold counts");
ok(checkName(cell("See [their site](https://momentsweddingcontent.com/?utm_source=chatgpt.com) for packages"), MWC).how === "domain", "the website domain counts");
ok(checkName(cell("Some text with no name", ["https://www.momentsweddingcontent.com/packages"]), MWC).how === "domain", "a cited source on the domain counts");
const mc = checkName(cell("1\\. MC Moments Wedding Content\n\nBased in Kildare"), MWC);
ok(mc.match === "near" && mc.near[0] === "MC Moments Wedding Content", "an extra word before the name = near-name, flagged, NOT counted");
ok(checkName(cell("Try Moments Wedding Content Studio for reels"), MWC).match === "near", "an extra business word after the name = near-name");
ok(checkName(cell("**MC Moments Wedding Content** in Kildare, and Moments Wedding Content in Mayo"), MWC).match === "named", "a clean match anywhere wins over a near-name");
ok(checkName(cell("candid moments, wedding content and reels"), MWC).match === "no", "common words in prose never count");
ok(checkName(cell("Moments is great"), { name: "Moments" }).match === "no", "a one-word name never counts by text alone");
ok(checkName(cell("Visit momentsweddingcontent.com"), { name: "Moments", domains: ["momentsweddingcontent.com"] }).match === "named", "a one-word name still counts by its domain");
const LDM = { name: "London Domestic Maintenance Ltd", domains: ["londondomesticmaintenance.com"] };
ok(checkName(cell("For london domestic maintenance, try a local firm."), LDM).match === "no", "a trade-and-town name in lower case is not the business");
ok(checkName(cell("3. London Domestic Maintenance Ltd - East London"), LDM).match === "named", "the name with Ltd counts");
ok(checkName(cell("London Domestic Maintenance Services are listed"), LDM).match === "near", "the name with another business word after it is a near-name");
const home = { ...MWC, home: "Mayo", reviews: 28 };
ok(checkName(cell("1. Moments Wedding Content\nBased in Kildare, 5.0 (28 reviews)"), home).match === "near", "a different home town = near-name (when the home is known)");
ok(checkName(cell("1. Moments Wedding Content\nBased in Co. Mayo, 5.0 (12 reviews)"), home).match === "near", "a different review count = near-name (when the count is known)");
ok(checkName(cell("1. Moments Wedding Content\nBased in County Mayo, 5.0 (28 reviews)"), home).match === "named", "the same town and count counts");
ok(checkName(cell("Moments Wedding Content", ["https://maps.google.com/?cid=1&place_id=ChIJabcdef12345"]), { name: "X Y", placeIds: ["ChIJabcdef12345"] }).how === "profile", "the Google profile counts");

/* ── The rules, in order ───────────────────────────────────────────────────────────────────── */
const A = (engine: "chatgpt" | "gemini", firms: string[], o: Partial<AnswerFacts> = {}): AnswerFacts => ({ engine, failed: false, you: "no", near: [], firms, dirs: [], wrongPlace: false, text: "Here are some ideas for you to consider when choosing.", ...o });
const six = (fn: (e: "chatgpt" | "gemini", i: number) => AnswerFacts) => [0, 1, 2].flatMap((i) => [fn("chatgpt", i), fn("gemini", i)]);
const S = (answers: AnswerFacts[], o: Partial<Parameters<typeof decideVerdict>[0]> = {}) => decideVerdict({ question: "wedding content creator in Mayo", answers, head: "wedding content creator", leftOut: null, area: "Mayo", key: firmKey, ...o });

const owned = six((e) => A(e, ["Aisle Be There", "SocialWeds"]));
ok(S(owned).rule === "hard" && S(owned).verdict === "not_winnable" && S(owned).strongFirm?.name === "Aisle Be There", "rule 2: one firm in 6/6 = Hard: strong competitor, Not winnable, firm stored");
const ownedButNamed = six((e, i) => A(e, ["Aisle Be There"], { you: i === 0 && e === "gemini" ? "named" : "no" }));
const v1 = S(ownedButNamed);
ok(v1.rule === "visible" && v1.verdict === "winnable" && v1.label === "Already visible: 1 of 6", "rule 1 beats rule 2: named once = Winnable, \"Already visible: 1 of 6\"");
ok(v1.perEngine.gemini.named === 1 && v1.perEngine.chatgpt.named === 0, "ChatGPT and Gemini are counted separately");
ok(S(six((e, i) => A(e, i < 2 || e === "chatgpt" ? ["Toast"] : ["Other"]))).rule === "hard", "5 of 6 is Hard");
const four = S(six((e, i) => A(e, i < 2 ? ["Toast", `F${i}${e}`] : [`G${i}${e}`])));
ok(four.rule === "open" && four.verdict === "winnable" && four.toBeat[0]?.name === "Toast" && four.label === "A few repeat", "rule 3: a firm in 4/6 = Winnable, stored as a firm to beat");
const rotating = S(six((e, i) => A(e, [`F${i}${e}`, `H${i}${e}`])));
ok(rotating.rule === "open" && rotating.label === "Names change" && rotating.toBeat.length === 0, "rule 3: names change");
const empty = S(six((e, i) => A(e, i === 0 && e === "chatgpt" ? ["Lone Firm"] : [], { text: "I don't have a list of specific businesses in that area." })));
ok(empty.rule === "no_leader" && empty.verdict === "winnable" && empty.emptyWhy === "doesn't know anyone", "rule 4: nobody named in most answers on both engines = No clear leader, why stored");
ok(emptyWhyOf("I can't recommend specific businesses, but here is how to choose.") === "refused" && emptyWhyOf("Look for reviews and ask for samples.") === "general advice", "rule 4 reasons: refused / general advice");
const oneEngine = S(six((e, i) => A(e, e === "chatgpt" ? [`F${i}`] : [])));
ok(oneEngine.rule === "open", "only ONE engine mostly empty is not rule 4 (no engines-disagree logic)");
const dirs = S(six((e) => A(e, [], { dirs: ["weddingsonline", "Checkatrade"] })));
ok(dirs.rule === "directory_gap" && dirs.verdict === "winnable" && dirs.directories.includes("weddingsonline"), "rule 5: only directories named = Directory gap, listed");
const cat = S(six((e, i) => A(e, [`Snap ${i} Photography`, `Lens ${i}${e} Photography`])));
ok(cat.rule === "category_gap" && cat.verdict === "winnable", "rule 6: only another trade named = Category gap");
const loc = S(six((e) => A(e, e === "gemini" ? ["Stratford-upon-Avon Plumbing"] : [], { wrongPlace: e === "gemini", text: "x" })).map((a) => a), { question: "plumber in Stratford", head: "plumber", area: "Stratford" });
ok(loc.rule === "local_gap" || loc.rule === "no_leader", "rule 6: Gemini answering for another place is never scored as a firm there");
const loc2 = S([...six((e) => A(e, [], { dirs: [] }))].map((a) => a.engine === "gemini" ? { ...a, wrongPlace: true, firms: ["Avon Plumbers"] } : { ...a, firms: [] }).map((a, i) => (a.engine === "chatgpt" && i < 2 ? { ...a, dirs: ["Checkatrade"] } : a)), { question: "plumber in Stratford", head: "plumber", area: "Stratford" });
ok(loc2.rule !== "hard" && loc2.verdict === "winnable", "a wrong-place firm can never make a search Hard");
ok(S(six((e, i) => A(e, ["Toast"], { failed: i === 2 && e === "gemini" }))).rule === "rerun" && S(six((e, i) => A(e, ["Toast"], { failed: i === 2 && e === "gemini" }))).verdict === null, "a failed answer = re-run, never a verdict");
ok(S(owned, { question: "wedding content creator Ireland" }).rule === "unnatural" && S(owned, { question: "wedding content creator Ireland" }).verdict === null, "an unnatural question is flagged, not scored");
ok(unnaturalReason("EICR certificate in East London") === null && unnaturalReason("who is the best property maintenance company in London") === null && unnaturalReason("plumber plumber in Bow") !== null, "natural searches are not flagged");
ok(S(rotating.toBeat.length ? owned : six((e, i) => A(e, [`F${i}${e}`])), { leftOut: "not_on_site" }).verdict === null, "a service not on their site is left out (after rule 1)");
ok(S(ownedButNamed, { leftOut: "not_on_site" }).rule === "visible", "rule 1 beats left out");
ok(otherTrade("Gary Collins Photography", "wedding content creator") && !otherTrade("Aisle Be There", "wedding content creator") && !otherTrade("Reel Content Studio", "wedding content creator"), "other trade only when the firm's name says so");
for (const v of [v1, four, rotating, empty, dirs, cat]) ok(!/\d/.test(clientLineOf(v)) && !/Toast|Aisle|weddingsonline|Photography/.test(clientLineOf(v)), `client line has no counts or names (${v.rule})`);
ok(S(owned).label.startsWith("Hard") && S(owned).reason.includes("6 of 6"), "every Not winnable stores a reason with its evidence");

/* ── No big-city cap ───────────────────────────────────────────────────────────────────────── */
const big = S(six((e, i) => A(e, [`F${i}${e}`, `G${i}${e}`])), { question: "best plumber in London", head: "plumber", area: "London" });
ok(big.verdict === "winnable", "a whole big-city search with rotating names is Winnable (cap removed)");

/* ── Which rules: old links keep the old rule ──────────────────────────────────────────────── */
ok(auditRulesFor({ createdAt: "2026-11-11T09:33:15Z" }) === 1, "an audit before v2 keeps the old rule (its link shows the page it showed)");
ok(auditRulesFor({ createdAt: "2026-11-11T09:33:15Z", runRules: [null, 2] }) === 2, "a re-scored copy (a run with report_rules 2) uses v2");
ok(auditRulesFor({ createdAt: new Date(Date.parse(AUDIT_RULES_V2_FROM) + 1000).toISOString() }) === 2, "an audit made after v2 shipped uses v2");
ok(auditRulesFor({ createdAt: null }) === 1, "no date = the old rule");

/* ── Through the real reader (oppQuestion) and the client words (reportDesign) ─────────────── */
const named = (t: string) => ({ answer_text: t, competitors: ["Aisle Be There", "SocialWeds"], citations: [] });
const ans = (t: string) => ({ chatgpt: named(t), gemini: named(t) });
const rows: OppRow[] = [0, 1, 2].map(() => ({ question: "wedding content creator in Mayo", result: ans("1. Moments Wedding Content\nBased in County Mayo.\n2. Aisle Be There\n3. SocialWeds") }));
const ctx: OppContext = { businessName: "Moments Wedding Content", services: [], rules: 2, identity: MWC };
const q2 = oppQuestion("wedding content creator in Mayo", rows, ctx);
ok(q2.verdict?.rule === "visible" && q2.verdict.label === "Already visible: 6 of 6" && winnableOf(q2) === "winnable", "THE BUG (Mayo, named 6/6, two firms in every answer): now Winnable, Already visible 6 of 6");
ok(winnableWhy(q2) === "AI already names you here.", "the client line for it");
const q1 = oppQuestion("wedding content creator in Mayo", rows, { ...ctx, rules: 1, identity: undefined, isNamed: (c) => !!c.self_named || /Moments Wedding Content/.test(String(c.answer_text)) });
ok(!q1.verdict && winnableOf(q1) === "not_winnable", "the old rule is unchanged for old links (it said Not winnable)");
const kildare: OppRow[] = [0, 1, 2].map(() => ({ question: "wedding content creator in Kildare", result: { chatgpt: { answer_text: "1. MC Moments Wedding Content\nBased in Kildare\n2. Blackbird Studios", competitors: ["Blackbird Studios"], citations: [] }, gemini: { answer_text: "* **Mc Moments Wedding Content:** Kildare-based", competitors: [], citations: [] } } }));
const qk = oppQuestion("wedding content creator in Kildare", kildare, ctx);
ok(qk.namedYou === 0 && qk.verdict?.rule === "hard" && /MC Moments/i.test(qk.verdict.strongFirm?.name ?? "") && qk.verdict.nearNames.length > 0, "Kildare: MC Moments is another business — not counted, flagged, and it is the strong competitor");
const failedRows: OppRow[] = [...rows.slice(0, 2), { question: "wedding content creator in Mayo", result: null }];
ok(oppQuestion("wedding content creator in Mayo", failedRows, ctx).verdict?.rule === "rerun", "a failed queue row makes the search re-run, never a verdict");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
