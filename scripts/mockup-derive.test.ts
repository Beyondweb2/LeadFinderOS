/* ============================================================
   THE DERIVATION, AND THE GOLDEN DIFF THAT PROVES THE PORT.

   🔴 THIS REPO OWNS THE DERIVATION (Paul, 2026-09-11) because the mockup renders in an edge
   function when a prospect replies. The design session's `src/render.mjs` is now downstream.
   This suite exists so the two cannot silently drift apart again.

   ⛔ WHEN THE DESIGN SESSION'S FOLDER IS PRESENT, every derived value is compared against ITS
   buildData over ITS OWN sample inputs, and only an ENUMERATED allowlist of differences is
   permitted. When the folder is absent the golden half SKIPS (same precedent as
   check-cross-repo-sync.mjs exiting 2 on a missing sibling) and the invariants below still run.

   The port was written against that diff, not against a reading of the code: the first attempt
   had 47 differences, and each one was a real defect — drifted stock captions, a missing
   furniture filter that put twitter.png in a prospect's gallery as their own photograph, and
   two "REPLACE WITH stock-04" placeholders being shipped as photographs.
   ============================================================ */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { deriveMockup, MissingRaw, truthy, CAP_SERVICES, CAP_AREAS, PHOTO_SLOTS,
         type MockupRaw } from "../src/lib/mockupDerive.ts";
import { rawFromMockupRow } from "../src/lib/mockupRaw.ts";
import { MOCKUP_STOCK } from "../src/lib/mockupStock.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const base = (): MockupRaw => ({ business: { name: "A Locks", trade: "Locksmith", town: "Ely" } });

/* ── Required fields refuse, they never ship a blank ─────────────────────────────────────── */
for (const gone of ["name", "trade", "town"] as const) {
  const raw = base(); delete (raw.business as Record<string, unknown>)[gone];
  let threw = false;
  try { deriveMockup(raw); } catch (e) { threw = e instanceof MissingRaw; }
  ok(threw, `missing business.${gone} REFUSES rather than rendering a blank`);
}
ok(truthy("  ") === false && truthy([]) === false && truthy({}) === false && truthy(0) === false,
   "absence is absence: blank, empty array, empty object and 0 are all falsey");

/* ── 🔴 THE CALL-OUT FEE HAS THREE STATES ─────────────────────────────────────────────────
   Collapsing absent into either direction is how "no call-out fee" gets printed for a business
   that charges one. */
{
  const yes = deriveMockup({ ...base(), no_callout_fee: true }) as any;
  const no = deriveMockup({ ...base(), no_callout_fee: false }) as any;
  const dunno = deriveMockup(base()) as any;
  ok(yes.fee.none && !yes.fee.charged && !yes.fee.unknown, "true  -> none");
  ok(!no.fee.none && no.fee.charged && !no.fee.unknown, "false -> charged");
  ok(!dunno.fee.none && !dunno.fee.charged && dunno.fee.unknown, "🔴 ABSENT -> unknown, asserting NEITHER");
  ok(deriveMockup({ ...base(), no_callout_fee: null } as MockupRaw).fee!.unknown === true as any ||
     (deriveMockup({ ...base(), no_callout_fee: null } as any) as any).fee.unknown, "null is also unknown");
  ok(yes.trust_typed.some((t: any) => t.title === "No call-out fee"), "a true fee claim appears");
  ok(dunno.trust_typed.length === 0, "an absent fee claims NOTHING");
}

/* ── 🔴 CREDENTIALS ARE NEVER INVENTED (Paul, explicitly) ─────────────────────────────────── */
{
  const d = deriveMockup(base()) as any;
  const titles = JSON.stringify(d.trust_typed);
  ok(!/DBS/i.test(titles), "no DBS claim without dbs_checked === true");
  ok(!/Master Locksmiths|MLA/i.test(titles), "no MLA claim without mla_member === true");
  const claimed = deriveMockup({ ...base(), mla_member: true }) as any;
  const mla = claimed.trust_typed.find((t: any) => /Master Locksmiths/.test(t.title));
  ok(!!mla && /verifiable on the MLA register/.test(mla.note) && !/approved|inspected/i.test(mla.note),
     "⛔ MLA says 'member, verifiable' — never 'approved' or 'inspected', which are specific grades");
  for (const v of [1, "true", "yes", {}] as unknown[]) {
    ok((deriveMockup({ ...base(), dbs_checked: v as boolean }) as any).trust_typed.length === 0,
       `a truthy-but-not-true dbs_checked (${JSON.stringify(v)}) still claims nothing`);
  }
}

