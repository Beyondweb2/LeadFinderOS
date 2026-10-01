/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SOCIAL PROFILES (2026-09-30, docs/social-profiles.md): the one normalising + grading rule, against a
   sample drawn from what our crawls REALLY stored (lead_crawl_checks.siteInfo.socialLinks) and the
   malformed links the old Enrich saved; plus the SQL pick, the wiring and the contact channels.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  normaliseSocialUrl, extractSocialLinksFromHtml, handleMatchesBusiness, gradeSocialCandidates, textMentionsTown,
  socialOutcomes, socialOutcomeSentence, websiteLabel, SOCIAL_REJECT_TEXT,
} from "../src/lib/socialProfiles.ts";
import { CONTACT_METHODS, LOGGED_CONTACT_METHODS } from "../src/lib/contactMethods.ts";
import { CALL_OUTCOMES, outcomesFor } from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const norm = (u: string) => { const n = normaliseSocialUrl(u); return n.ok ? `${n.platform} ${n.url}` : `REJECT ${n.reason}`; };

console.log("\n── normalising: real links from our crawls ──");
const cases: Array<[string, string]> = [
  ["https://www.facebook.com/UmbrellaPlumbingandHeating", "facebook https://www.facebook.com/UmbrellaPlumbingandHeating"],
  ["https://m.facebook.com/Pass-With-Alison-117283732994426/", "facebook https://www.facebook.com/Pass-With-Alison-117283732994426"],
  ["https://en-gb.facebook.com/firebeardelec/posts/12345?ref=page", "facebook https://www.facebook.com/firebeardelec"],
  ["https://www.facebook.com/profile.php?id=61557061373834", "facebook https://www.facebook.com/profile.php?id=61557061373834"],
  ["https://www.facebook.com/profile.php", "REJECT no_profile"],
  ["https://www.facebook.com/.../HairSalon", "REJECT truncated"],
  ["https://www.facebook.com/...", "REJECT truncated"],
  ["https://www.facebook.com/…/BarberShop", "REJECT truncated"],
  ["https://www.facebook.com/sharer/sharer.php?u=https://x.co.uk", "REJECT share_link"],
  ["https://www.facebook.com/groups/12345", "REJECT content_link"],
  ["https://www.facebook.com/wix", "REJECT platform_account"],
  ["https://www.facebook.com/pages/Magic-Hands/123456789/about", "facebook https://www.facebook.com/pages/Magic-Hands/123456789"],
  ["https://www.instagram.com/a2carkeys/", "instagram https://www.instagram.com/a2carkeys"],
  ["https://instagram.com/rushelectrics", "instagram https://www.instagram.com/rushelectrics"],
  ["https://www.instagram.com/wix", "REJECT platform_account"],
  ["https://www.instagram.com/p/Cxyz123/", "REJECT content_link"],
  ["https://www.linkedin.com/company/cherry-hinton-accounting/", "linkedin_company https://www.linkedin.com/company/cherry-hinton-accounting"],
  ["https://uk.linkedin.com/company/arnold-lockhart-electrical-ltd", "linkedin_company https://www.linkedin.com/company/arnold-lockhart-electrical-ltd"],
  ["https://www.linkedin.com/company/19343335/admin/", "REJECT admin_link"],
  ["http://www.linkedin.com/in/tim-ramsell", "linkedin_person https://www.linkedin.com/in/tim-ramsell"],
  ["https://www.linkedin.com/in/linkedinforreplacement", "REJECT placeholder"],
  ["https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fwww.lessonswithruth.co.uk%2F", "REJECT share_link"],
  ["https://twitter.com", "REJECT no_profile"],
  ["//twitter.com/gparkelectrical", "x https://x.com/gparkelectrical"],
  ["https://twitter.com/Wix", "REJECT platform_account"],
  ["https://twitter.com/intent/tweet?text=hi", "REJECT share_link"],
  ["https://youtube.com", "REJECT no_profile"],
  ["https://www.youtube.com/watch?v=ckHzmP1evNU", "REJECT content_link"],
  ["https://youtu.be/6BxQr4k8n8M", "REJECT content_link"],
  ["https://www.youtube.com/@SKBoilersandHeatingLtd", "youtube https://www.youtube.com/@SKBoilersandHeatingLtd"],
  ["https://youtube.com/channel/UC3tiuJt7GnA3ZtF9ige_TAg", "youtube https://www.youtube.com/channel/UC3tiuJt7GnA3ZtF9ige_TAg"],
  ["https://www.tiktok.com/@rkjautomaticdriving?is_from_webapp=1&sender_device=pc", "tiktok https://www.tiktok.com/@rkjautomaticdriving"],
  ["https://www.tiktok.com/@a2carkeys/video/123", "REJECT content_link"],
  ["https://www.checkatrade.com/trades/acme", "REJECT not_social"],
  ["not a link at all", "REJECT unparseable"],
  ["", "REJECT empty"],
  // regional / international hosts
  ["https://www.facebook.com/SydneyPlumbingPtyLtd/", "facebook https://www.facebook.com/SydneyPlumbingPtyLtd"],
  ["https://au.linkedin.com/company/sydney-plumbing-pty-ltd", "linkedin_company https://www.linkedin.com/company/sydney-plumbing-pty-ltd"],
  ["https://www.linkedin.com/company/austin-roofing-llc/about/", "linkedin_company https://www.linkedin.com/company/austin-roofing-llc"],
];
for (const [inp, want] of cases) ok(norm(inp) === want, `${inp || "(empty)"} → ${want}${norm(inp) === want ? "" : `  (got ${norm(inp)})`}`);
ok(Object.keys(SOCIAL_REJECT_TEXT).length === 11, "every reject reason has plain words for the manual-add box");

