/* ============================================================
   THE WEBSITE SCAN'S FINDINGS, IN PLAIN ENGLISH.

   ⛔ WHY THIS FILE EXISTS. The client sheet printed each finding with the scanner's own
   recommendation underneath it — "Add descriptive alt attributes to all images for accessibility and
   SEO", "Add JSON-LD, Microdata or RDFa to improve SEO". The section immediately above says "We fix
   these — you do not need to do anything with this list", and then handed the client a developer
   to-do list. The two cannot both be true.
   So the recommendation is not softened or shortened — it is GONE, structurally: ClientSeoFinding has
   no `detail` field for it to travel in, and the renderer has nothing to print. Deleting the field
   was the point; a renderer that merely declines to print it drifts back the first time someone adds
   a line to the template.

   ⛔ AND THE TITLES ARE THE SCANNER'S LOG LINES. "1 broken links detected" is not English. "10 images
   without alt text" is a log entry. They are rewritten here, with the figures EXACTLY as measured and
   singular/plural handled — never rounded, never softened. "Thin content: only 230 words" still says
   thin, because it is.

   ⚠️ FALLBACK: AN UNRECOGNISED TITLE IS PASSED THROUGH VERBATIM. The scanner is a third party and can
   add a finding type whenever it likes. A map that returned '' for an unknown shape would print a
   blank row on a client's document, which is worse than a slightly technical one. So an unmatched
   title renders exactly as the scanner wrote it — ugly at worst, never empty, never wrong.

   MEASURED, NOT GUESSED: the pattern list below is a census of every finding ever stored, taken
   2026-08-06 — 613 findings across 163 runs, collapsing to 28 distinct title shapes. All 28 are
   mapped. Four of them ("AI can't read your site", "You're placed nowhere", "Core basics missing",
   "Social links point to Wix, not you") are OURS, from an older path, and are already plain English —
   they map to themselves so that the intent is recorded rather than left to the fallback by accident.
   ============================================================ */

/** A pattern and the plain-English line it produces. `m` is the regex match on the scanner's title. */
interface FindingRule {
  re: RegExp;
  text: (m: RegExpMatchArray) => string;
}

/** "1 image" / "10 images" — the scanner always writes the plural. */
const plural = (n: string, one: string, many: string) => (n === '1' ? one : many);

/* ORDER MATTERS ONLY WHERE PATTERNS OVERLAP, and the two that do are listed first: the "Page not
   indexable" pair would otherwise be caught by nothing, and the meta-description length rule must be
   tried before the "Missing meta description" rule cannot match it anyway. Kept explicit regardless. */
