/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   cleanBusinessName + initial_contact_short (2026-10-15).

   Pins: every rule of the cleaner on made-up names; "when unsure keep"; never empty; idempotent; the
   stored name is never touched; the "clean" style belongs to initial_contact_short ONLY (the other
   templates render byte-identically to before); the template is registered in every place that
   matters, with ONE variable and the exact registered body.

   Run: npx tsx scripts/clean-business-name.test.ts
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import { cleanBusinessName as c } from "../src/lib/cleanBusinessName.ts";
import { CLEAN_NAME_TEMPLATES, IDENTIFY_NAME_TEMPLATES, displayBusinessName, nameStyleFor } from "../src/lib/displayName.ts";
import { INITIAL_OPENERS, WHATSAPP_OPENERS, isInitialOpener, openerApproved } from "../src/lib/openerVariant.ts";
import { READABLE_TEMPLATE_BODIES } from "../src/lib/templateBodies.ts";
import { WA_TEMPLATE_REQS } from "../src/lib/whatsappTemplates.ts";
import { WHATSAPP_TEMPLATES } from "../src/types/outreach.ts";
import { isColdOutreachTemplate } from "../src/lib/coldOutreach.ts";

let f = 0;
const ok = (cond: boolean, l: string) => { if (!cond) f++; console.log(`${cond ? "PASS" : "FAIL"} ${l}`); };
const is = (input: string, want: string) => { const got = c(input); ok(got === want, `${JSON.stringify(input)} → ${JSON.stringify(got)}${got === want ? "" : `  (wanted ${JSON.stringify(want)})`}`); };

console.log("── lowercase + legal words at the end ──");
is("Angela's Beauty Salon Ltd", "angela's beauty salon");
is("Smith & Sons Plumbing Limited", "smith & sons plumbing");
is("Zed Tuition LLP", "zed tuition");
is("Bright Path LLC", "bright path");
is("North Star PLC", "north star");
is("Oak Learning Inc", "oak learning");
is("Oak Learning Inc.", "oak learning");
is("Maple Academy Incorporated", "maple academy");
is("Maple Academy Corp", "maple academy");
is("ABC Learning Centre Sdn Bhd", "abc learning centre");
is("ABC Learning Centre Sdn. Bhd.", "abc learning centre");
is("Little Stars Pte Ltd", "little stars");
is("Little Stars Pte. Ltd.", "little stars");
is("Kangaroo Kids Pty Ltd", "kangaroo kids");
is("Muller Sprachschule GmbH", "muller sprachschule");
is("Delta Bhd", "delta");
is("MULTIPLE   SPACES   LTD.", "multiple spaces");

console.log("\n── ⛔ \"co\" IS NEVER REMOVED, and legal words are only removed from the END ──");
is("Rapid Co", "rapid co");
is("Rapid & Co Ltd", "rapid & co");
is("Mc-Donald's Co., Ltd", "mc-donald's co");
is("Limited Edition Prints", "limited edition prints");
is("Corp Training Hub", "corp training hub");
is("Limited", "limited");

console.log("\n── emojis, marks, quotes, stray punctuation ──");
is("Café Nero ™", "café nero");
is("Star Kids ® Learning ©", "star kids learning");
is("Happy Tots 🌟🌟 Preschool 😀", "happy tots preschool");
is("\"The Learning Place\"", "the learning place");
is("“Bright Sparks” Academy", "bright sparks academy");
is("'Quoted' Name", "quoted name");
is("Angela’s Place", "angela's place");
is("Dr. Smith's Clinic!!!", "dr smith's clinic");
is("*** Stars ***", "stars");
is("Tom & Jerry", "tom & jerry");