/* ── Owner: typed or absent, never generated ─────────────────────────────────────────────── */
{
  ok((deriveMockup(base()) as any).owner === null, "no bio -> no owner section at all");
  const withBio = deriveMockup({ ...base(), owner_bio: "I started in 2011.",
    business: { ...base().business, owner_first_name: "Rob", established: "2011" } }) as any;
  ok(withBio.owner.name === "Rob" && Number(withBio.owner.years) > 10, "a typed bio renders with years");
  const silly = deriveMockup({ ...base(), owner_bio: "x",
    business: { ...base().business, established: "20111" } }) as any;
  ok(silly.owner.years === "", "⛔ a typo year prints NOTHING, never '18095 years'");
  const recent = deriveMockup({ ...base(), owner_bio: "x",
    business: { ...base().business, established: String(new Date().getUTCFullYear()) } }) as any;
  ok(recent.owner.years === "", "this year prints nothing — '1 year' reads worse than silence");
}

/* ── Prices and the headline ─────────────────────────────────────────────────────────────── */
{
  ok((deriveMockup(base()) as any).prices_none === true, "no prices -> prices_none");
  ok((deriveMockup(base()) as any).headline_price === null, "⛔ no prices -> NO headline price invented");
  const d = deriveMockup({ ...base(), prices: [
    { label: "Out of hours surcharge", amount: "+£25" },
    { label: "Lock opening", amount: "£65" },
    { label: "Full lock change", amount: "£120" },
  ] }) as any;
  ok(d.headline_price.from === "£65" && d.headline_price.service === "Lock opening",
     "⛔ the surcharge is EXCLUDED — '+£25' is an addition to a price, not the cheapest price");
}

/* ── Service groups are never guessed ────────────────────────────────────────────────────── */
{
  const flat = deriveMockup({ ...base(), services: [{ name: "Emergency car key replacement" }] }) as any;
  ok(flat.services_flat === true && flat.service_groups.length === 0,
     "⛔ no category on the row -> NO group. A keyword rule would mis-file this exact service");
  const grouped = deriveMockup({ ...base(), services: [
    { name: "Board up", category: "commercial" }, { name: "Lockout", category: "emergency" },
    { name: "Odd", category: "banana" },
  ] }) as any;
  ok(grouped.service_groups[0].label === "Emergency", "emergency leads — the most urgent customer");
  const last = grouped.service_groups[grouped.service_groups.length - 1];
  ok(last.unlabelled === true && last.items[0].name === "Odd",
     "an unrecognised category keeps its place with NO heading, rather than being guessed at");
}

/* ── Caps and the gallery ────────────────────────────────────────────────────────────────── */
{
  const many = deriveMockup({ ...base(), services: Array.from({ length: 20 }, (_, i) => ({ name: `s${i}` })),
    areas: Array.from({ length: 20 }, (_, i) => `t${i}`) }) as any;
  ok(many.services.length === CAP_SERVICES, `services capped at ${CAP_SERVICES}`);
  ok(many.areas.length === CAP_AREAS, `areas capped at ${CAP_AREAS} (the LAYOUT's cap, not the scraper's)`);
  ok(many.area_rows.length === CAP_AREAS + 1, "area_rows is the home town PLUS the areas");
  const photos = (deriveMockup(base()) as any).photos;
  ok(photos.length <= PHOTO_SLOTS, "the gallery never exceeds its grid");
  /* ⛔ ASSERT THE PROPERTY, NOT TODAY'S FILENAMES. This first read `!/stock-0[456]/`, which
     started failing the moment those three placeholders were replaced by real photographs —
     the test was wrong, not the code. The invariant is about the FLAG. */
  const placeholderPaths = new Set(MOCKUP_STOCK.filter((s) => s.placeholder).map((s) => s.path));
  ok(photos.every((p: any) => ![...placeholderPaths].some((pp) => p.src.endsWith(pp.split("/").pop()!))),
     "🔴 no row flagged `placeholder` is ever shipped as a photograph");
  ok(photos.every((p: any) => p.is_stock), "with no real pool, the gallery is stock only");
  const withJunk = deriveMockup({ ...base(), images: [
    { url: "https://x.co.uk/img/twitter.png" }, { url: "https://x.co.uk/img/logo.svg" },
    { url: "https://x.co.uk/img/real-door.jpg" },
  ] }) as any;
  const real = withJunk.photos.filter((p: any) => !p.is_stock);
  ok(real.length === 1 && /real-door/.test(real[0].src),
     "⛔ twitter.png and logo.svg are furniture — a golden diff caught them being shipped as their work");
  ok(real[0].uncaptioned === true && !/twitter|logo/.test(JSON.stringify(withJunk.photos)),
     "an uncaptioned real photo says so rather than inventing a caption");
}

