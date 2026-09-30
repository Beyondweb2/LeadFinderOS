/* Directory + public-profile presence (2026-09-30, docs/directory-presence.md).
 *
 * The rules under test: a name is never enough to confirm a listing; an inconsistency needs a
 * confirmed listing; nothing is "worth adding" without positive evidence; junk is never recommended;
 * a recheck updates one row per source and never downgrades on absence; the operator's word stands
 * until evidence moves it. Plus: the table's CHECK lists equal the module's constants.
 */
import { readFileSync } from "node:fs";
import {
  assemblePresence, buildIdentity, claimedCredentials, compareDetails, extractSiteSignals, foldClientCitations,
  matchListing, mergePresence, normPhone, profileKey, normPostcode, operatorSetStatus, presenceQueries, presenceSummary,
  MATCH_CONFIDENCES, PRESENCE_STATUSES, PRIORITIES, PRESENCE_ENGINE_VERSION,
  type BusinessIdentity, type CitationRow, type ListingCandidate, type PresenceFinding, type StoredPresenceRow,
} from "../src/lib/directoryPresence.ts";
import { isProfileUrl, sourceByKey, sourceForUrl, neverRecommendReason, PRESENCE_SOURCES } from "../src/lib/presenceSources.ts";
import { CREDENTIALS } from "../src/lib/fullCrawl.ts";

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  PASS ${m}`); else { f++; console.log(`  FAIL ${m}`); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const src = (k: string) => sourceByKey(k)!;
const empty = { hosts: new Map(), questionsCounted: 0 };
const base = { tradeEvidence: [], tradeAuditTotals: {}, claimed: [], searched: true, citations: empty };

/* A distinctive business with a website, a Google place and a site phone that differs from Google's. */
const brodley = (): BusinessIdentity => buildIdentity({
  lead: { business_name: "Brodley Locksmiths", phone: "01255 111222", website: "https://brodley-locksmiths.com/", address: "1 High St, Clacton-on-Sea CO15 1AA", derived_town: "Clacton-on-Sea", search_keyword: "Locksmiths", place_id: "ChIJbrodley" },
  places: { phone: "01255 111222", website: "https://brodley-locksmiths.com/", address: "1 High St, Clacton-on-Sea CO15 1AA" },
  site: { servedUrl: "https://brodley-locksmiths.com/", phones: ["07700 900123"], postcodes: ["CO15 1AA"] },
});

console.log("── normalisation ──");
ok(normPhone("+44 (0)1480 123456") === "01480123456", "+44 (0) form → national");
ok(normPhone("0044 7700 900123") === "07700900123", "0044 form → national");
ok(normPhone("123") === null && normPhone("") === null, "too short → null, never a match");
ok(normPhone("0800 111 999") === null, "the national gas emergency line (on SC Plumbing's own site) identifies nobody");
ok(normPostcode("pe29 3ab") === "PE293AB" && normPostcode("no postcode") === null, "postcodes upper-cased, spaces removed");

console.log("\n── profile pages, not search pages ──");
ok(isProfileUrl("https://www.yell.com/biz/brodley-locksmiths-clacton-on-sea-1234/", src("yell.com")), "yell /biz/ is a profile");
ok(!isProfileUrl("https://www.yell.com/s/locksmiths-clacton-on-sea.html", src("yell.com")), "yell /s/ search page is not");
ok(isProfileUrl("https://www.checkatrade.com/trades/brodleylocksmiths", src("checkatrade.com")), "checkatrade /trades/ is a profile");
ok(!isProfileUrl("https://www.checkatrade.com/Search/Locksmith/in/Clacton", src("checkatrade.com")), "checkatrade search is not");
ok(!isProfileUrl("https://www.facebook.com/sharer/sharer.php?u=x", src("facebook.com")), "a facebook share link is not a profile");
ok(sourceForUrl("https://www.google.com/search?q=brodley") === null, "a Google search URL is not a Google Business Profile");
ok(sourceForUrl("https://maps.app.goo.gl/abc123")?.source.key === "google-business-profile", "a maps short link is the GBP");
ok(sourceForUrl("https://notyell.com/biz/x")?.source.key !== "yell.com", "notyell.com is not yell.com (no substring matching)");

console.log("\n── match confidence: a name is never enough ──");
{
  const id = brodley();
  const linked = matchListing(id, { url: "https://www.yell.com/biz/brodley-locksmiths-1234/", via: "website", linkedFromSite: true }, src("yell.com"));
  ok(linked.confidence === "confirmed", "the business's own site links to it → CONFIRMED");
  const byPhone = matchListing(id, { url: "https://www.checkatrade.com/trades/brodleylocksmiths", title: "Brodley Locksmiths | Checkatrade", text: "Call 07700 900123", via: "search" }, src("checkatrade.com"));
  ok(byPhone.confidence === "confirmed" && byPhone.signals.includes("phone"), "name + phone on a profile → CONFIRMED");
  const nameTown = matchListing(id, { url: "https://www.mybuilder.com/profile/brodley_locksmiths", title: "Brodley Locksmiths - Clacton-on-Sea", via: "search" }, src("mybuilder.com"));
  ok(nameTown.confidence === "likely", "distinctive name + town, no identifier → LIKELY, not confirmed");
  const conflict = matchListing(id, { url: "https://www.ratedpeople.com/profile/brodley-locksmiths", title: "Brodley Locksmiths", text: "Tel 01632 960000, Leeds LS1 4AP", via: "search" }, src("ratedpeople.com"));
  ok(conflict.confidence === "unverified", "distinctive name but a DIFFERENT phone and postcode → UNVERIFIED");
  const searchPage = matchListing(id, { url: "https://www.yell.com/s/locksmiths-clacton.html", title: "Brodley Locksmiths and 20 more", text: "07700 900123", via: "search" }, src("yell.com"));
  ok(searchPage.confidence === null, "a search/category page is never a listing, whatever it contains");
  const gbp = matchListing(id, { url: "https://maps.google.com/?cid=1", via: "places", placeIdMatch: true }, src("google-business-profile"));
  ok(gbp.confidence === "confirmed", "the lead's own Google place → CONFIRMED");
}
{
  /* COMMON NAME: "AK Electrical" in Whitehaven survives nothing once trade and town are removed. */
  const id = buildIdentity({ lead: { business_name: "AK Electrical", phone: "01946 555000", derived_town: "Whitehaven", search_keyword: "Electricians" } });
  const same = matchListing(id, { url: "https://www.yell.com/biz/ak-electrical-whitehaven-99/", title: "AK Electrical - Whitehaven", via: "search" }, src("yell.com"));
  ok(same.confidence === null, "common name + town, no identifier → no match at all");
  const other = matchListing(id, { url: "https://www.checkatrade.com/trades/akelectrical", title: "AK Electrical, Leeds", text: "0113 496 0000", via: "search" }, src("checkatrade.com"));
  ok(other.confidence === null, "common name elsewhere with another phone → no match");
  const phone = matchListing(id, { url: "https://www.checkatrade.com/trades/akelectrical2", title: "AK Electrical", text: "Call 01946 555000", via: "search" }, src("checkatrade.com"));
  ok(phone.confidence === "confirmed", "…but the SAME phone on the profile confirms it");
}

console.log("\n── false positives measured on live data (2026-09-30) ──");
{
  ok(profileKey("https://maps.app.goo.gl/VTA9DuDUQm46Babd7") === null, "a Maps short link identifies no profile, so it can never be 'a second' GBP");
  ok(profileKey("https://www.facebook.com/AKElectrical1/reviews/") === profileKey("https://www.facebook.com/AKElectrical1"), "facebook /Page and /Page/reviews/ are one profile");
  ok(profileKey("https://www.yell.com/biz/x-1/?utm_source=chatgpt.com") === profileKey("https://www.yell.com/biz/x-1/reviews"), "yell /biz/<id> with utm tags or /reviews is one profile");
  ok(profileKey("https://www.checkatrade.com/trades/a") !== profileKey("https://www.checkatrade.com/trades/b"), "two different trades ids stay two");
  ok(profileKey("https://www.facebook.com/100092417073968/") === profileKey("https://www.facebook.com/p/Brodley-Locksmiths-and-Property-Services-100092417073968/"), "facebook /<id>/ and /p/<Name-id>/ are one page");
  const hzCand: ListingCandidate = { url: "https://www.houzz.co.uk/professionals/joiners/bp-carpentry-1", title: "BP Carpentry and Building", text: "07700 900123", via: "search" };
  const houzz = matchListing(brodley(), hzCand, src("houzz.co.uk"));
  ok(houzz.confidence === "likely" && !houzz.signals.includes("name"), "their phone on a profile under another name → LIKELY, not confirmed");
  const hz = assemblePresence({ ...base, identity: brodley(), candidates: [hzCand] }).findings.find((x) => x.source_key === "houzz.co.uk");
  ok(!!hz && /possibly listed under another or older name/.test(hz.reason), "…and the reason says it may be listed under another name");
  const ronnie = buildIdentity({ lead: { business_name: "Ronnie's Shoe Repairs & Key Cutting", derived_town: "Halifax", search_keyword: "Shoe repairs" } });
  const timpson = sourceForUrl("https://www.timpson.co.uk/stores/halifax-sainsburys/shoe-repairs")!;
  ok(matchListing(ronnie, { url: "https://www.timpson.co.uk/stores/halifax-sainsburys/shoe-repairs", title: "Shoe Repairs Halifax Sainsbury's | Timpson", via: "citation" }, timpson.source).confidence === null,
    "a competitor's store page at /shoe-repairs is NOT Ronnie's Shoe Repairs (two trade words in a URL are not a name)");
  const cybo = sourceForUrl("https://bedrijvengids.cybo.com/GB/clacton-on-sea/slotenmakers")!;
  ok(matchListing(brodley(), { url: "https://bedrijvengids.cybo.com/GB/clacton-on-sea/slotenmakers", title: "Slotenmakers in Clacton-on-Sea", text: "Brodley Locksmiths brodley-locksmiths.com … Other Locks 07858 531315 CO15 3AA", via: "search" }, cybo.source).confidence === null,
    "a category page of many businesses (name only in the snippet, beside another firm's phone) is not a listing — no false 'old number'");
  ok(matchListing(brodley(), { url: "https://locally.co.uk/business/brodley-locksmiths/", title: "Brodley Locksmiths - Clacton", text: "07825 494999", via: "search" }, sourceForUrl("https://locally.co.uk/business/brodley-locksmiths/")!.source).confidence !== null,
    "…while a page titled with the name and carrying the phone still counts");
  ok(!isProfileUrl("https://www.facebook.com/groups/littleclactonandweeley/posts/8001386139917880/", src("facebook.com")), "a Facebook GROUP post is not the business's page");
  ok(isProfileUrl("https://www.facebook.com/p/Brodley-Locksmiths-100092417073968/", src("facebook.com")), "the /p/<Name-id>/ page form is a profile");
  const brod = sourceForUrl("https://www.checkatrade.com/trades/brodleylocksmithsandpropertyservices")!;
  ok(matchListing(brodley(), { url: "https://www.checkatrade.com/trades/brodleylocksmithsandpropertyservices", via: "citation" }, brod.source).signals.includes("name"), "…while the whole name joined in a slug still reads as the name");
}

console.log("\n── consistency: only on a confirmed listing, never against itself ──");
{
  const id = brodley();
  const gbp = matchListing(id, { url: "https://maps.google.com/?cid=1", via: "places", placeIdMatch: true, details: { phone: "01255 111222", website: "https://brodley-locksmiths.com/" } }, src("google-business-profile"));
  const c = compareDetails(id, gbp, "places");
  ok(c.inconsistencies.some((i) => i.field === "phone"), "Google's phone differs from the website's phone → flagged");
  ok(!c.inconsistencies.some((i) => i.field === "website"), "Google's website agrees → not flagged");
  const likely = matchListing(id, { url: "https://www.mybuilder.com/profile/brodley_locksmiths", title: "Brodley Locksmiths - Clacton-on-Sea", text: "01632 960111", via: "search" }, src("mybuilder.com"));
  ok(compareDetails(id, likely, null).inconsistencies.length === 0, "a listing that is not confirmed carries no inconsistency (it may be another business)");
  const moved = buildIdentity({
    lead: { business_name: "Brodley Locksmiths", website: "https://oldbrodley.co.uk/", derived_town: "Clacton-on-Sea", search_keyword: "Locksmiths", place_id: "p" },
    site: { servedUrl: "https://brodley-locksmiths.com/", phones: [], postcodes: [] },
  });
  const gbpOld = matchListing(moved, { url: "https://maps.google.com/?cid=1", via: "places", placeIdMatch: true, details: { website: "https://oldbrodley.co.uk/" } }, src("google-business-profile"));
  const w = compareDetails(moved, gbpOld, "places").inconsistencies.find((i) => i.field === "website");
  ok(!!w && /old domain/.test(w.note), "Google still points at the domain that now redirects → 'the old domain'");
}

console.log("\n── assembling: multiple profiles, duplicates, few/no profiles ──");
{
  const id = brodley();
  const cands: ListingCandidate[] = [
    { url: "https://www.yell.com/biz/brodley-locksmiths-1234/", via: "website", linkedFromSite: true },
    { url: "https://www.checkatrade.com/trades/brodleylocksmiths", via: "website", linkedFromSite: true },
    { url: "https://www.facebook.com/brodleylocksmiths", via: "website", linkedFromSite: true },
    { url: "https://maps.google.com/?cid=1", via: "places", placeIdMatch: true, details: { phone: "01255 111222", website: "https://brodley-locksmiths.com/" } },
    { url: "https://www.checkatrade.com/trades/brodleylocksmithsclacton", title: "Brodley Locksmiths Clacton", text: "07700 900123", via: "search" },
    { url: "https://www.hotfrog.co.uk/company/brodley", title: "Brodley Locksmiths", text: "07700 900123", via: "search" },
  ];
  const { findings } = assemblePresence({ ...base, identity: id, candidates: cands });
  const by = (k: string) => findings.find((x) => x.source_key === k);
  ok(by("yell.com")?.status === "existing" && by("facebook.com")?.status === "existing", "site-linked Yell and Facebook → ALREADY ON");
  ok(by("checkatrade.com")?.status === "needs_attention" && by("checkatrade.com")!.inconsistencies.some((i) => i.field === "duplicate"), "two Checkatrade profiles → NEEDS ATTENTION (duplicate)");
  ok(by("google-business-profile")?.status === "needs_attention", "GBP with a phone that disagrees with the site → NEEDS ATTENTION");
  ok(by("hotfrog.co.uk")?.status === "existing" && by("hotfrog.co.uk")?.priority === null, "a confirmed listing on a junk network is RECORDED (a fact) but never prioritised");
  ok(findings.filter((x) => x.status === "worth_adding").length === 0, "no evidence for anything else → nothing is 'worth adding'");
}
{
  const id = buildIdentity({ lead: { business_name: "Quiet Pipes of Wisbech", derived_town: "Wisbech", search_keyword: "plumber" } });
  const { findings } = assemblePresence({ ...base, searched: false, identity: id, candidates: [] });
  ok(findings.length === 1 && findings[0].source_key === "google-business-profile" && findings[0].status === "worth_adding", "no profiles, no evidence → only the Google Business Profile, nothing invented");
  ok(/check whether one exists/.test(findings[0].reason), "…said with the check-first caveat when no search ran");
}

console.log("\n── competitor evidence and trade-specific opportunities ──");
{
  const id = buildIdentity({
    lead: { business_name: "RG Locksmiths cambs", phone: "07700 900456", website: "https://rglocksmithshuntingdon.co.uk/", derived_town: "Huntingdon", search_keyword: "locksmiths", place_id: "p" },
    site: { servedUrl: "https://rglocksmithshuntingdon.co.uk/", phones: ["07700 900456"], postcodes: [] },
  });
  const ans = (q: string, cites: string[], comps: string[]): CitationRow => ({ question: q, result: { chatgpt: { citations: cites.map((url) => ({ url, title: "x" })), competitors: comps, answer_text: "", named: false, position: null } } });
  const rows: CitationRow[] = [
    ans("best locksmith in huntingdon", ["https://www.checkatrade.com/trades/abclocks", "https://www.checkatrade.com/trades/keyforce"], ["ABC Locks", "Keyforce Locksmiths"]),
    ans("emergency locksmith huntingdon", ["https://www.checkatrade.com/trades/lockfast", "https://www.hotfrog.co.uk/x", "https://www.reddit.com/r/cambridge/x"], ["Lockfast", "RG Locksmiths"]),
    ans("locksmith near st ives", ["https://www.hotfrog.co.uk/y", "https://www.cleverlocal.co.uk/a", "https://rglocksmithshuntingdon.co.uk/"], []),
    ans("24 hour locksmith", ["https://www.cleverlocal.co.uk/b"], []),
  ];
  const fold = foldClientCitations(rows, id);
  ok(fold.questionsCounted === 4 && !fold.hosts.has("rglocksmithshuntingdon.co.uk"), "four questions folded; the client's own site is not a 'source'");
  const claimed = claimedCredentials("Proud members of the Master Locksmiths Association since 2012.");
  ok(claimed.length === 1 && claimed[0].sourceKey === "locksmiths.co.uk", "an MLA claim on the site maps to the MLA's own register");
  const { findings, review } = assemblePresence({
    ...base, identity: id, candidates: [], citations: fold, claimed,
    tradeEvidence: [{ trade: "locksmiths", host: "trustatrader.com", citations: 12, audits: 6 }, { trade: "locksmith", host: "bark.com", citations: 3, audits: 2 }],
    tradeAuditTotals: { locksmiths: 18, locksmith: 3 },
  });
  const cat = findings.find((x) => x.source_key === "checkatrade.com");
  ok(cat?.status === "worth_adding" && cat.priority === "high", "Checkatrade: 3 competitor profiles cited across 2 of their questions, theirs not → WORTH ADDING, high");
  ok(cat?.evidence.competitor_profiles === 3 && (cat.evidence.competitors_named ?? []).includes("Keyforce Locksmiths") && !(cat.evidence.competitors_named ?? []).includes("RG Locksmiths"), "…the competitors are named, the client is never listed as its own competitor");
  const mla = findings.find((x) => x.source_key === "locksmiths.co.uk");
  ok(mla?.priority === "high" && /mentions Master Locksmiths Association/.test(mla.reason), "the MLA register: claimed on the site, not found → high, in the site's own terms");
  const tat = findings.find((x) => x.source_key === "trustatrader.com");
  ok(tat?.priority === "medium" && tat.evidence.trade_audits === 6 && tat.evidence.trade_audits_total === 21, "TrustATrader: trade evidence, singular and plural trade keys summed (6 of 21) → medium");
  ok(findings.find((x) => x.source_key === "bark.com")?.priority === "low", "Bark: thin trade evidence → low");
  ok(!findings.some((x) => x.source_key === "hotfrog.co.uk" || x.source_key === "reddit.com"), "junk (hotfrog) and non-listings (reddit) are never recommended, even when cited");
  ok(review.some((r) => r.source_key === "cleverlocal.co.uk"), "an unclassified host cited on 2 questions → a human look (review), never a task");
  const all = findings.map((x) => x.reason).join(" ");
  ok(!/will (make|get|help you) (you )?rank|guarantee|boost|will rank/i.test(all), "no reason claims a listing causes ranking — evidence, not promises");
}

console.log("\n── the site's own links and schema ──");
{
  const html = `<a href="https://www.yell.com/biz/brodley-1/">Yell</a><a href="/contact">c</a><a href="tel:07700900123">call</a>
    <script type="application/ld+json">{"@type":"Locksmith","telephone":"01255 111222","sameAs":["https://www.facebook.com/brodley"],"address":{"postalCode":"CO15 1AA"}}</script>`;
  const s = extractSiteSignals(html, "https://brodley-locksmiths.com/");
  ok(s.links.includes("https://www.yell.com/biz/brodley-1/") && s.links.includes("https://brodley-locksmiths.com/contact"), "links read and made absolute");
  ok(s.sameAs.includes("https://www.facebook.com/brodley"), "schema sameAs read");
  ok(s.phones.includes("07700900123") && s.phones.includes("01255111222") && s.postcodes.includes("CO151AA"), "tel: links, schema telephone and postcode read");
}

console.log("\n── rechecks: one row per source, absence never downgrades, the operator's word stands ──");
{
  const t1 = "2026-09-01T00:00:00.000Z", t2 = "2026-09-30T00:00:00.000Z";
  const listing = (status: PresenceFinding["status"], conf: "confirmed" | "likely" | null): PresenceFinding => ({
    source_key: "yell.com", source_label: "Yell", source_kind: "directory", status, match_confidence: conf,
    listing_url: conf ? "https://www.yell.com/biz/x-1/" : null, match_signals: [], found_details: {}, inconsistencies: [],
    fields_compared: [], priority: status === "worth_adding" ? "medium" : null, reason: "r", evidence: {}, discovered_via: ["search"],
  });
  const first = mergePresence("L", [], [listing("existing", "confirmed")], t1, "run1");
  ok(first.length === 1 && first[0].first_seen_at === t1 && first[0].last_seen_at === t1, "first check: one row, first seen = last seen");
  const row = { ...first[0], id: "row1" } as StoredPresenceRow;
  const again = mergePresence("L", [row], [listing("existing", "confirmed")], t2, "run2");
  ok(again.length === 1 && again[0].id === "row1" && again[0].first_seen_at === t1 && again[0].last_seen_at === t2 && again[0].check_count === 2, "recheck: same row, first seen kept, last seen moved");
  const gone = mergePresence("L", [row], [listing("worth_adding", null)], t2, "run2");
  ok(gone[0].status === "existing" && gone[0].last_seen_at === t1 && gone[0].listing_url === row.listing_url, "not re-surfaced → still ALREADY ON, last seen stays at the day it was seen");
  const untouched = mergePresence("L", [row], [], t2, "run2");
  ok(untouched.length === 1 && untouched[0].last_checked_at === t2 && untouched[0].status === "existing", "a source this check said nothing about: last checked moves, nothing else");
  const added = operatorSetStatus({ ...row, status: "worth_adding", match_confidence: null }, "added", t1)!;
  ok(added.status === "added" && added.status_source === "operator", "operator marks it added");
  ok(mergePresence("L", [added], [listing("worth_adding", null)], t2, "r")[0].status === "added", "added + not yet seen → stays added");
  const ver = mergePresence("L", [added], [listing("existing", "likely")], t2, "r")[0];
  ok(ver.status === "verified" && ver.verified_at === t2, "added + a check finds it → VERIFIED");
  const nr = operatorSetStatus(row, "not_relevant", t1)!;
  ok(mergePresence("L", [nr], [listing("existing", "confirmed")], t2, "r")[0].status === "not_relevant", "operator's not-relevant stands whatever a check finds");
  ok(operatorSetStatus(row, "existing" as never, t1) === null, "the operator cannot set a check-only status");

  /* A row an OLDER rule wrote (no engine_version = 1) is re-judged, not kept forever. */
  const oldFalse = { ...row, id: "old", source_key: "bedrijvengids.cybo.com", status: "needs_attention", discovered_via: ["search"], evidence: {} } as StoredPresenceRow;
  const noSearch = mergePresence("L", [oldFalse], [], t2, "r", { searched: false });
  ok(noSearch[0].status === "needs_attention", "a search-found row from an older rule is NOT withdrawn by a check that did not search");
  const withSearch = mergePresence("L", [oldFalse], [], t2, "r", { searched: true });
  ok(withSearch[0].status === "not_relevant" && withSearch[0].previous_status === "needs_attention" && withSearch[0].status_source === "check" && /^Withdrawn/.test(withSearch[0].reason) && withSearch[0].id === "old",
    "…but a check that re-ran the search and no longer finds it WITHDRAWS it (same row, reason stated, nothing deleted)");
  const current = { ...oldFalse, evidence: { engine_version: PRESENCE_ENGINE_VERSION } } as StoredPresenceRow;
  ok(mergePresence("L", [current], [], t2, "r", { searched: true })[0].status === "needs_attention", "a row the CURRENT rules wrote keeps absence-never-downgrades");
  const opOld = { ...oldFalse, status: "added", status_source: "operator" } as StoredPresenceRow;
  ok(mergePresence("L", [opOld], [], t2, "r", { searched: true })[0].status === "added", "an operator's row is never withdrawn by a rule change");
}
{
  const { findings } = assemblePresence({ ...base, identity: brodley(), candidates: [{ url: "https://www.yell.com/biz/brodley-1/", via: "website", linkedFromSite: true }] });
  ok(findings.every((x) => x.evidence.engine_version === PRESENCE_ENGINE_VERSION), "every finding is stamped with the rules version that wrote it");
}

console.log("\n── the hub's shape ──");
{
  const rows = mergePresence("L", [], [
    { source_key: "yell.com", source_label: "Yell", source_kind: "directory", status: "existing", match_confidence: "confirmed", listing_url: "u", match_signals: [], found_details: {}, inconsistencies: [], fields_compared: [], priority: null, reason: "", evidence: {}, discovered_via: [] },
    { source_key: "checkatrade.com", source_label: "Checkatrade", source_kind: "directory", status: "worth_adding", match_confidence: null, listing_url: null, match_signals: [], found_details: {}, inconsistencies: [], fields_compared: [], priority: "low", reason: "", evidence: {}, discovered_via: [] },
    { source_key: "locksmiths.co.uk", source_label: "MLA", source_kind: "trade-body", status: "worth_adding", match_confidence: null, listing_url: null, match_signals: [], found_details: {}, inconsistencies: [], fields_compared: [], priority: "high", reason: "", evidence: {}, discovered_via: [] },
  ], "2026-09-30T00:00:00Z", "r");
  const s = presenceSummary("L", rows, { finished_at: "2026-09-30T00:00:00Z", searched: true });
  ok(s.counts.already_on === 1 && s.counts.worth_adding === 2 && s.counts.needs_attention === 0, "counts per group");
  ok(s.worth_adding[0].source_key === "locksmiths.co.uk", "worth adding is ordered high → low");
  ok(presenceSummary("L", [], null).checked === false, "never checked is said as never checked, not as 'nothing found'");
}

console.log("\n── queries ──");
{
  const q = presenceQueries(brodley());
  ok(q.length === 3 && q[0] === '"Brodley Locksmiths" Clacton-on-Sea' && q[1] === '"07700 900123"' && q[2] === '"brodley-locksmiths.com" -site:brodley-locksmiths.com', "name + town, the site's phone, the domain off its own site");
}

console.log("\n── one rule, one place ──");
{
  const mig = read("supabase/migrations/20260930120000_directory_presence.sql");
  const list = (col: string) => (mig.match(new RegExp(`${col} text not null check \\(${col} in \\(([^)]*)\\)\\)`))?.[1] ?? "").split(",").map((x) => x.trim().replace(/'/g, ""));
  ok(JSON.stringify(list("status")) === JSON.stringify(PRESENCE_STATUSES), "the table's status CHECK == PRESENCE_STATUSES");
  ok(JSON.stringify(list("source_kind")) === JSON.stringify(["map", "directory", "review", "social", "trade-body", "manufacturer", "register", "other"]), "the table's source_kind CHECK == PresenceSourceKind");
  ok(/match_confidence in \('confirmed','likely','unverified'\)/.test(mig) && MATCH_CONFIDENCES.join() === "confirmed,likely,unverified", "confidence CHECK == MATCH_CONFIDENCES");
  ok(/priority in \('high','medium','low'\)/.test(mig) && PRIORITIES.join() === "high,medium,low", "priority CHECK == PRIORITIES");
  ok(/create unique index if not exists lead_directory_presence_lead_source_key on public\.lead_directory_presence \(lead_id, source_key\)/.test(mig), "one row per (lead, source) is a unique index, not a hope");
  ok(!/create policy/i.test(mig) && /lead_directory_presence enable row level security/.test(mig) && /lead_directory_presence_runs enable row level security/.test(mig), "RLS on, no policies: service-role only");
  ok(!/\bdrop\b|\bdelete from\b|\btruncate\b/i.test(mig), "the migration is additive");
  ok(PRESENCE_SOURCES.filter((s) => s.credential).every((s) => CREDENTIALS.some((c) => c.name === s.credential)), "every credential a source names is in fullCrawl's CREDENTIALS (one ruler)");
  ok(!!neverRecommendReason(src("bing-places"), undefined), "Bing Places is never recommended (tested negative)");
  const rpc = read("supabase/migrations/20260930130000_presence_trade_citation_hosts.sql");
  ok(/revoke all on function public\.presence_trade_citation_hosts\(uuid\[\]\) from public, anon, authenticated;/.test(rpc) && /grant execute on function public\.presence_trade_citation_hosts\(uuid\[\]\) to service_role;/.test(rpc), "the trade aggregate is service-role only");
  ok(/language sql stable/.test(rpc) && !/\b(insert|update|delete|drop|truncate)\b/i.test(rpc.replace(/--.*$/gm, "")), "…and read-only");
  const fn = read("supabase/functions/directory-presence/index.ts");
  ok(!/functions\/v1\/playbook-evidence/.test(fn) && /rpc\("presence_trade_citation_hosts"/.test(fn) && /keys\.includes\(norm\(a\.business_type\)\)/.test(fn), "trade evidence: this trade's audits by the same norm() rule, aggregated in the database (playbook-evidence times out)");
  ok(/abortApifyRun\(runId, token\)/.test(fn), "a search we stop waiting for is aborted, not left billing");
  ok(/from "\.\.\/_shared\/safe-fetch\.ts"/.test(fn) && !/_shared\/site-research\.ts/.test(fn), "the page fetch comes from the safe-fetch leaf, not site-research (whose closure is the whole report stack)");
  const leaf = read("supabase/functions/_shared/safe-fetch.ts");
  ok(!/^import /m.test(leaf), "safe-fetch.ts is a leaf: it imports nothing");
  ok(/requireAdmin\(req, service\)/.test(fn) && /allStopRefusal\(service/.test(fn) && /USAGE_CRITICAL_PCT/.test(fn), "admin only; the search refuses under the emergency stop and at the Apify cap");
  ok(fn.indexOf("allStopRefusal(service") < fn.indexOf("startApifyRun("), "…and the gates run before any search starts");
  ok(!/\.insert\(\s*payload/.test(fn) && /onConflict: "lead_id,source_key"/.test(fn), "rows are UPSERTED on (lead, source) — a recheck cannot insert a duplicate");
  ok(fn.includes('attempts.length > 0 && attempts.every((x) => x.state === "succeeded")'), "an older rule's row is withdrawn only after a COMPLETE search, never a partial one");
  ok(!/facebook\.com\/pages\/create|\.post\(|submit/i.test(fn.replace(/method: "POST"/g, "")), "discovery only: nothing in the function creates or submits a listing");
}

console.log(f ? `\n${f} FAILURE(S)` : "\nall passed");
if (f) process.exit(1);
