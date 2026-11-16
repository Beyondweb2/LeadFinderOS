/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LEADS WE CAN'T CALL (2026-11-16, Paul, v1-tps-templates-callable). ONE rule (src/lib/callRules.ts callableVerdict, built
   from pickCallNumber / browserCallMarket / browserCallAllowed) hides by default — never deletes — a lead whose only number
   is 09 premium, not valid, or in a country whose calling is off, on Find leads, Outreach and Open next ready. Freephone
   stays, sorted after mobile / landline. A lead with another callable number uses that one.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import path from "node:path";
import { callableVerdict, pickCallNumber, sortByCallable, CANNOT_CALL_REASONS } from "../src/lib/callRules.ts";
import { DEFAULT_COUNTRY_SETTINGS, countrySettingsFrom } from "../src/lib/outreachMarkets.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const OFF = DEFAULT_COUNTRY_SETTINGS;
const MY_ON = countrySettingsFrom([{ country: "MY", call_on: true } as never]);

console.log("── the verdict ──");
ok(callableVerdict("07700 900123", "UK", OFF).status === "callable", "UK mobile → callable");
ok(callableVerdict("0113 234 5678", "UK", OFF).status === "callable", "UK landline → callable");
ok(callableVerdict("0800 123 4567", "UK", OFF).status === "freephone", "0800 → freephone (shown, warned, sorted after)");
ok(callableVerdict("0345 123 4567", "UK", OFF).status === "freephone", "03 → freephone");
ok(callableVerdict("0909 123 4567", "UK", OFF).status === "cannot" && callableVerdict("0909 123 4567", "UK", OFF).reason === CANNOT_CALL_REASONS.premium, "09 only → can't call (premium)");
ok(callableVerdict("12345", "UK", OFF).status === "cannot", "not a valid number → can't call");
ok(callableVerdict("+1 212 555 0100", "USA", OFF).status === "cannot", "a country browser calling never covers → can't call");
ok(callableVerdict("+60 12-345 6789", "Malaysia", OFF).reason === CANNOT_CALL_REASONS.country, "Malaysia while its calling is off → can't call (country)");
ok(callableVerdict("+60 12-345 6789", "Malaysia", MY_ON).status === "callable", "…and callable once it is on");
ok(callableVerdict("+353 85 123 4567", "Ireland", OFF).status === "callable", "Ireland is always on");
ok(callableVerdict("", "UK", OFF).status === "no_phone" && callableVerdict(null, "UK", OFF).status === "no_phone", "no number at all → not hidden (Find leads looks it up later)");
ok(callableVerdict("0909 123 4567 / 07700 900123", "UK", OFF).status === "callable", "09 plus a mobile → callable (the mobile)");

console.log("\n── another callable number is used ──");
ok(pickCallNumber("+60 12-345 6789 / 0113 234 5678", "UK", OFF).digits === "441132345678", "MY mobile + UK landline, MY off → rings the landline");
ok(pickCallNumber("+60 12-345 6789 / 0113 234 5678", "UK", MY_ON).digits === "60123456789", "…MY on → the mobile first");
ok(pickCallNumber("+60 12-345 6789 / 0113 234 5678", "UK").digits === "60123456789", "no settings given → unchanged behaviour");

console.log("\n── sorted: callable, freephone, no number, can't call ──");
const xs = ["0909 123 4567", "0800 123 4567", "", "07700 900123", "0113 234 5678"];
ok(sortByCallable(xs, (p) => callableVerdict(p, "UK", OFF)).join("|") === "07700 900123|0113 234 5678|0800 123 4567||0909 123 4567", "stable partition");

console.log("\n── one rule, three places ──");
const rules = read("src/lib/callRules.ts");
const body = rules.slice(rules.indexOf("export function callableVerdict"), rules.indexOf("/** Sort key"));
ok(/pickCallNumber\(/.test(body) && !/ukNumberKind|IE_CALLABLE|\^44/.test(body), "callableVerdict reuses pickCallNumber (no second copy of the number rule)");
const lt = read("src/components/LeadsTable.tsx"), ot = read("src/components/OutreachTable.tsx");
ok(/callableVerdict\(l\.phone, l\.searchCountry, countrySettings\)/.test(lt) && /\(showCantCall \|\| !cantCall\(l\)\)/.test(lt) && /<CantCallLine count=\{cantCallCount\}/.test(lt), "Find leads hides them behind the line");
ok(/callableVerdict\(l\.phone, l\.country, countrySettings\)/.test(ot) && /if \(!showCantCall\) result = result\.filter\(\(lead\) => callOfLead\(lead\)\.status !== 'cannot'\);/.test(ot) && /<CantCallLine count=\{cantCallCount\}/.test(ot), "Outreach hides them behind the line");
ok(/return sortByCallable\(result, callOfLead\);/.test(ot), "Outreach sorts freephone after mobile / landline");
ok(/nextReadyLead<OutreachLead>\(callQueueLeads, rowCheck, nextOpened\)/.test(ot), "Open next ready never offers one, even while shown");
ok(/opacity-50 grayscale/.test(lt) && /opacity-50 grayscale/.test(ot) && /We can't call this lead: /.test(read("src/components/OutreachMobileCard.tsx")), "shown = greyed with the reason");
const line = read("src/components/CantCallLine.tsx");
ok(/Show \$\{count\} we can't call/.test(line), "the toggle reads \"Show N we can't call\"");
const token = read("supabase/functions/twilio-voice-token/index.ts");
ok(/const onPick = pickCallNumber\(lead\.phone as string, \(lead\.country as string \| null\) \?\? null, countrySettings\);/.test(token), "the server rings the same number the screen judged");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