console.log("\n── taglines and sales fluff after a separator ──");
is("Kuching Language School | Since 1998", "kuching language school");
is("Hope Academy — Official Site", "hope academy");
is("TOP Tuition: Trusted & Affordable", "top tuition");
is("Bright Minds - Best Tuition Centre No.1 in Kuching", "bright minds");
is("Bright Minds | #1 Tuition Centre", "bright minds");
is("Bright Minds – Leading Provider of Quality Education", "bright minds");
is("Smith Plumbing - Plumber in Leeds", "smith plumbing");
is("Best Plumber in Leeds | Smith Plumbing", "smith plumbing");
is("Smith Plumbing | 24/7 Emergency Callout", "smith plumbing");
is("Smith Plumbing - Free Quote", "smith plumbing");
is("Nice Education Sdn Bhd / 优品教培中心", "nice education 优品教培中心");   // a spaced slash is a separator
is("Kids Club 24/7", "kids club 24/7");                                 // an unspaced slash is not

console.log("\n── a branch or location is KEPT ──");
is("Zest Electrical - Leeds Branch", "zest electrical leeds branch");
is("Joe's Pizza - Kuala Lumpur", "joe's pizza kuala lumpur");
is("Little Stars | Penang", "little stars penang");
is("Premier Tuition | Learning Centre", "premier tuition learning centre");   // unsure → keep; a head with marketing words is a NAME

console.log("\n── brackets ──");
is("Bright Minds (CLC) Sdn. Bhd.", "bright minds");
is("Global English (IEC)", "global english");
is("Wisdom Tuition Centre (Sibu)", "wisdom tuition centre sibu");
is("Wisdom Tuition Centre [Kuching]", "wisdom tuition centre kuching");
is("Acme (Pty) Ltd", "acme");
is("Language Hub (Best Price)", "language hub");
is("Smith (Branch 2)", "smith branch 2");              // unsure → keep the word, drop the brackets

console.log("\n── location words that are part of the name stay ──");
is("Leeds Plumbing Services", "leeds plumbing services");
is("Kuala Lumpur English Centre", "kuala lumpur english centre");
is("Singapore Piano Studio Pte Ltd", "singapore piano studio");
is("Stoke-on-Trent Tutors", "stoke-on-trent tutors");

console.log("\n── when unsure, keep; never empty ──");
is("X", "x");
is("A1", "a1");
is("🚀🚀", "🚀🚀");                                      // nothing left → the original, lowercased
is("Ltd.", "ltd");
is("  ", "");
ok(c(null) === "" && c(undefined) === "", "null / undefined → empty string");
for (const n of ["Smith Ltd", "Hope | Official", "(CLC)", "™", "Best - Top - Leading", "A | B | C", "Co", "Bhd"]) {
  ok(c(n).length > 0, `${JSON.stringify(n)} never cleans to nothing (got ${JSON.stringify(c(n))})`);
}

console.log("\n── idempotent and never longer ──");
for (const n of [
  "Angela's Beauty Salon Ltd", "Zest Electrical - Leeds Branch", "Bright Minds (CLC) Sdn. Bhd.", "Smith Plumbing - Plumber in Leeds",
  "Little Stars Pte Ltd", "Café Nero ™", "Wisdom Tuition Centre (Sibu)",
]) {
  const once = c(n);
  ok(c(once) === once, `${JSON.stringify(n)}: cleaning twice changes nothing`);
  ok(once.length <= n.length, `${JSON.stringify(n)}: never longer than the original`);
}

console.log("\n── the style is shared but opt-in: ONLY initial_contact_short ──");
ok(CLEAN_NAME_TEMPLATES.has("initial_contact_short") && CLEAN_NAME_TEMPLATES.size === 1, "CLEAN_NAME_TEMPLATES = initial_contact_short only");
ok(nameStyleFor("initial_contact_short") === "clean", "initial_contact_short → clean");
ok(nameStyleFor("initial_contact") === "identify", "initial_contact stays identify (untouched)");
ok(nameStyleFor("book_call") === "greet" && nameStyleFor(undefined) === "greet" && nameStyleFor("") === "greet", "every other template and no template → greet");
ok(IDENTIFY_NAME_TEMPLATES.has("initial_contact") && !IDENTIFY_NAME_TEMPLATES.has("initial_contact_short"), "IDENTIFY set unchanged");
ok(displayBusinessName("Angela's Beauty Salon Ltd", { style: "clean" }) === "angela's beauty salon", "displayBusinessName reads the clean style");
ok(displayBusinessName("Angela's Beauty Salon Ltd") === "Angela's Beauty Salon", "default (greet) output is unchanged");
ok(displayBusinessName("Zest Electrical Services Ltd", { style: "identify", town: "" }) !== displayBusinessName("Zest Electrical Services Ltd", { style: "clean" }), "identify and clean are different styles");

