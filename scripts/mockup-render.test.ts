/* ============================================================
   THE MOCKUP RENDERER'S CONTRACT, PINNED.

   Paul is authoring the locksmith template in a separate session and asked to be CERTAIN of one
   property before designing: that `{{#if img hero}}` drops the WHOLE block, not just the <img>,
   so a hero section with no photo collapses cleanly rather than leaving an empty container.

   🔴 IT IS NOT A STYLE QUESTION, IT IS THE COMMON CASE. Measured across six real locksmith
   websites, RE-MEASURED 2026-09-11 after the placeholder/srcset fix: 48 distinct own-site images,
   33 are >=400px and 24 are >=900px. Per business the hero-capable counts are 0, 0, 3, 3, 5, 13 —
   TWO OF SIX CANNOT FILL A HERO SLOT FROM THEIR OWN SITE AT ALL, and stock is forbidden in the
   hero, so "no hero" is a state a third of these pages will really be in.
   ⚠️ THE EARLIER FIGURES IN THIS HEADER WERE WRONG AND WERE MEASURING MY OWN HARVESTING. They
   read "0, 0, 0, 4, 4, 19 — THREE OF SIX", because the harvester was reading blurred Wix
   placeholders and the smallest srcset entry. RL Locksmiths went 0 -> 5 hero-capable on the fix
   alone; its photos were always there. The conclusion held, the numbers did not.

   ⛔ AND THE GRANULARITY IS THE TEMPLATE AUTHOR'S, NOT THE RENDERER'S. Where the tags go decides
   what disappears. Both forms are legal and they do different things; both are pinned here,
   because a renderer that silently chose one would take the decision away from the template.
   ============================================================ */
import { renderPage, slotsIn, capData, safeUrl, escapeHtml, MissingRequired, type MockupData } from "../src/lib/mockupRender.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const base: MockupData = {
  business: { name: "Starr Keys", trade: "Locksmith", town: "Chatham", phone: "07891 347718", phone_link: "tel:07891347718", address: "38 Harptree Drive, Chatham", email: null, hours: "Mon - Fri 8:00 am – 8:00 pm" },
  services: [{ name: "Key Replacement" }, { name: "Emergency Unlocking", price: "from £65" }, { name: "Key Programming" }],
  areas: [],
  slots: {},
};

console.log("── 🔴 {{#if img hero}} WRAPPING THE SECTION: the WHOLE section goes ──");
{
  const tpl = `<template data-page="home">
<section class="hero"><img src="{{url img hero}}"><h1>{{business.trade}} in {{business.town}}</h1></section>
<main><p>{{business.name}}</p></main>
</template>`;
  const wrapped = tpl.replace('<section class="hero">', '{{#if img hero}}<section class="hero">')
                     .replace("</section>", "</section>{{/if}}");
  const withHero = renderPage(wrapped, "home", { ...base, slots: { hero: "https://example.com/a.jpg" } });
  const noHero = renderPage(wrapped, "home", base);
  ok(withHero.includes('<section class="hero">'), "with a hero: the section renders");
  ok(withHero.includes("https://example.com/a.jpg"), "with a hero: the URL is in the src");
  ok(!noHero.includes("<section"), "🔴 NO hero: the entire <section> is gone");
  ok(!noHero.includes("<img"), "no hero: no orphaned <img>");
  ok(!noHero.includes('src=""'), "⛔ no hero: NO empty src attribute is emitted");
  ok(!noHero.includes("class=\"hero\""), "no hero: no empty container left behind");
  ok(noHero.includes("Starr Keys"), "no hero: the rest of the page still renders");
  ok(!/<section[^>]*>\s*<\/section>/.test(noHero), "no hero: no empty element pair anywhere");
}

console.log("\n── {{#if}} INSIDE the section: only the <img> goes, section stays ──");
{
  const tpl = `<template data-page="home">
<section class="hero">{{#if img hero}}<img src="{{url img hero}}">{{/if}}<h1>{{business.trade}}</h1></section>
</template>`;
  const noHero = renderPage(tpl, "home", base);
  ok(noHero.includes('<section class="hero">'), "the section is KEPT (the author put the tags inside)");
  ok(!noHero.includes("<img"), "the img is dropped");
  ok(noHero.includes("<h1>Locksmith</h1>"), "sibling content survives");
}

console.log("\n── ⛔ {{#if list}} IS FALSE FOR AN EMPTY LIST — how a heading disappears ──");
{
  const tpl = `<template data-page="home">{{#if areas}}<h2>Areas we cover</h2><p>{{#each areas}}{{.}} · {{/each}}</p>{{/if}}<footer>x</footer></template>`;
  const none = renderPage(tpl, "home", base);
  ok(!none.includes("Areas we cover"), "🔴 no areas: the HEADING goes too, not just the list");
  ok(none.includes("<footer>x</footer>"), "no areas: the rest survives");
  const some = renderPage(tpl, "home", { ...base, areas: ["Chatham", "Gillingham"] });
  ok(some.includes("Areas we cover"), "with areas: the heading renders");
  ok(some.includes("Chatham · Gillingham ·"), "with areas: {{.}} yields each town");
}

