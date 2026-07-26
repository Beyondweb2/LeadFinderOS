// Client-facing AI Visibility Audit report — shared data shape + a standalone,
// self-contained, PRINT-READY one-page HTML document for download (Findable-branded,
// inline styles, no dependencies). Deliberately client-friendly: no engine keys, no
// JSON, no vendor scores.
//
// renderReportHtml(data) is a PURE function of AiAuditReportData — it's the single
// source of the report design, used by the download AND the in-app preview (rendered
// in an iframe). A future PUBLIC shareable link only has to serve this same function
// with the same data (pass `shareUrl` to surface a "view online" footer) — no rewrite.
//
// Narrative flow is pain → solution → proof: hero verdict, a plain-English summary of
// the worst answer (NOT the raw AI paragraph), why it matters, then WHAT WE DO to fix
// it, then the per-engine proof + CTA.

export interface ReportEngineRow {
  label: string;   // "ChatGPT", "Gemini", "AI Overview", "Google"
  named: number;   // how many tested questions named the business on this engine
  total: number;   // questions tested on this engine
}

/* ── Website SEO section (results.seo) ─────────────────────────────────────────
 * Populated manually for now (not yet from an actor). Renders a self-contained SVG
 * block: overall grade + three category grades + a radar of the three scores + the
 * lead findings. Grades are "A+".."F-" strings; scores 0–100. */
export interface SeoCategoryGrade {
  grade: string;   // "A+".."F-"
  score: number;   // 0–100
}
export interface SeoFinding {
  title: string;
  detail: string;
  severity: "high" | "med" | "low";
}
export interface AiAuditSeo {
  overallGrade: string;                 // "A+".."F-"
  categories: {
    onPage: SeoCategoryGrade;
    contentTechnical: SeoCategoryGrade;
  };
  leadFindings: SeoFinding[];
  // Stored before/after data — NEVER rendered to the client (grades/radar/findings only).
  baseline?: Record<string, unknown>;
}