console.log("\n── extracting from a page: anchors + schema sameAs, one per link ──");
const html = `<a href="https://www.facebook.com/bmelectricalsuk">fb</a><a href="https://www.facebook.com/bmelectricalsuk/">again</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://www.instagram.com/wix">builder</a>
<script type="application/ld+json">{"@type":"Electrician","sameAs":["https://www.linkedin.com/company/bmelectricalsuk","https://www.tiktok.com/@bmelectricalsuk"]}</script>`;
const ex = extractSocialLinksFromHtml(html);
ok(ex.length === 3, `3 profiles (fb once, share + builder dropped, linkedin + tiktok via sameAs) — got ${ex.map((e) => e.url).join(", ")}`);
ok(ex.find((e) => e.platform === "linkedin_company")?.via === "schema", "sameAs is recorded as the schema source");

console.log("\n── does the handle name the business? ──");
ok(handleMatchesBusiness("bmelectricalsuk", { name: "BM Electricals" }), "2-letter initialism starting the handle");
ok(handleMatchesBusiness("firebeardelec", { name: "Firebeard Electrical" }), "distinctive word inside the handle");
ok(handleMatchesBusiness("UmbrellaPlumbingandHeating", { name: "Umbrella Plumbing & Heating Ltd" }), "case and legal suffix ignored");
ok(!handleMatchesBusiness("thebestplumbers", { name: "Umbrella Plumbing" }), "a trade word alone never matches");
ok(!handleMatchesBusiness("61557061373834", { name: "Anything" }), "a numeric id can never match");
ok(handleMatchesBusiness("yeomanelec", { name: "S. Yeoman", website: "https://www.yeomanelec.co.uk" }), "the website's own label matches");
ok(websiteLabel("https://www.sydneyplumbing.com.au/contact") === "sydneyplumbing" && websiteLabel("https://austinroofing.com") === "austinroofing", "website label: com.au and .com");
ok(handleMatchesBusiness("austinroofingco", { name: "Austin Roofing LLC" }) && handleMatchesBusiness("sydneyplumbingptyltd", { name: "Sydney Plumbing Pty Ltd" }), "US LLC / AU Pty Ltd names match on the distinctive part");
ok(!handleMatchesBusiness("llc", { name: "Austin Roofing LLC" }), "a legal form alone is not a match");
ok(textMentionsTown("Acme Plumbing | Plumber in Leeds, West Yorkshire", "Leeds") && !textMentionsTown("Acme Plumbing Leedsbury", "Leeds"), "town match is whole words");
ok(textMentionsTown("Austin Roofing - Austin, TX", "Austin") && textMentionsTown("Plumber in Parramatta NSW 2150", "Parramatta"), "US / AU towns match without a postcode rule");