console.log("\n── initial_contact_short is registered like the other openers ──");
ok(isInitialOpener("initial_contact_short") && WHATSAPP_OPENERS.includes("initial_contact_short" as never) && !INITIAL_OPENERS.includes("initial_contact_short" as never), "it is a WhatsApp opener (the opener guards, the bulk picker) and is not on the SMS list");
ok(openerApproved("initial_contact_short") === true, "the picker offers it (Meta's live status gates the send, server-side)");
ok(WHATSAPP_TEMPLATES.some((t) => t.value === "initial_contact_short"), "it is in WHATSAPP_TEMPLATES");
ok(WA_TEMPLATE_REQS.initial_contact_short?.group === "opener" && !WA_TEMPLATE_REQS.initial_contact_short.needsUrl && !WA_TEMPLATE_REQS.initial_contact_short.needsAudit, "opener, no link, no audit");
ok(isColdOutreachTemplate("initial_contact_short") === true, "it is COLD (the phone-history seatbelt applies)");
ok(READABLE_TEMPLATE_BODIES.initial_contact_short?.("angela's beauty salon", "") === "Hey, is this angela's beauty salon?\nThanks", "the transcript body is exactly: Hey, is this {{1}}? / Thanks");
ok(READABLE_TEMPLATE_BODIES.initial_contact?.("Zest", "")?.startsWith("Hi, is this Zest?"), "initial_contact's body is untouched");

const read = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const SEND = read("supabase/functions/_shared/whatsapp-send.ts");
const QUEUE = read("supabase/functions/process-whatsapp-queue/index.ts");
const SWM = read("supabase/functions/send-whatsapp-message/index.ts");
ok(/initial_contact_short:\s*\{\s*lang:\s*"en",\s*vars:\s*\["name"\]\s*\}/.test(SEND), "WA_TEMPLATES: one variable, name");
ok(/initial_contact_short:\s*\{\s*lang:\s*"en",\s*vars:\s*\["name"\]\s*\}/.test(QUEUE), "the queue mirror: one variable, name");
ok(/initial_contact_short:\s*initialContactShortBody/.test(SEND), "the sender renders its body");
ok(/Hey, is this \$\{b \|\| "your business"\}\?\nThanks`/.test(SEND), "the registered body, byte for byte (sender)");
ok(/TEMPLATES_NEEDING_REAL_NAME = new Set\(\[[^\]]*"initial_contact_short"/.test(SEND), "a nameless lead is refused, not sent 'your business'");
ok(/META_STATUS_GATED[^\n]*"initial_contact_short"/.test(QUEUE), "the drip reads Meta's live status first");
ok(/templateName === "initial_contact_short"[\s\S]{0,400}templateAvailability/.test(SWM), "the Inbox sender reads Meta's live status first");
ok(!/openerSendability|initial_opener_template/.test(read("src/lib/cleanBusinessName.ts")), "the cleaner reads no setting");
ok(/nameStyleFor\(templateName\)/.test(SEND) && /nameStyleFor\(extra\?\.templateName\)/.test(SEND), "the sender's two name sites read nameStyleFor");
const mig = read("supabase/migrations/20261030090000_initial_contact_short.sql");
ok(/'initial_contact', 'initial_opener_v2', 'initial_contact_short', 'ai_visibility_report_offer'/.test(mig), "sales_queue_opener accepts it");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