console.log("\n── {{#each}} with {{#if}} NESTED inside it ──");
{
  const tpl = `<template data-page="home">{{#each services}}<div>{{.name}}{{#if .price}}<b>{{.price}}</b>{{/if}}</div>{{/each}}</template>`;
  const out = renderPage(tpl, "home", base);
  ok((out.match(/<div>/g) || []).length === 3, "one block per service (3)");
  ok(out.includes("<b>from £65</b>"), "the priced service renders its price");
  ok((out.match(/<b>/g) || []).length === 1, "⛔ the two services with NO price emit no empty <b>");
  ok(renderPage(tpl, "home", { ...base, services: [] }) === "", "empty services: zero blocks");
}

console.log("\n── nesting: {{#if}} inside {{#if}} ──");
{
  const tpl = `<template data-page="home">{{#if business.phone}}<a>{{#if business.hours}}open {{business.hours}}{{/if}}{{business.phone}}</a>{{/if}}</template>`;
  ok(renderPage(tpl, "home", base).includes("open Mon - Fri"), "inner if true → renders");
  const noHours = renderPage(tpl, "home", { ...base, business: { ...base.business, hours: null } });
  ok(noHours.includes("07891") && !noHours.includes("open"), "inner if false, outer still renders");
  ok(renderPage(tpl, "home", { ...base, business: { ...base.business, phone: null } }) === "", "outer if false → all gone");
}

console.log("\n── ⛔ ESCAPING: scraped text is UNTRUSTED, there is no raw-HTML construct ──");
{
  const tpl = `<template data-page="home">{{#each services}}<p>{{.name}}</p>{{/each}}</template>`;
  const nasty = renderPage(tpl, "home", { ...base, services: [{ name: `<script>alert(1)</script>` }] });
  ok(!nasty.includes("<script>"), "a scraped <script> is escaped, never emitted");
  ok(nasty.includes("&lt;script&gt;"), "it appears as text");
  ok(escapeHtml(`a"b'c&d<e>`) === "a&quot;b&#39;c&amp;d&lt;e&gt;", "quotes escaped too, so one construct is safe in text AND attributes");
}

console.log("\n── ⛔ safeUrl: SCHEME ALLOWLIST, not a blocklist ──");
for (const bad of ["javascript:alert(1)", "data:text/html;base64,x", "vbscript:x", "file:///etc/passwd", "  ", ""]) {
  ok(safeUrl(bad) === "", `refused: ${JSON.stringify(bad)}`);
}
ok(safeUrl("https://a.test/x.jpg").startsWith("https://a.test"), "https passes");
ok(safeUrl("tel:07891347718") === "tel:07891347718", "tel passes (phone_link needs it)");
ok(safeUrl("mailto:a@b.co") === "mailto:a@b.co", "mailto passes");

console.log("\n── ⛔ A REQUIRED FIELD MISSING REFUSES THE RENDER ──");
{
  const tpl = `<template data-page="home"><h1>{{business.name}}</h1></template>`;
  let threw = false;
  try { renderPage(tpl, "home", { ...base, business: { ...base.business, name: "  " } }); }
  catch (e) { threw = e instanceof MissingRequired; }
  ok(threw, "blank business.name → MissingRequired, not a page with a hole in it");
}

console.log("\n── slotsIn IS the slot list the picker shows ──");
{
  const tpl = `x {{url img hero}} y {{#if img van}}{{url img van}}{{/if}} {{ img work_1 }} {{url img hero}}`;
  const s = slotsIn(tpl);
  ok(JSON.stringify(s) === JSON.stringify(["hero", "van", "work_1"]), `free-form names, first-appearance order, deduped: ${JSON.stringify(s)}`);
  ok(slotsIn("no slots here").length === 0, "a template with no images declares no slots");
}

console.log("\n── caps: 6 services, 8 areas, applied by the RENDERER ──");
{
  const many = capData(
    { ...base, services: Array.from({ length: 37 }, (_, i) => ({ name: `s${i}` })), areas: Array.from({ length: 38 }, (_, i) => `t${i}`) },
    { services: 6, areas: 8 },
  );
  ok(many.services.length === 6, "37 services → 6");
  ok(many.areas.length === 8, "38 areas → 8");
  const few = capData({ ...base, services: [{ name: "one" }, { name: "two" }], areas: [] }, { services: 6, areas: 8 });
  ok(few.services.length === 2, "2 services stay 2 — the cap truncates, it never pads");
  ok(few.areas.length === 0, "0 areas stay 0");
}

console.log(`\n${f === 0 ? "ALL PASS" : `${f} FAILURES`}`);
if (f) throw new Error(`${f} failures`);