/* ── 🔴 TESTIMONIALS ARE NEVER FABRICATED ───────────────────────────────────────────────── */
{
  const d = deriveMockup(base()) as any;
  ok(Array.isArray(d.reviews) && d.reviews.length === 0, "no typed reviews -> NO testimonials at all");
  ok(d.reviews_are_placeholder === false, "and an empty list is not 'placeholder', it is empty");
  const unmarked = deriveMockup({ ...base(), reviews: [{ quote: "Great" }] } as any) as any;
  ok(unmarked.reviews_are_placeholder === true,
     "⛔ a quote with NO placeholder flag counts as a PLACEHOLDER — it must prove it is real to be shown as real");
  const real = deriveMockup({ ...base(), reviews: [{ quote: "Great", placeholder: false }] } as any) as any;
  ok(real.reviews_are_placeholder === false, "only an explicit placeholder:false is treated as a real quote");
}

/* ── Stock honesty ───────────────────────────────────────────────────────────────────────── */
for (const s of MOCKUP_STOCK) {
  ok(!/\b(our|we|their)\b/i.test(s.caption + " " + s.alt),
     `stock ${s.id}: the caption never claims whose work it is`);
}

/* ── Areas and times ─────────────────────────────────────────────────────────────────────── */
{
  const none = deriveMockup({ ...base(), areas: ["Soham", "March"] }) as any;
  ok(none.areas_untimed === true && none.area_rows.every((r: any) => r.no_time === false),
     "⛔ with NO times anywhere, no row is annotated — there is no column to explain");
  const some = deriveMockup({ ...base(), areas: ["Soham", "March"], area_times: { soham: "20 min" } }) as any;
  ok(some.areas_timed === true, "one time makes the section timed");
  ok(some.area_rows.find((r: any) => r.area === "March").no_time === true,
     "and THEN an untimed row is marked, because a blank beside filled rows reads as missing data");
  ok(some.area_rows.find((r: any) => r.area === "Soham").time === "20 min", "lookup is case-insensitive");
  ok(deriveMockup({ ...base(), areas: ["A", "B", "C"] } as MockupRaw).areas_line === "A, B and C" as any,
     "the areas line reads as English");
}

/* ── The hero, and the paired flag ───────────────────────────────────────────────────────── */
{
  ok((deriveMockup(base()) as any).img.no_hero === true, "no hero photo -> no_hero true (the CSS art shows)");
  const withHero = deriveMockup({ ...base(), img: { hero: "https://x/h.jpg" } }) as any;
  ok(withHero.img.no_hero === false, "a real hero -> no_hero false, so the OPAQUE art layer stays off it");
  ok(typeof withHero.img.bg_faq === "string", "every slot the template declares is present, bg_faq included");
}