console.log("\n── grading: the sample ──");
const biz = { name: "Rush Electrics", website: "https://rushelectrics.co.uk", town: "Leeds" };
// 1. business with socials on its own website
let g = gradeSocialCandidates([{ url: "https://instagram.com/rushelectrics", source: "website" }], biz).graded;
ok(g.length === 1 && g[0].confidence === "confirmed", "own-site link, handle matches → confirmed");
// own-site link whose handle does not resemble the name
g = gradeSocialCandidates([{ url: "https://www.facebook.com/profile.php?id=61557061373834", source: "website" }], biz).graded;
ok(g[0].confidence === "likely", "own-site numeric profile (cannot match) → likely, never confirmed");
// 2. found only externally: needs name AND town
g = gradeSocialCandidates([{ url: "https://www.facebook.com/rushelectrics", source: "web_search", context: "Rush Electrics - Electrician in Leeds" }], biz).graded;
ok(g[0].confidence === "likely", "web search, name + town → likely");
g = gradeSocialCandidates([{ url: "https://www.facebook.com/rushelectrics", source: "web_search", context: "Rush Electrics - Electrician in Bristol" }], biz).graded;
ok(g[0].confidence === "unverified" && g[0].evidence.why === "the town does not match", "3. similar name in another town → unverified (the Birmingham-vs-Swindon case)");
g = gradeSocialCandidates([{ url: "https://www.facebook.com/leedssparks", source: "web_search", context: "Leeds Sparks electrician Leeds" }], biz).graded;
ok(g[0].confidence === "unverified", "a different business in the right town → unverified");
// competing profiles on the business's own site
g = gradeSocialCandidates([{ url: "https://www.facebook.com/rushelectrics", source: "website" }, { url: "https://www.facebook.com/webdesignbyjoe", source: "website" }], biz).graded;
ok(g.find((x) => x.handle === "rushelectrics")?.confidence === "confirmed" && g.find((x) => x.handle === "webdesignbyjoe")?.confidence === "unverified", "two on the site: the one naming the business wins, the other waits for review");
g = gradeSocialCandidates([{ url: "https://www.facebook.com/profile.php?id=11111111", source: "website" }, { url: "https://www.facebook.com/profile.php?id=22222222", source: "website" }], biz).graded;
ok(g.every((x) => x.confidence === "unverified" && x.evidence.competing), "two on the site and neither names it → both for review, never a guess");
// already on a different business
g = gradeSocialCandidates([{ url: "https://instagram.com/rushelectrics", source: "website" }], biz, { "https://www.instagram.com/rushelectrics": 1 }).graded;
ok(g[0].confidence === "unverified" && g[0].evidence.sharedWith === 1, "a link already on ANOTHER business → unverified, flagged");
g = gradeSocialCandidates([{ url: "https://instagram.com/rushelectrics", source: "manual" }], biz, { "https://www.instagram.com/rushelectrics": 1 }).graded;
ok(g[0].confidence === "confirmed", "…unless a person pasted it (their call)");
// schema sameAs, questionnaire, manual
ok(gradeSocialCandidates([{ url: "https://www.linkedin.com/company/rx-ltd", source: "website_schema" }], biz).graded[0].confidence === "confirmed", "sameAs → confirmed");
ok(gradeSocialCandidates([{ url: "https://www.tiktok.com/@anything1", source: "questionnaire" }], biz).graded[0].confidence === "confirmed", "questionnaire → confirmed");
// 4. no socials; builder / junk only
const r = gradeSocialCandidates([{ url: "https://www.instagram.com/wix", source: "website" }, { url: "https://twitter.com", source: "website" }], biz);
ok(r.graded.length === 0 && r.rejected.length === 2, "4. a site with only builder / bare links → nothing, both rejected with reasons");
// the false positives the 2026-09-30 backfill sample caught
ok(norm("https://twitter.com/DVLAgovuk") === "REJECT platform_account" && norm("https://x.com/bold_themes") === "REJECT platform_account", "a government account and a theme author are never the business");
ok(norm("https://www.facebook.com/govanplumbing").startsWith("facebook") && norm("https://www.instagram.com/themeparkcafe").startsWith("instagram"), "…but a name that merely starts with gov / theme is fine");
ok(gradeSocialCandidates([{ url: "https://www.youtube.com/@WittyChannelTV", source: "website" }], biz).graded[0].confidence === "unverified", "own-site YouTube / X / TikTok not naming the business → needs checking (a video embed, a stranger's channel)");
ok(gradeSocialCandidates([{ url: "https://www.facebook.com/937326503092188", source: "website" }], biz).graded[0].confidence === "likely", "own-site numeric Facebook page → likely (it cannot name anyone)");
ok(gradeSocialCandidates([{ url: "https://www.linkedin.com/in/tim-ramsell", source: "website" }], { name: "You're in Lock", website: "https://youreinlock.com" }).graded[0].confidence === "likely", "the owner's LinkedIn linked from their own site → likely (Sales confirms)");
ok(/ownSite \? \{ url, source: "website" \} : \{ url, source: "web_search"/.test(read("supabase/functions/_shared/social-find.ts")), "a crawl of a directory page is graded like a found result, never as their own site");
// dedupe: the same profile from two sources keeps the stronger
g = gradeSocialCandidates([{ url: "https://www.facebook.com/rushelectrics", source: "web_search", context: "nothing" }, { url: "https://m.facebook.com/rushelectrics/", source: "website" }], biz).graded;
ok(g.length === 1 && g[0].confidence === "confirmed" && g[0].source === "website", "one profile from two places → one row, the stronger grade");

console.log("\n── the Find summary line ──");
const rows = [
  { id: "1", platform: "facebook", url: "https://www.facebook.com/x1", confidence: "confirmed", source: "website", state: "active", is_canonical: true },
  { id: "2", platform: "linkedin_company", url: "https://www.linkedin.com/company/a", confidence: "unverified", source: "website", state: "active", is_canonical: false },
  { id: "3", platform: "linkedin_company", url: "https://www.linkedin.com/company/b", confidence: "unverified", source: "website", state: "active", is_canonical: false },
  { id: "4", platform: "instagram", url: "https://www.instagram.com/old", confidence: "likely", source: "legacy", state: "rejected", is_canonical: false },
];
const s = socialOutcomeSentence(socialOutcomes(rows));
ok(s === "Facebook confirmed · No Instagram found · LinkedIn uncertain — check below", `summary: ${s}`);
ok(socialOutcomes([{ ...rows[0], confidence: "likely" }])[0].state === "likely", "Likely stays Likely in the summary, never Confirmed");

console.log("\n── the SQL pick (one place) and the migration ──");
const mig = read("supabase/migrations/20260930140000_social_profiles.sql");
ok(/source = 'manual' or confirmed_by is not null/.test(mig), "a person's choice is picked first");
ok(/confidence = 'confirmed'[\s\S]*if v_n = 1[\s\S]*confidence = 'likely'[\s\S]*if v_n = 1/.test(mig), "then exactly one confirmed, then exactly one likely — two = review");
ok(!/confidence = 'unverified'/.test(mig.slice(mig.indexOf("_social_profiles_sync"), mig.indexOf("_social_profiles_after_change"))), "unverified is never picked");
ok(!/\bemail\b\s*=/.test(mig.replace(/--[^\n]*/g, "")), "the migration never writes an email");
ok(/pg_trigger_depth\(\) > 1/.test(mig), "the sync's own update does not recurse");
ok(/'malformed_legacy'/.test(mig) && /'rejected'/.test(mig) && /'original'/.test(mig), "legacy junk is kept as rejected rows with the original text (audit trail)");
ok(/for select to authenticated[\s\S]{0,120}my_sales_lead_ids/.test(mig) && /revoke insert, update, delete, truncate, references, trigger on public.lead_social_profiles from authenticated/.test(mig), "RLS: read own leads; writes service role only");

console.log("\n── contact channels: Facebook / Instagram / LinkedIn, one set ──");
const allow = (mig.match(/_channel not in \(([^)]+)\)/) ?? [])[1] ?? "";
const serverChannels = [...allow.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
ok(JSON.stringify(serverChannels) === JSON.stringify(LOGGED_CONTACT_METHODS.map((m) => m.value).sort()), "lead_log_contact's channels = LOGGED_CONTACT_METHODS exactly");
const outAllow = (mig.match(/_outcome not in \(([^)]+)\)/) ?? [])[1] ?? "";
const serverOutcomes = [...outAllow.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
ok(JSON.stringify(serverOutcomes) === JSON.stringify(CALL_OUTCOMES.map((o) => o.value).sort()), "lead_log_contact's outcomes = CALL_OUTCOMES exactly");
ok(["linkedin", "facebook", "instagram"].every((v) => CONTACT_METHODS.find((m) => m.value === v)?.social) && CONTACT_METHODS.filter((m) => m.primary).length + 1 <= 5, "LinkedIn, Facebook, Instagram sit under the one Social pill (still at most five pills)");
ok(outcomesFor("linkedin").some((o) => o.value === "connection_sent") && !outcomesFor("facebook").some((o) => o.value === "connection_sent") && !outcomesFor("call").some((o) => o.value === "connection_sent"), "Connection sent only for LinkedIn");
ok(outcomesFor("instagram").some((o) => o.value === "message_sent"), "Instagram DM → Message sent");

console.log("\n── wiring ──");
const fn = read("supabase/functions/social-profiles/index.ts");
ok(/resolveActor/.test(fn) && /leadAccess/.test(fn) && /guardAction/.test(fn), "social-profiles: role + lead access + the usage guard");
ok(!/\.from\(["']outreach_leads["']\)\.update/.test(fn), "social-profiles never updates the lead row itself (the SQL mirror does)");
ok(/\[functions\.social-profiles\]\s*\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml lists social-profiles");
const shared = read("supabase/functions/_shared/social-find.ts");
ok(!/linkedin\.com\/in|fetch\([^)]*linkedin/i.test(shared.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")), "nothing fetches LinkedIn");
ok(/state === ["']rejected["']/.test(shared) && /isStronger/.test(shared), "the upsert never re-activates a rejected row and never lowers a grade");
const enrich = read("supabase/functions/enrich-business/index.ts");
ok(/requireAdmin|role !== ["']admin["']/.test(enrich), "paid Enrich is admin-only");
ok(/coalesce\(btrim|email: null|!hasEmail|leadHasEmail/.test(enrich), "paid Enrich never overwrites an email");
ok(!/facebook_url:\s*/.test(enrich.slice(enrich.indexOf("Deno.serve"))), "paid Enrich writes socials only through the one save path");
ok(/SocialProfilesPanel lead=/.test(read("src/components/LeadDetailDialog.tsx")) && /SocialLinks/.test(read("src/pages/Inbox.tsx")) && /SocialLinks/.test(read("src/components/LeadDetailDialog.tsx")) && /SocialLinks/.test(read("src/components/OutreachTable.tsx")), "one Socials line on the popup, Outreach and Inbox + the review panel on the Prospect tab");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