export interface AiAuditReportData {
  businessName: string;
  businessType: string;          // for copy; may be ""
  named: number;                 // AI answers that named the business
  total: number;                 // AI answers tested
  pct: number;                   // 0–100
  perEngine: ReportEngineRow[];
  competitors: string[];         // real brands AI named instead (aggregate)
  // The single worst example to lead with: the question, the engine, and the REAL
  // competitors AI recommended in that answer. The report writes a clean summary of
  // this — it never dumps the raw AI paragraph.
  gutPunch: { question: string; engineLabel: string; rivals: string[] } | null;
  generatedAtLabel: string;      // e.g. "11 Jul 2026"
  shareUrl?: string;             // reserved: future public link (not built yet)
  seo?: AiAuditSeo;              // optional website-SEO section; slot renders only when present
  /** False when the business has no website at all. The SEO slot then shows what we will BUILD
   *  them instead of rendering nothing: a site is part of the setup, and silence sells nothing. */
  hasWebsite?: boolean;
  /* NO PER-TERM WINNABILITY HERE, DELIBERATELY.
     This is the CUSTOMER report's data contract, and a "winnable" verdict is not something we can
     evidence. Measured over all 402 stored answered questions: 77.6% came back "open" (winnable)
     and 0% ever came back "locked", because the rule fires on `U >= 6` distinct firms named and
     the mean U is 15.3 - so it reads breadth as opportunity, which is backwards. It is also
     noise-driven: 12 of 67 repeated questions (17.9%) changed verdict between identical runs with
     no work done, because U straddles the threshold of 6.
     The field is gone from this type so the renderer cannot show it even by accident. The
     classification still exists (classifyWinnability) and the SPA shows it to the OPERATOR, clearly
     labelled unreliable, so the logic can be worked on. Fixing that logic - multi-run stability,
     inverted thresholds, citation-source analysis - is separate, scoped work. */
}

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Hero verdict: severity band (drives the big number's colour) + a one-line gut-punch. */
function heroVerdict(pct: number, named: number): { band: "crit" | "low" | "mid" | "high"; punch: string } {
  if (named === 0) return { band: "crit", punch: "AI doesn’t know you exist." };
  if (pct < 34) return { band: "low", punch: "AI sends your customers straight to your competitors." };
  if (pct < 67) return { band: "mid", punch: "AI mentions you sometimes — your competitors get the rest." };
  return { band: "high", punch: "AI names you in most answers — let’s make it every time." };
}

/** De-duplicate competitor names (case-insensitive), preserving first-seen order. */
function dedupeNames(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const n = (raw || "").trim();
    if (n && !out.some((u) => u.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

/* ── SEO section rendering (pure SVG + CSS; no chart lib) ──────────────────────── */

/** Grade → colour band. A/B green, C amber, D and below red (uses the report's tokens). */
function gradeColour(grade: string): string {
  const L = (grade || "").trim().charAt(0).toUpperCase();
  if (L === "A" || L === "B") return "var(--green)";
  if (L === "C") return "var(--amber)";
  return "var(--red)"; // D, E, F, or anything unexpected
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** A grade "circle": a ring (coloured arc = score, or full ring when no score) with the
 *  letter grade in the middle, and a caption below. Pure SVG so it survives print/PDF. */
function gradeCircle(grade: string, score: number | null, size: number, label: string, showScore = false): string {
  const colour = gradeColour(grade);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const frac = score == null ? 1 : clamp100(score) / 100;
  const dash = `${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`;
  const g = (grade || "").trim();
  const fontSize = g.length > 1 ? 32 : 40; // "A+" vs "C"
  // Surface the numeric score under sub-grades (data already present) — more useful detail.
  const scoreCap = showScore && score != null ? `<div class="gc-score">${clamp100(score)}/100</div>` : "";
  return `
        <figure class="gc">
          <svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(label)}: grade ${esc(g)}${score != null ? `, score ${clamp100(score)} of 100` : ""}">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line-strong)" stroke-width="8" />
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="${colour}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${dash}" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="900" fill="${colour}">${esc(g)}</text>
          </svg>
          <figcaption class="gc-lbl">${esc(label)}</figcaption>${scoreCap}
        </figure>`;
}

/* ── Report contact details ──────────────────────────────────────────────────────
   The report is Findable-branded, so these should be Findable addresses. They are NOT yet,
   deliberately: findable.uk does not resolve and returns no MX record (checked 2026-07-26), and
   it appears in this repo only as an example inside a comment. Pointing report replies at a
   mailbox that does not exist would lose live leads silently — the same class of failure as a
   dropped payment, just cheaper to miss.

   So: hoisted out of the markup into one obvious place, still working, ready to switch in one
   line the moment a Findable inbox exists. The buttons are labelled "Email us"/"WhatsApp us",
   so neither value is DISPLAYED to the prospect; it is visible only in the link target.
   TODO(paul): set REPORT_CONTACT_EMAIL to the Findable inbox once findable.uk has mail. */
const REPORT_CONTACT_EMAIL = "paul@move37.fun";
const REPORT_CONTACT_WHATSAPP = "447347041545";

const SEV_COLOUR: Record<SeoFinding["severity"], string> = { high: "var(--red)", med: "var(--amber)", low: "var(--muted)" };

/** No website at all: say what we will build, in the SEO slot's place. Distinct from a FAILED
 *  scan (has a website, grade unavailable) which still renders nothing rather than pretending. */
function noWebsiteSection(): string {
  return `
    <!-- NO WEBSITE &mdash; what we will build, where the SEO grade would be -->
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">You don&rsquo;t have a website yet, so we&rsquo;ll build you one.</div>
      <p style="margin:0;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">
        AI can&rsquo;t recommend a business it can&rsquo;t read, and right now there&rsquo;s nothing for it to read.
        We&rsquo;ll build you a simple site that&rsquo;s set up properly for AI from the start: your services,
        your area, your credentials, all written the way AI quotes them. It&rsquo;s included in your setup,
        nothing extra to pay.
      </p>
    </section>`;
}

/** Build the whole SEO section, or "" when there's no seo data (slot renders nothing). */
function seoSection(seo: AiAuditSeo | undefined): string {
  if (!seo) return "";
  const { overallGrade, categories: c, leadFindings } = seo;
  const overallColour = gradeColour(overallGrade);
  const findings = (leadFindings ?? []).map((f) => `
          <li class="find">
            <span class="find-dot" style="background:${SEV_COLOUR[f.severity] ?? "var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${esc(f.title)}</b> <span class="find-detail">${esc(f.detail)}</span></span>
          </li>`).join("");
  return `
    <!-- WEBSITE SEO &mdash; grade circles + tight findings (radar dropped); renders only when seo present -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">How findable is your website?</div>
      <p class="seo-intro">Your site&rsquo;s overall SEO grade is <b style="color:${overallColour}">${esc(overallGrade)}</b>. This scores how well your pages are built for search engines and AI to read - the on-page and technical foundations. Here&rsquo;s what&rsquo;s holding it back.</p>

      <div class="seo-body">
        <div class="seo-grades">
          <div class="seo-overall">${gradeCircle(overallGrade, null, 124, "Overall")}</div>
          <div class="seo-grade-split" aria-hidden="true"></div>
          <div class="seo-cats">
            ${gradeCircle(c.onPage.grade, c.onPage.score, 60, "On-Page SEO", true)}
            ${gradeCircle(c.contentTechnical.grade, c.contentTechnical.score, 60, "Content & Technical", true)}
          </div>
        </div>
        ${findings ? `<ul class="seo-findings">${findings}
        </ul>` : ""}
      </div>
    </section>`;
}

/**
 * Build the full standalone one-page HTML document. Findable-branded (blue + yellow),
 * pain → solution → proof, colour-disciplined: colour (blue / yellow / red) lands only
 * on key words + numbers so they pop; everything else stays muted with generous white
 * space. Purposeful graphics only — no decorative fills.
 */
export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  const v = heroVerdict(d.pct, d.named);

  // ── Gut-punch: a clean SUMMARY of the worst answer, with the competitors AI named
  //    instead. Never the raw AI paragraph.
  let gutbox = "";
  if (d.gutPunch) {
    const g = d.gutPunch;
    const uniq = dedupeNames(g.rivals);
    const shown = uniq.slice(0, 3);
    const more = uniq.length - shown.length;
    const chips = shown.map((c) => `<span class="rv">${esc(c)}</span>`);
    let summary: string;
    if (chips.length === 0) {
      summary = `When someone searched &ldquo;<span class="gb-q">${esc(g.question)}</span>&rdquo;, AI didn&rsquo;t mention <b>${esc(d.businessName)}</b> at all.`;
    } else {
      let list: string;
      if (chips.length === 1) list = more > 0 ? `${chips[0]} and others` : chips[0];
      else if (more > 0) list = `${chips.join(", ")} and others`;
      else list = `${chips.slice(0, -1).join(", ")} and ${chips[chips.length - 1]}`;
      // "When we asked" not "when someone searched": the question is one WE generated and put to
      // the engines, so asserting a real customer typed it is a claim we cannot support.
      summary = `When we asked AI &ldquo;<span class="gb-q">${esc(g.question)}</span>&rdquo;, it recommended ${list} &mdash; <b>${esc(d.businessName)}</b> wasn&rsquo;t mentioned at all.`;
    }
    gutbox = `
    <section class="gutbox">
      <div class="gb-eyebrow">What AI actually said</div>
      <p class="gb-sum">${summary}</p>
      <div class="gb-attr">&mdash; ${esc(g.engineLabel)}. ${esc(d.businessName)} was never named.</div>
    </section>`;
  }

  const shareFoot = d.shareUrl ? ` &middot; <a href="${esc(d.shareUrl)}">View online</a>` : "";

  // Purpose-drawn inline icons for the "What we do" steps — one per step, 2px stroke,
  // consistent weight, brand blue (currentColor inherits var(--blue) from the tile).
  // 1 · Get you listed → stacked directory cards (listings across many sources).
  const icListed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h9"/><rect x="8" y="8" width="12" height="12" rx="2"/><line x1="11" y1="12" x2="17" y2="12"/><line x1="11" y1="16" x2="15" y2="16"/></svg>`;
  // 2 · Structure your info → a schema/node graph (structured data engines can read).
  const icStruct = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="18.5" r="2.4"/><line x1="11" y1="7.1" x2="6.6" y2="16.4"/><line x1="13" y1="7.1" x2="17.4" y2="16.4"/></svg>`;
  // 3 · Get you named → an answer bubble with a star (AI naming you in its reply).
  const icNamed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4V5.5Z"/><path d="M12 7.3l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 13.17l-2.3 1.2.44-2.56-1.86-1.81 2.57-.37Z"/></svg>`;

  // Findable f-mark favicon: blue bg, yellow PATH-DRAWN lowercase "f" (hooked top + crossbar),
  // white dot lower-right. Path-based (NOT SVG <text>) so it renders everywhere - some crawlers
  // don't render <text> in favicons. Carries its own brand mark so the report never falls back to
  // the site-root /favicon.ico (a stale Lovable asset).
  const favicon = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1a3d7c"/><path d="M20 8.5 Q14 8.5 14 13.5 L14 24.5 M9.5 14.8 H18.5" fill="none" stroke="#ffd23f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="22.5" r="2.4" fill="#fff"/></svg>',
  );

  // Personalised one-tap contact links. encodeURIComponent for the URL params (spaces, hyphen,
  // apostrophe, &), then esc() for HTML-attribute safety. Single-param each → no & separator.
  // Addresses come from REPORT_CONTACT_* at the top of this file — one place to change.
  const emailHref = esc(`mailto:${REPORT_CONTACT_EMAIL}?subject=${encodeURIComponent(`AI Visibility - ${d.businessName}`)}`);
  const waHref = esc(`https://wa.me/${REPORT_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${d.businessName} - I saw my AI visibility report and I'm interested.`)}`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="${favicon}" />
<title>AI Visibility Report &mdash; ${esc(d.businessName)}</title>
<style>
  :root{
    --blue:#1a3d7c; --blue-2:#2a5aa8; --yellow:#ffd23f;
    --ink:#0f172a; --muted:#5b6472; --faint:#9aa3b2; --line:#e9edf3;
    --line-strong:#94a3b8; /* darker grey &mdash; for SEO graphics that must stay visible on the --page tint */
    --red:#e11d2a; --amber:#c2820b; --green:#15a34a; --paper:#ffffff; --page:#eef1f6;
    --foot:#102a58;
  }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; }
  body{ background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:760px; margin:24px auto; background:var(--paper); border-radius:14px; overflow:hidden;
    box-shadow:0 8px 40px rgba(15,23,42,.12); }

  /* Header band &mdash; Findable blue with a yellow wordmark and a wave bottom edge */
  .band{ position:relative; background:var(--blue); color:#fff; padding:22px 28px 34px; }
  .band-row{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .wordmark{ font-size:22px; font-weight:900; letter-spacing:-.02em; color:var(--yellow); }
  .wordmark .dot{ color:#fff; }
  .band-meta{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#b9c8e4; font-weight:700; }
  .wave{ position:absolute; left:0; right:0; bottom:-1px; width:100%; height:38px; display:block; }

  /* One-line explainer */
  .explainer{ padding:16px 28px 4px; font-size:17px; line-height:1.4; color:#334155; font-weight:400; max-width:70ch; }
  .explainer b{ color:var(--blue); font-weight:700; }

  /* ── EMPHASIS SYSTEM (one rule, whole document) ───────────────────────────────
     Key WORDS get a consistent accent at weight 850: brand --blue for neutral/positive
     terms (.hl, .explainer b) and --red for loss/negative terms (.rv, .was) &mdash; same
     strength, colour carries the meaning. Key NUMBERS/verdicts stay at 900 in their
     severity/brand colour (hero .num, why .big/.was, SEO grade). --blue holds strong on
     BOTH --paper and the --page tint, so the accent never reads weak in any section. */
  .hl{ color:var(--blue); font-weight:700; }

  /* HERO &mdash; balanced two-part: big number/label on the left, the verdict on the right */
  .hero{ display:flex; align-items:stretch; gap:26px; padding:14px 28px 20px; }
  .hero-num{ display:flex; align-items:center; gap:18px; flex:0 0 auto; }
  .num{ font-size:104px; line-height:.82; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); } .num.mid{ color:var(--amber); } .num.high{ color:var(--green); }
  .num-cap{ max-width:24ch; }
  .num-cap .l1{ font-size:17px; font-weight:700; color:var(--ink); line-height:1.1; }
  .num-cap .l2{ font-size:14px; font-weight:400; color:var(--muted); margin-top:3px; }
  .hero-rule{ width:1px; background:var(--line); align-self:stretch; }
  .hero-verdict{ flex:1; display:flex; flex-direction:column; justify-content:center; }
  .hero-verdict .vk{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin-bottom:8px; }
  .punch{ font-size:22px; line-height:1.2; font-weight:900; letter-spacing:-.01em; color:var(--ink); }

  /* GUT-PUNCH &mdash; a written summary of the worst answer (never the raw AI text) */
  .gutbox{ margin:0 28px 16px; padding:14px 18px; background:#fff5f5; border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  .gb-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--red); font-weight:700; margin-bottom:7px; }
  .gb-sum{ margin:0 0 7px; font-size:14px; line-height:1.4; font-weight:400; color:#3d0f12; }
  .gb-sum .gb-q{ color:var(--ink); font-weight:700; }
  .gb-sum .rv{ color:var(--red); font-weight:700; white-space:normal; }
  .gb-sum b{ color:var(--ink); font-weight:700; }
  .gb-attr{ font-size:11px; color:var(--muted); font-weight:400; }

  /* WHY THIS MATTERS &mdash; stakes stats, big coloured numbers, muted supporting text */
  .why{ padding:18px 28px 18px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 16px; }
  /* Consistent phase header: tiny eyebrow + human-readable title (pain &rarr; stakes &rarr; solution) */
  .sec-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 4px; }
  .sec-title{ font-size:22px; line-height:1.15; letter-spacing:-.01em; font-weight:700; color:var(--ink); margin:0 0 16px; }
  /* Solution = THE standout moment: still the biggest/heaviest title, but standard ink/black
     colour (like every other .sec-title) &mdash; it stands out via its band + size, not colour. */
  .dowe .sec-eyebrow{ color:var(--blue); }
  .dowe .sec-title{ font-size:32px; font-weight:700; color:var(--ink); margin:0 0 18px; }
  .stats{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .stat{ display:flex; align-items:flex-start; gap:14px; }
  .stat .big{ font-size:46px; line-height:.9; font-weight:900; letter-spacing:-.03em; color:var(--blue); }
  .stat p{ margin:0; font-size:14px; font-weight:400; color:var(--muted); }
  .stat p .was{ color:var(--red); font-weight:700; font-size:14px; }
  .why-frame{ margin:12px 0 0; font-size:17px; font-weight:700; color:var(--ink); max-width:64ch; }
  .src{ margin-top:6px; font-size:11px; font-weight:400; color:var(--faint); }

  /* WHAT WE DO &mdash; the solution reveal (the money section): a tinted full-width band with a
     heavy brand-blue top rule so it visibly BREAKS from the section above; white card inside. */
  .dowe{ padding:22px 28px 24px; border-top:3px solid var(--blue); background:var(--page); }
  .dowe h2{ margin-bottom:14px; }
  .dowe-panel{ background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:18px 22px 20px; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .dowe-lead{ font-size:17px; font-weight:700; color:var(--ink); margin:0 0 16px; max-width:64ch; }
  .steps{ position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  /* connecting flow line behind the three icon tiles &rarr; reads as a process */
  .steps::before{ content:""; position:absolute; top:23px; left:16.67%; right:16.67%; height:2px; background:var(--line); z-index:0; }
  .step{ position:relative; text-align:center; }
  .step-ic{ position:relative; width:46px; height:46px; margin:0 auto 13px; z-index:1; }
  .step .ic{ width:46px; height:46px; border-radius:14px; background:#eaf1fc; color:var(--blue);
    display:flex; align-items:center; justify-content:center; }
  .step .ic svg{ width:25px; height:25px; }
  .badge{ position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%;
    background:var(--blue); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 3px var(--paper); }
  .step-n{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; }
  .st{ font-size:14px; font-weight:700; color:var(--ink); margin:2px 0 5px; }
  .step p{ margin:0; font-size:14px; line-height:1.45; font-weight:400; color:var(--muted); }


  /* WEBSITE SEO &mdash; grade circles + radar + findings (all inline SVG, no chart lib).
     Its own QUIET "chapter": a subtle --page tint for depth in the alternating rhythm
     (white hero/gutbox &rarr; tinted SEO &rarr; white 'why' &rarr; the stronger solution band). Kept
     lighter than .dowe &mdash; no blue rule, no white inner card &mdash; so it never competes with
     the solution peak. The white&rarr;tint bg change is the section separator (with the crisp
     --line top edge); the following white 'why' reopens the rhythm. */
  .seo{ padding:18px 28px 18px; border-top:2px solid var(--ink); border-bottom:2px solid var(--ink); background:var(--page); }
  .seo-intro{ margin:-2px 0 12px; font-size:14px; line-height:1.45; color:var(--muted); font-weight:400; max-width:74ch; }
  .seo-intro b{ font-weight:700; } /* the SEO verdict &mdash; bold accent, same as other numbers/verdicts */
  /* Grades ROW (radar dropped to reclaim height): Overall dominant, then the three
     sub-grades as a tidy secondary row past a hairline divider. Findings sit BELOW, full
     width, so they stay tight (1&ndash;2 lines) instead of wrapping in a narrow column. */
  .seo-body{ /* block wrapper: grades row, then full-width findings */ }
  .seo-grades{ display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
  .seo-grade-split{ flex:0 0 auto; width:1px; height:80px; background:var(--line-strong); opacity:.55; }
  .seo-cats{ display:flex; gap:14px; flex-wrap:wrap; }
  .gc{ margin:0; text-align:center; }
  .gc svg{ display:block; margin:0 auto; }
  .gc-lbl{ margin-top:6px; font-size:11px; font-weight:700; color:var(--muted); max-width:11ch; line-height:1.2; }
  .gc-score{ margin-top:2px; font-size:11px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
  .seo-overall{ text-align:center; }
  .seo-overall .gc-lbl{ margin-top:8px; font-size:11px; color:var(--ink); font-weight:700; letter-spacing:.02em; }
  /* FINDINGS &mdash; tight full-width rows: a severity dot + bold title + short detail on the same
     flow. No big padded cards; far less vertical space, still reads as the key takeaways. */
  .seo-findings{ list-style:none; margin:12px 0 0; padding:0; }
  .find{ display:flex; gap:9px; padding:7px 0; border-bottom:1px solid var(--line); }
  .find:first-child{ padding-top:0; }
  .find:last-child{ border-bottom:0; padding-bottom:0; }
  .find-dot{ width:8px; height:8px; border-radius:50%; margin-top:5px; flex:0 0 auto; }
  .find-body{ flex:1; }
  .find-title{ font-weight:700; font-size:14px; color:var(--ink); }
  .find-detail{ font-size:14px; font-weight:400; line-height:1.45; color:var(--muted); }

  /* CLOSING CTA &mdash; Findable blue band with a yellow highlight */
  .cta{ background:var(--blue); color:#fff; padding:20px 28px 20px; }
  .cta h3{ margin:0 0 7px; font-size:22px; font-weight:700; color:#fff; letter-spacing:-.01em; }
  .cta h3 .y{ color:var(--yellow); }
  .cta p{ margin:0 0 6px; font-size:14px; font-weight:400; color:#c7d3ea; max-width:66ch; }
  .cta p b{ color:#fff; font-weight:700; }
  .cta .close{ margin-top:10px; font-size:14px; font-weight:700; color:#fff; }
  /* Contact buttons — side by side, stacking on narrow screens. On-palette (yellow + white). */
  .cta-actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; }
  .cta-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:13px 22px; border-radius:10px; font-size:15px; font-weight:700; line-height:1;
    text-decoration:none; border:1px solid transparent; }
  .cta-btn.email{ background:var(--yellow); color:var(--blue); }
  .cta-btn.wa{ background:#fff; color:var(--blue); }

  /* FOOTER &mdash; a distinct darker navy bar so the text is clearly readable (no blue-on-blue) */
  .site-foot{ background:var(--foot); padding:12px 28px 14px; }
  .site-foot .row{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
    font-size:11px; color:#c7d5ee; font-weight:400; }
  .site-foot .row b{ color:#fff; font-weight:700; }
  .site-foot .row a{ color:var(--yellow); text-decoration:none; }
  .site-foot .note{ margin-top:8px; font-size:11px; font-weight:400; color:#8fa4c8; }

  /* MOBILE (~phones) — the report is opened mostly on phones via a WhatsApp link. Stack the
     multi-column sections, fix the hero's non-shrinking number block, make the CTA full-width
     tappable, and reclaim width by trimming the 28px side padding. Desktop/tablet + print
     (below) are untouched. */
  @media (max-width:560px){
    .sheet{ margin:12px; }
    /* Reclaim width: 28px side padding → 18px on every full-bleed section. */
    .band{ padding-left:18px; padding-right:18px; }
    .explainer{ padding-left:18px; padding-right:18px; }
    .hero{ padding-left:18px; padding-right:18px; }
    .gutbox{ margin-left:18px; margin-right:18px; }
    .why{ padding-left:18px; padding-right:18px; }
    .dowe{ padding-left:18px; padding-right:18px; }
    .seo{ padding-left:18px; padding-right:18px; }
    .cta{ padding-left:18px; padding-right:18px; }
    .site-foot{ padding-left:18px; padding-right:18px; }
    /* 1 · Hero stacks: number+caption on top, verdict below; drop the vertical rule. */
    .hero{ flex-direction:column; gap:14px; }
    .hero-num{ align-items:flex-start; }
    .hero-rule{ display:none; }
    .num{ font-size:72px; }
    /* 2 · Fix steps → single column; hide the horizontal connector line. */
    .steps{ grid-template-columns:1fr; gap:14px; }
    .steps::before{ display:none; }
    /* 3 · Stakes stats → single column. */
    .stats{ grid-template-columns:1fr; }
    /* 4 · Contact buttons → stacked, full-width, comfortable tap target. */
    .cta-actions{ flex-direction:column; }
    .cta-btn{ width:100%; min-height:44px; }
    /* 6 · Hide the stray vertical grade divider when the SEO grades wrap. */
    .seo-grade-split{ display:none; }
  }

  @page{ size:A4; margin:10mm; }
  @media print{
    /* Force backgrounds (blue header band, section tints, CTA, footer, dots, icon tiles) to
       print WITHOUT the user ticking Chrome's "Background graphics" &mdash; exact colour adjust. */
    html,body,.sheet,.band,.hero,.gutbox,.why,.dowe,.cta,.site-foot,.seo,.find-dot,.step .ic{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .band,.hero,.gutbox,.why,.dowe,.cta,.site-foot,.seo{ break-inside:avoid; }
    .steps,.stats,.seo-grades,.seo-body,.dowe-panel{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">AI Visibility Report &middot; ${esc(d.generatedAtLabel)}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" fill="#ffffff"/>
      </svg>
    </header>

    <div class="explainer">We asked AI the kinds of questions customers ask when they&rsquo;re looking for a <b>${esc(type)}</b>, and checked how often <b>${esc(d.businessName)}</b> came up.</div>

    <!-- HERO -->
    <div class="hero">
      <div class="hero-num">
        <span class="num ${v.band}">${d.named}</span>
        <div class="num-cap">
          <div class="l1">times ${esc(d.businessName)} showed up in AI search</div>
          <div class="l2">out of ${d.total} answers</div>
        </div>
      </div>
      <div class="hero-rule"></div>
      <div class="hero-verdict">
        <div class="vk">The verdict</div>
        <div class="punch">${v.punch}</div>
      </div>
    </div>
${gutbox}
    <!-- ============================================================================
         SEO SECTION SLOT &mdash; renders results.seo when present (overall grade + three
         category grades + a radar of the three scores + the lead findings). Renders
         nothing when d.seo is absent, so AI-only audits (e.g. the bar) don't break.
         ============================================================================ -->
${d.seo ? seoSection(d.seo) : d.hasWebsite === false ? noWebsiteSection() : ""}

    <!-- WHY THIS MATTERS (stakes) -->
    <section class="why">
      <div class="sec-eyebrow">The stakes</div>
      <div class="sec-title">Why this matters</div>
      <div class="stats">
        <div class="stat">
          <span class="big">45%</span>
          <p>of people used AI like ChatGPT and Gemini to find a local business last year &mdash; up from just <span class="was">6%</span> the year before.</p>
        </div>
        <div class="stat">
          <span class="big">37%</span>
          <p>now start their search with AI instead of Google.</p>
        </div>
      </div>
      <p class="why-frame">This is where your customers are <span class="hl">already going</span> &mdash; and it&rsquo;s growing fast.</p>
      <div class="src">Source: BrightLocal, 2026</div>
    </section>

    <!-- WHAT WE DO (solution) &mdash; the confident turn from problem to fix -->
    <section class="dowe">
      <div class="sec-eyebrow">The fix</div>
      <div class="sec-title">Here&rsquo;s how we get you found</div>
      <div class="dowe-panel">
        <p class="dowe-lead">We get you into the sources AI reads &mdash; and make sure it can understand and <span class="hl">name you</span>.</p>
        <div class="steps">
          <div class="step">
            <div class="step-ic"><span class="ic">${icListed}</span><span class="badge">1</span></div>
            <div class="step-n">Step 1</div>
            <div class="st">Get you listed</div>
            <p>We put you in the directories, maps and review sites AI pulls its answers from.</p>
          </div>
          <div class="step">
            <div class="step-ic"><span class="ic">${icStruct}</span><span class="badge">2</span></div>
            <div class="step-n">Step 2</div>
            <div class="st">Structure your info</div>
            <p>We mark up your details so AI understands who you are, what you do and where.</p>
          </div>
          <div class="step">
            <div class="step-ic"><span class="ic">${icNamed}</span><span class="badge">3</span></div>
            <div class="step-n">Step 3</div>
            <div class="st">Get you named</div>
            <p>So when your customers ask AI, your name is the one that comes up.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta">
      <h3>Ready to get <span class="y">found</span>?</h3>
      <p><b>This is your starting point.</b> We fix what AI says about you &mdash; then re-run this exact audit so you see the before &amp; after in black and white.</p>
      <div class="close">Let&rsquo;s get ${esc(d.businessName)} named when your customers ask.</div>
      <div class="cta-actions">
        <a class="cta-btn email" href="${emailHref}" target="_blank" rel="noopener noreferrer">Email us</a>
        <a class="cta-btn wa" href="${waHref}" target="_blank" rel="noopener noreferrer">WhatsApp us</a>
      </div>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(d.businessName)}</b></span>
        <span>Findable &middot; AI Visibility Audit &middot; ${esc(d.generatedAtLabel)}${shareFoot}</span>
      </div>
      <div class="note">A snapshot of where you stand today. We re-run it after we&rsquo;ve made changes to show your before &amp; after.</div>
    </footer>
  </div>
</body>
</html>`;
}