const RULES: FindingRule[] = [
  /* Indexability — the two that stop the page existing at all, as far as a search engine is
     concerned. Worth being blunt about. */
  { re: /^Page not indexable: Page has noindex directive$/i,
    text: () => 'The page tells search engines not to list it at all' },
  { re: /^Page not indexable: Canonical URL returns (\d+)$/i,
    text: (m) => `The page cannot be listed — the address it points to returns an error (${m[1]})` },

  /* Images. The single most common finding in the whole table, 174 of 613. */
  { re: /^(\d+) images? without alt text$/i,
    text: (m) => `${m[1]} ${plural(m[1], 'image has', 'images have')} no text description behind ${plural(m[1], 'it', 'them')}` },
  { re: /^(\d+) large images? detected$/i,
    text: (m) => `${m[1]} oversized ${plural(m[1], 'image is', 'images are')} slowing the page down` },

  /* Content. Paul's instruction: this must still read as a problem. It does. */
  { re: /^Thin content: only (\d+) words? \(minimum recommended: (\d+)\)$/i,
    text: (m) => `Thin content — only ${m[1]} ${plural(m[1], 'word', 'words')} of text on the page` },
  { re: /^Content requires JavaScript to display$/i,
    text: () => 'The page is empty until scripts run — a reader that does not run them sees nothing' },

  /* Headings. H1 is jargon; "main heading" is not. */
  { re: /^Missing H1 tag$/i, text: () => 'The page has no main heading' },
  { re: /^Missing H(\d) tag$/i, text: (m) => `The page has no level-${m[1]} heading` },
  { re: /^Multiple H1 tags found \((\d+)\)$/i,
    text: (m) => `${m[1]} main headings on one page — there should be exactly one` },
  { re: /^Multiple H(\d) tags found \((\d+)\)$/i,
    text: (m) => `${m[2]} level-${m[1]} headings on one page` },
  { re: /^Skipped heading level: (\d+) → (\d+)$/i,
    text: (m) => `Headings skip a level — straight from ${m[1]} to ${m[2]}` },
  { re: /^H(\d) and Title are not consistent$/i,
    text: () => 'The main heading and the page title say different things' },

  /* Title and description — what a customer actually sees in a result. */
  { re: /^Missing <title> tag$/i, text: () => 'The page has no title' },
  { re: /^Title tag length is (\d+) characters? \(optimal: (\d+)-(\d+)\)$/i,
    text: (m) => `The page title is ${m[1]} characters — ${Number(m[1]) < Number(m[2]) ? 'too short to say what the page is' : 'too long, and will be cut off in results'}` },
  { re: /^Missing meta description$/i,
    text: () => 'No description — nothing fills the summary line under your result' },
  { re: /^Meta description length is (\d+) characters? \(optimal: (\d+)-(\d+)\)$/i,
    text: (m) => `The description is ${m[1]} characters — ${Number(m[1]) < Number(m[2]) ? 'too short' : 'too long, and will be cut off in results'}` },

  /* Machine-readable facts. Meaningless as the scanner words it, so it is rewritten rather than
     kept — exactly the case Paul called out. */
  { re: /^No structured data found$/i,
    text: () => 'No structured data — your business details are not written in the form a machine reads' },
  { re: /^Missing canonical tag$/i,
    text: () => 'No canonical tag — nothing tells a search engine which copy of a page is the real one' },
  { re: /^Missing Open Graph tags$/i,
    text: () => 'No preview title or image when one of your pages is shared' },
  { re: /^Sitemap not found$/i, text: () => 'No sitemap — nothing lists your pages for a crawler' },
  { re: /^robots\.txt not found$/i, text: () => 'No robots.txt file at the root of the site' },

  /* Links and hops. */
  { re: /^(\d+) broken links? detected$/i,
    text: (m) => `${m[1]} ${plural(m[1], 'link goes', 'links go')} to a page that does not exist` },
  { re: /^(\d+) redirects? detected$/i,
    text: (m) => `${m[1]} ${plural(m[1], 'redirect', 'redirects')} before the page loads` },

  /* Phone and security. */
  { re: /^Missing or invalid meta viewport$/i,
    text: () => 'The page does not tell a phone how to size itself' },
  { re: /^Page not optimized for mobile$/i, text: () => 'The page is not built for phone screens' },
  { re: /^HTTPS not configured$/i,
    text: () => 'The site is not on HTTPS — a browser will mark it "not secure"' },

  /* OURS, from an older path. Already plain English; mapped to themselves so the decision is on the
     record rather than resting on the fallback. */
  { re: /^AI can't read your site$/i, text: () => "AI can't read your site" },
  { re: /^You're placed nowhere$/i, text: () => "You're placed nowhere" },
  { re: /^Core basics missing$/i, text: () => 'Core basics missing' },
  { re: /^Social links point to Wix, not you$/i, text: () => 'Social links point to Wix, not you' },
];

/**
 * Rewrite one scanner finding title as a line a client can read.
 *
 * Unrecognised titles are returned unchanged — see the fallback note at the top of this file. The
 * scanner's `detail` is never an input here, because it is never carried this far.
 */
export function plainFinding(title: string): string {
  const t = String(title ?? '').trim();
  if (!t) return '';
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (m) return rule.text(m);
  }
  return t;
}

/** Exported for the test suite, which asserts the census is still fully covered. */
export const FINDING_RULE_COUNT = RULES.length;
