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
    localPresence: SeoCategoryGrade;
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
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function slug(s: string): string {
  return (s || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "business";
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
function gradeCircle(grade: string, score: number | null, size: number, label: string): string {
  const colour = gradeColour(grade);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const frac = score == null ? 1 : clamp100(score) / 100;
  const dash = `${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`;
  const g = (grade || "").trim();
  const fontSize = g.length > 1 ? 32 : 40; // "A+" vs "C"
  return `
        <figure class="gc">
          <svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(label)}: grade ${esc(g)}">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line)" stroke-width="8" />
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="${colour}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${dash}" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="900" fill="${colour}">${esc(g)}</text>
          </svg>
          <figcaption class="gc-lbl">${esc(label)}</figcaption>
        </figure>`;
}

/** Radar/spider chart of the three category scores (0–100) on three axes. Hand-drawn SVG. */
function seoRadar(onPage: number, localPresence: number, contentTechnical: number): string {
  const cx = 160, cy = 118, R = 82;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number, frac: number): [number, number] => [
    cx + R * frac * Math.cos(rad(deg)),
    cy + R * frac * Math.sin(rad(deg)),
  ];
  // Axis 0 top, then clockwise (+120°). Each carries a category + a 1–2 line label.
  const axes = [
    { deg: -90, val: clamp100(onPage), lx: cx, ly: cy - R - 18, lines: ["On-Page SEO"] },
    { deg: 30, val: clamp100(contentTechnical), lx: cx + (R + 40) * Math.cos(rad(30)), ly: cy + (R + 26) * Math.sin(rad(30)), lines: ["Content &", "Technical"] },
    { deg: 150, val: clamp100(localPresence), lx: cx + (R + 40) * Math.cos(rad(150)), ly: cy + (R + 26) * Math.sin(rad(150)), lines: ["Local", "Presence"] },
  ];
  const ring = (frac: number) =>
    axes.map((a) => { const [x, y] = pt(a.deg, frac); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" stroke="var(--line)" stroke-width="1" />`).join("");
  const spokes = axes.map((a) => { const [x, y] = pt(a.deg, 1); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1" />`; }).join("");
  const dataPts = axes.map((a) => { const [x, y] = pt(a.deg, a.val / 100); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const dots = axes.map((a) => { const [x, y] = pt(a.deg, a.val / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--blue)" />`; }).join("");
  const lineH = 11;
  const labels = axes.map((a) => {
    const startY = a.ly - ((a.lines.length - 1) * lineH) / 2;
    const tspans = a.lines.map((ln, i) => `<tspan x="${a.lx.toFixed(1)}" dy="${i === 0 ? 0 : lineH}">${esc(ln)}</tspan>`).join("");
    return `<text x="${a.lx.toFixed(1)}" y="${startY.toFixed(1)}" text-anchor="middle" class="seo-axis">${tspans}</text>`;
  }).join("");
  return `
          <svg class="radar" width="320" height="212" viewBox="0 0 320 212" role="img" aria-label="SEO category scores radar chart">
            ${grid}
            ${spokes}
            <polygon points="${dataPts}" fill="var(--blue)" fill-opacity="0.16" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round" />
            ${dots}
            ${labels}
          </svg>`;
}

const SEV_COLOUR: Record<SeoFinding["severity"], string> = { high: "var(--red)", med: "var(--amber)", low: "var(--faint)" };

/** Build the whole SEO section, or "" when there's no seo data (slot renders nothing). */
function seoSection(seo: AiAuditSeo | undefined): string {
  if (!seo) return "";
  const { overallGrade, categories: c, leadFindings } = seo;
  const overallColour = gradeColour(overallGrade);
  const findings = (leadFindings ?? []).map((f) => `
          <li class="find">
            <span class="find-dot" style="background:${SEV_COLOUR[f.severity] ?? "var(--faint)"}"></span>
            <span class="find-body"><span class="find-title">${esc(f.title)}</span> <span class="find-detail">${esc(f.detail)}</span></span>
          </li>`).join("");
  return `
    <!-- WEBSITE SEO — self-contained SVG grades + radar + findings; renders only when seo present -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">SEO health</div>
      <p class="seo-intro">Your site’s overall SEO grade is <b style="color:${overallColour}">${esc(overallGrade)}</b>. A site can be technically sound and still land here — because AI and search can’t yet establish it as a real, findable business. Here’s what’s holding it back.</p>

      <div class="seo-grades">
        <div class="seo-overall">${gradeCircle(overallGrade, null, 124, "Overall")}</div>
        <div class="seo-cats">
          ${gradeCircle(c.onPage.grade, c.onPage.score, 84, "On-Page SEO")}
          ${gradeCircle(c.localPresence.grade, c.localPresence.score, 84, "Local Presence")}
          ${gradeCircle(c.contentTechnical.grade, c.contentTechnical.score, 84, "Content & Technical")}
        </div>
      </div>

      <div class="seo-viz">
        <div class="seo-radar">${seoRadar(c.onPage.score, c.localPresence.score, c.contentTechnical.score)}</div>
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
      summary = `When someone searched “<span class="gb-q">${esc(g.question)}</span>”, AI didn’t mention <b>${esc(d.businessName)}</b> at all.`;
    } else {
      let list: string;
      if (chips.length === 1) list = more > 0 ? `${chips[0]} and others` : chips[0];
      else if (more > 0) list = `${chips.join(", ")} and others`;
      else list = `${chips.slice(0, -1).join(", ")} and ${chips[chips.length - 1]}`;
      summary = `When someone searched “<span class="gb-q">${esc(g.question)}</span>”, AI recommended ${list} — <b>${esc(d.businessName)}</b> wasn’t mentioned at all.`;
    }
    gutbox = `
    <section class="gutbox">
      <div class="gb-eyebrow">What AI actually said</div>
      <p class="gb-sum">${summary}</p>
      <div class="gb-attr">— ${esc(g.engineLabel)}. ${esc(d.businessName)} was never named.</div>
    </section>`;
  }

  // ── Proof: ONE quiet single-line strip — each engine with a small state marker
  //    (red ✕ when named by none, green ✓ when named) + a tiny count. Understated, no
  //    boxes. Still per-engine before/after proof for the re-run.
  const engineCards = d.perEngine.map((pe) => {
    const hit = pe.named > 0;
    return `<span class="eng"><span class="eng-mark ${hit ? "yes" : "no"}">${hit ? "✓" : "✕"}</span><span class="eng-name">${esc(pe.label)}</span><span class="eng-cnt">${pe.named}/${pe.total}</span></span>`;
  }).join("");

  const shareFoot = d.shareUrl ? ` · <a href="${esc(d.shareUrl)}">View online</a>` : "";

  // Purpose-drawn inline icons for the "What we do" steps — one per step, 2px stroke,
  // consistent weight, brand blue (currentColor inherits var(--blue) from the tile).
  // 1 · Get you listed → stacked directory cards (listings across many sources).
  const icListed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h9"/><rect x="8" y="8" width="12" height="12" rx="2"/><line x1="11" y1="12" x2="17" y2="12"/><line x1="11" y1="16" x2="15" y2="16"/></svg>`;
  // 2 · Structure your info → a schema/node graph (structured data engines can read).
  const icStruct = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="18.5" r="2.4"/><line x1="11" y1="7.1" x2="6.6" y2="16.4"/><line x1="13" y1="7.1" x2="17.4" y2="16.4"/></svg>`;
  // 3 · Get you named → an answer bubble with a star (AI naming you in its reply).
  const icNamed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4V5.5Z"/><path d="M12 7.3l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 13.17l-2.3 1.2.44-2.56-1.86-1.81 2.57-.37Z"/></svg>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Visibility Report — ${esc(d.businessName)}</title>
<style>
  :root{
    --blue:#1a3d7c; --blue-2:#2a5aa8; --yellow:#ffd23f;
    --ink:#0f172a; --muted:#5b6472; --faint:#9aa3b2; --line:#e9edf3;
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

  /* Header band — Findable blue with a yellow wordmark and a wave bottom edge */
  .band{ position:relative; background:var(--blue); color:#fff; padding:26px 40px 40px; }
  .band-row{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .wordmark{ font-size:27px; font-weight:900; letter-spacing:-.02em; color:var(--yellow); }
  .wordmark .dot{ color:#fff; }
  .band-meta{ font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#b9c8e4; font-weight:700; }
  .wave{ position:absolute; left:0; right:0; bottom:-1px; width:100%; height:38px; display:block; }

  /* One-line explainer */
  .explainer{ padding:24px 40px 6px; font-size:19px; line-height:1.42; color:#334155; font-weight:600; max-width:58ch; }
  .explainer b{ color:var(--blue); font-weight:800; }

  /* HERO — balanced two-part: big number/label on the left, the verdict on the right */
  .hero{ display:flex; align-items:stretch; gap:30px; padding:20px 40px 30px; }
  .hero-num{ display:flex; align-items:center; gap:18px; flex:0 0 auto; }
  .num{ font-size:104px; line-height:.82; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); } .num.mid{ color:var(--amber); } .num.high{ color:var(--green); }
  .num-cap{ max-width:24ch; }
  .num-cap .l1{ font-size:22px; font-weight:850; color:var(--ink); line-height:1.1; }
  .num-cap .l2{ font-size:14px; color:var(--muted); margin-top:3px; }
  .hero-rule{ width:1px; background:var(--line); align-self:stretch; }
  .hero-verdict{ flex:1; display:flex; flex-direction:column; justify-content:center; }
  .hero-verdict .vk{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin-bottom:8px; }
  .punch{ font-size:27px; line-height:1.2; font-weight:850; letter-spacing:-.01em; color:var(--ink); }

  /* GUT-PUNCH — a written summary of the worst answer (never the raw AI text) */
  .gutbox{ margin:0 40px 24px; padding:18px 22px; background:#fff5f5; border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  .gb-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--red); font-weight:800; margin-bottom:9px; }
  .gb-sum{ margin:0 0 9px; font-size:20px; line-height:1.42; font-weight:700; color:#3d0f12; }
  .gb-sum .gb-q{ color:var(--ink); font-weight:800; }
  .gb-sum .rv{ color:var(--red); font-weight:850; white-space:nowrap; }
  .gb-sum b{ color:var(--ink); font-weight:850; }
  .gb-attr{ font-size:12px; color:var(--muted); font-weight:600; }

  /* WHY THIS MATTERS — stakes stats, big coloured numbers, muted supporting text */
  .why{ padding:24px 40px 26px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 16px; }
  /* Consistent phase header: tiny eyebrow + human-readable title (pain → stakes → solution) */
  .sec-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 4px; }
  .sec-title{ font-size:22px; line-height:1.15; letter-spacing:-.01em; font-weight:850; color:var(--ink); margin:0 0 16px; }
  /* Solution = THE standout moment: brand-blue headline, bigger + heavier than any other title */
  .dowe .sec-eyebrow{ color:var(--blue); }
  .dowe .sec-title{ font-size:33px; font-weight:900; color:var(--blue); margin:0 0 18px; }
  .stats{ display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  .stat{ display:flex; align-items:flex-start; gap:14px; }
  .stat .big{ font-size:46px; line-height:.9; font-weight:900; letter-spacing:-.03em; color:var(--blue); }
  .stat p{ margin:0; font-size:14px; color:var(--muted); }
  .stat p .was{ color:var(--red); font-weight:900; font-size:17px; }
  .why-frame{ margin:16px 0 0; font-size:17px; font-weight:800; color:var(--ink); max-width:56ch; }
  .why-frame .hl{ color:var(--blue); }
  .src{ margin-top:6px; font-size:11px; color:var(--faint); }

  /* WHAT WE DO — the solution reveal (the money section): a tinted full-width band with a
     heavy brand-blue top rule so it visibly BREAKS from the section above; white card inside. */
  .dowe{ padding:30px 40px 34px; border-top:3px solid var(--blue); background:var(--page); }
  .dowe h2{ margin-bottom:14px; }
  .dowe-panel{ background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:24px 26px 26px; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .dowe-lead{ font-size:17px; font-weight:800; color:var(--ink); margin:0 0 22px; max-width:60ch; }
  .dowe-lead .hl{ color:var(--blue); }
  .steps{ position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
  /* connecting flow line behind the three icon tiles → reads as a process */
  .steps::before{ content:""; position:absolute; top:23px; left:16.67%; right:16.67%; height:2px; background:var(--line); z-index:0; }
  .step{ position:relative; text-align:center; }
  .step-ic{ position:relative; width:46px; height:46px; margin:0 auto 13px; z-index:1; }
  .step .ic{ width:46px; height:46px; border-radius:14px; background:#eaf1fc; color:var(--blue);
    display:flex; align-items:center; justify-content:center; }
  .step .ic svg{ width:25px; height:25px; }
  .badge{ position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%;
    background:var(--blue); color:#fff; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 3px var(--paper); }
  .step-n{ font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .st{ font-size:16px; font-weight:850; color:var(--ink); margin:2px 0 5px; }
  .step p{ margin:0; font-size:13px; line-height:1.45; color:var(--muted); }

  /* PROOF — "Where AI named you": ONE quiet single-line strip (per-engine ✓/✕ + count) */
  .results{ padding:24px 40px 26px; border-top:1px solid var(--line); }
  .eng-row{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 22px; }
  .eng{ display:inline-flex; align-items:center; gap:7px; }
  .eng-mark{ font-size:14px; font-weight:900; line-height:1; } .eng-mark.no{ color:var(--red); } .eng-mark.yes{ color:var(--green); }
  .eng-name{ font-size:14px; font-weight:700; color:var(--ink); }
  .eng-cnt{ font-size:12px; font-weight:700; color:var(--faint); font-variant-numeric:tabular-nums; }

  /* WEBSITE SEO — grade circles + radar + findings (all inline SVG, no chart lib) */
  .seo{ padding:24px 40px 26px; border-top:1px solid var(--line); }
  .seo-intro{ margin:-4px 0 20px; font-size:15px; line-height:1.5; color:var(--muted); font-weight:600; max-width:66ch; }
  .seo-intro b{ font-weight:850; }
  .seo-grades{ display:flex; align-items:center; gap:30px; flex-wrap:wrap; }
  .seo-cats{ display:flex; gap:22px; flex-wrap:wrap; }
  .gc{ margin:0; text-align:center; }
  .gc svg{ display:block; margin:0 auto; }
  .gc-lbl{ margin-top:7px; font-size:11px; font-weight:700; color:var(--muted); max-width:11ch; }
  .seo-overall .gc-lbl{ font-size:12px; color:var(--ink); font-weight:800; }
  .seo-viz{ display:flex; align-items:center; gap:30px; flex-wrap:wrap; margin-top:22px; }
  .seo-radar{ flex:0 0 auto; }
  .radar{ display:block; }
  .seo-axis{ font-size:10px; font-weight:700; fill:var(--muted); }
  .seo-findings{ list-style:none; margin:0; padding:0; flex:1; min-width:250px; }
  .find{ display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); }
  .find:last-child{ border-bottom:0; }
  .find-dot{ width:9px; height:9px; border-radius:50%; margin-top:5px; flex:0 0 auto; }
  .find-title{ font-weight:800; font-size:13.5px; color:var(--ink); }
  .find-detail{ font-size:12.5px; line-height:1.45; color:var(--muted); }

  /* CLOSING CTA — Findable blue band with a yellow highlight */
  .cta{ background:var(--blue); color:#fff; padding:28px 40px 26px; }
  .cta h3{ margin:0 0 8px; font-size:24px; font-weight:850; color:#fff; letter-spacing:-.01em; }
  .cta h3 .y{ color:var(--yellow); }
  .cta p{ margin:0 0 6px; font-size:14px; color:#c7d3ea; max-width:60ch; }
  .cta p b{ color:#fff; }
  .cta .close{ margin-top:10px; font-size:15px; font-weight:800; color:#fff; }

  /* FOOTER — a distinct darker navy bar so the text is clearly readable (no blue-on-blue) */
  .site-foot{ background:var(--foot); padding:14px 40px 16px; }
  .site-foot .row{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
    font-size:11.5px; color:#c7d5ee; font-weight:600; }
  .site-foot .row b{ color:#fff; }
  .site-foot .row a{ color:var(--yellow); text-decoration:none; }
  .site-foot .note{ margin-top:8px; font-size:11px; color:#8fa4c8; }

  @page{ size:A4; margin:11mm; }
  @media print{
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .band,.hero,.gutbox,.why,.dowe,.results,.cta,.site-foot,.seo{ break-inside:avoid; }
    .steps,.eng-row,.stats,.seo-grades,.seo-viz,.dowe-panel{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">AI Visibility Report · ${esc(d.generatedAtLabel)}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" fill="#ffffff"/>
      </svg>
    </header>

    <div class="explainer">We asked AI the questions real customers ask when they’re looking for a <b>${esc(type)}</b>, and checked how often <b>${esc(d.businessName)}</b> came up.</div>

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
    <!-- PROOF — where AI named you (moved up: pain → evidence → stakes → solution) -->
    <section class="results">
      <div class="sec-eyebrow">The evidence</div>
      <div class="sec-title">Where AI named you</div>
      <div class="eng-row">${engineCards}</div>
    </section>

    <!-- ============================================================================
         SEO SECTION SLOT — renders results.seo when present (overall grade + three
         category grades + a radar of the three scores + the lead findings). Renders
         nothing when d.seo is absent, so AI-only audits (e.g. the bar) don't break.
         ============================================================================ -->
${seoSection(d.seo)}

    <!-- WHY THIS MATTERS (stakes) -->
    <section class="why">
      <div class="sec-eyebrow">The stakes</div>
      <div class="sec-title">Why this matters</div>
      <div class="stats">
        <div class="stat">
          <span class="big">45%</span>
          <p>of people used AI like ChatGPT and Gemini to find a local business last year — up from just <span class="was">6%</span> the year before.</p>
        </div>
        <div class="stat">
          <span class="big">37%</span>
          <p>now start their search with AI instead of Google.</p>
        </div>
      </div>
      <p class="why-frame">This is where your customers are <span class="hl">already going</span> — and it’s growing fast.</p>
      <div class="src">Source: BrightLocal, 2026</div>
    </section>

    <!-- WHAT WE DO (solution) — the confident turn from problem to fix -->
    <section class="dowe">
      <div class="sec-eyebrow">The fix</div>
      <div class="sec-title">Here’s how we get you found</div>
      <div class="dowe-panel">
        <p class="dowe-lead">We get you into the sources AI reads — and make sure it can understand and <span class="hl">name you</span>.</p>
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
      <p><b>This is your starting point.</b> We fix what AI says about you — then re-run this exact audit so you see the before &amp; after in black and white.</p>
      <div class="close">Let’s get ${esc(d.businessName)} named when your customers ask.</div>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(d.businessName)}</b></span>
        <span>Findable · AI Visibility Audit · ${esc(d.generatedAtLabel)}${shareFoot}</span>
      </div>
      <div class="note">Example report — a snapshot of where you stand today. We re-run it after we’ve made changes to show your before &amp; after.</div>
    </footer>
  </div>
</body>
</html>`;
}

/** Trigger a browser download of the standalone HTML report. */
export function downloadReportHtml(d: AiAuditReportData): void {
  const html = renderReportHtml(d);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-visibility-report-${slug(d.businessName)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