/* ── 🔴 THE PRODUCT PATH INVENTS NOTHING ─────────────────────────────────────────────────
   The builder that a real prospect's mockup goes through, driven by a realistic stored row. */
{
  const raw = rawFromMockupRow(
    { niche: "locksmith",
      business: { name: "First4locks Ltd", town: "Liverpool", phone: "+44 7920 684400",
                  address: "10 Lovel Rd, Speke, Liverpool L24 0ST, UK", email: "a@b.co.uk" },
      scrape: { services: [{ name: "Lock change" }], areas: ["Widnes"] },
      pool: [{ url: "https://x/photo.jpg" }, { url: "https://x/logo.png", demoted: "furniture" }] },
    { rating: "5", review_count: 288, google_maps_url: "https://maps.google.com/?cid=1" },
    { hero: "https://signed/hero.jpg" },
  );
  ok(raw.business!.trade === "Locksmith", "trade comes from the REGISTRY, title case — the row has none");
  ok(raw.business!.postcode === "L24 0ST", "the postcode is read out of the Google address");
  ok(raw.business!.phone === "07920 684400", "+44 is normalised for display");
  ok(raw.reviews === undefined, "🔴 the product path sets NO testimonials");
  ok(raw.owner_bio === undefined, "🔴 no owner bio — there is no source for one");
  ok(raw.no_callout_fee === undefined, "🔴 no call-out-fee claim — we have not asked");
  ok(raw.dbs_checked === undefined && raw.mla_member === undefined, "🔴 no credential is ever asserted");
  ok((raw.prices ?? []).length === 0, "no prices — nothing scrapes a reliable price list");
  ok(raw.area_times === undefined, "no response times — they would have to be invented");
  ok(raw.images!.length === 1, "a demoted pool image never reaches the gallery");

  const d = deriveMockup(raw) as any;
  ok(d.business.has_reviews === true && d.business.reviews_linked === true,
     "a real rating AND count AND link -> the Google figure is shown with its source");
  ok(d.owner === null && d.prices_none === true && d.fee.unknown === true && d.areas_untimed === true,
     "so the page renders with no owner section, no price table, no fee claim and no times — honest and thin");
  ok(d.reviews.length === 0, "and no testimonials");
}

/* ══ THE GOLDEN DIFF ════════════════════════════════════════════════════════════════════════ */
const TR = "/mnt/c/Users/paulj/Locksmith_Template";
if (!existsSync(`${TR}/src/render.mjs`)) {
  console.log("\nSKIP golden diff — the design session's folder is not on this machine.");
} else {
  const { buildData } = await import(`${TR}/src/render.mjs`);
  /* ⛔ THE ONLY PERMITTED DIFFERENCES, EACH WITH ITS REASON. Anything else is drift and fails.
     · photos[] — THE TWO SIDES SOURCE STOCK DIFFERENTLY BY DESIGN, and a live incident during
       this port settled which is right. The design session LISTS ITS DIRECTORY; this repo reads
       the EXPLICIT list in mockupStock.ts. At 08:44 on 2026-09-11, mid-test, that session added
       four background plates (bg-arches, bg-interior, bg-vault, hero-entrance) to the same
       folder — and because they sort before stock-01 and have no captions.json entry, ITS
       gallery immediately filled with background plates captioned "Locksmith work". A directory
       listing cannot tell a gallery photograph from a background plate. The explicit list can,
       so the repo's list is authoritative and this key is excluded. The gallery's own rules are
       covered by the invariants above, not by this diff.
     · img.bg_faq — the template DECLARES bg_faq as a slot and that buildData never fills it, so
       it always rendered empty there. This repo fills it; the difference is a fix, not drift. */
  const allow = (path: string) => /^photos\b/.test(path) || path === "img.bg_faq";
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const diff = (a: any, b: any, p = ""): string[] => {
    if (a === b) return [];
    const out: string[] = [];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push(`${p}: length ${a.length} vs ${b.length}`);
      for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${p}[${i}]`));
      return out;
    }
    if (isObj(a) && isObj(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!p && (k === "_diag" || k === "map")) continue;   // deliberately not ported identically
        out.push(...diff(a[k], b[k], p ? `${p}.${k}` : k));
      }
      return out;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${p}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  };
  for (const file of readdirSync(`${TR}/samples`).filter((n) => n.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(`${TR}/samples/${file}`, "utf8"));
    const theirs = await buildData(structuredClone(raw), { photoSection: true });
    const mine = deriveMockup(structuredClone(raw));
    const unexplained = diff(theirs, mine).filter((line) => !allow(line.split(":")[0]));
    ok(unexplained.length === 0, `golden: ${file} matches the design session${unexplained.length ? " — " + unexplained.slice(0, 3).join(" | ") : ""}`);
  }
}

console.log(f === 0 ? "\nOK the derivation holds" : `\n${f} FAILED`);
if (f) process.exit(1);
