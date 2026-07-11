// Client-facing AI Visibility Audit report — shared data shape + a standalone,
// self-contained, PRINT-READY one-page HTML document for download (Findable-branded,
// inline styles, no dependencies). Deliberately client-friendly: no engine keys, no
// JSON, no vendor scores.
//
// renderReportHtml(data) is a PURE function of AiAuditReportData — it's the single
// source of the report design, used by the download AND the in-app preview (rendered
// in an iframe). A future PUBLIC shareable link only has to serve this same function
// with the same data (pass `shareUrl` to surface a "view online" footer) — no rewrite.

export interface ReportEngineRow {
  label: string;   // "ChatGPT", "Gemini", "AI Overview", "Google"
  named: number;   // how many tested questions named the business on this engine
  total: number;   // questions tested on this engine
}

export interface AiAuditReportData {
  businessName: string;
  businessType: string;          // for copy; may be ""
  named: number;                 // AI answers that named the business
  total: number;                 // AI answers tested
  pct: number;                   // 0–100
  perEngine: ReportEngineRow[];
  competitors: string[];         // real brands AI named instead
  gutPunch: { question: string; engineLabel: string; text: string } | null;
  generatedAtLabel: string;      // e.g. "11 Jul 2026"
  shareUrl?: string;             // reserved: future public link (not built yet)
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

/**
 * Build the full standalone one-page HTML document. Findable-branded (blue + yellow),
 * inverted pyramid, colour-disciplined: colour (blue / yellow / red) lands only on key
 * words + numbers so they pop; everything else stays muted with generous white space.
 */
export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  const v = heroVerdict(d.pct, d.named);

  const engineRows = d.perEngine.map((pe) => {
    const hit = pe.named > 0;
    return `
          <tr>
            <td class="eng">${esc(pe.label)}</td>
            <td class="now"><span class="glyph ${hit ? "yes" : "no"}">${hit ? "✓" : "✕"}</span><span class="count">${pe.named} of ${pe.total}</span></td>
            <td class="after"><span class="await">— re-run to compare</span></td>
          </tr>`;
  }).join("");

  const exhibit = d.gutPunch ? `
    <section class="exhibit">
      <div class="ex-label">When someone searched “${esc(d.gutPunch.question)}”, here’s what AI told them:</div>
      <blockquote class="ex-quote">“${esc(d.gutPunch.text)}”</blockquote>
      <div class="ex-attr">— ${esc(d.gutPunch.engineLabel)}. ${esc(d.businessName)} was never mentioned.</div>
    </section>` : "";

  const comps = d.competitors.length ? `
    <div class="comps"><span class="comps-l">AI pointed customers to these instead:</span> ${d.competitors.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : "";

  const shareFoot = d.shareUrl ? ` · <a href="${esc(d.shareUrl)}">View online</a>` : "";

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
  .explainer{ padding:22px 40px 4px; font-size:16px; color:var(--muted); max-width:64ch; }
  .explainer b{ color:var(--ink); font-weight:800; }

  /* HERO */
  .hero{ padding:14px 40px 26px; }
  .score{ display:flex; align-items:center; gap:20px; }
  .num{ font-size:100px; line-height:.86; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); } .num.mid{ color:var(--amber); } .num.high{ color:var(--green); }
  .score-txt .l1{ font-size:24px; font-weight:850; color:var(--ink); }
  .score-txt .l2{ font-size:15px; color:var(--muted); }
  .punch{ margin-top:14px; font-size:26px; line-height:1.22; font-weight:850; letter-spacing:-.01em; color:var(--ink); max-width:44ch; }

  /* Gut-punch exhibit */
  .exhibit{ margin:0 40px 22px; padding:18px 20px; background:#fff1f1; border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  .ex-label{ font-size:13px; color:var(--muted); font-weight:600; margin-bottom:8px; }
  .ex-quote{ margin:0 0 8px; font-size:22px; line-height:1.4; font-weight:700; color:#3d0f12; }
  .ex-attr{ font-size:12px; color:var(--muted); font-weight:600; }
  .comps{ margin:0 40px 22px; font-size:13px; color:var(--muted); }
  .comps-l{ font-weight:600; margin-right:4px; }
  .chip{ display:inline-block; background:#f5f6f9; border:1px solid var(--line); border-radius:999px; padding:3px 11px; font-size:13px; font-weight:600; color:var(--ink); margin:2px 2px 0 0; }

  /* WHY THIS MATTERS — pain stats, big coloured numbers, muted supporting text */
  .why{ padding:22px 40px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 16px; }
  .stats{ display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  .stat{ display:flex; align-items:flex-start; gap:14px; }
  .stat .big{ font-size:46px; line-height:.9; font-weight:900; letter-spacing:-.03em; color:var(--blue); }
  .stat p{ margin:0; font-size:14px; color:var(--muted); }
  .stat p .was{ color:var(--red); font-weight:900; font-size:17px; }
  .why-frame{ margin:16px 0 0; font-size:17px; font-weight:800; color:var(--ink); max-width:56ch; }
  .why-frame .hl{ color:var(--blue); }
  .src{ margin-top:6px; font-size:11px; color:var(--faint); }

  /* Engine table */
  .block{ padding:20px 40px; border-top:1px solid var(--line); }
  table{ width:100%; border-collapse:collapse; }
  thead th{ text-align:left; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint);
    padding:0 0 8px; border-bottom:1px solid var(--line); font-weight:800; }
  tbody td{ padding:12px 0; border-bottom:1px solid var(--line); vertical-align:middle; }
  tbody tr:last-child td{ border-bottom:0; }
  td.eng{ font-weight:700; font-size:15px; width:40%; color:var(--ink); }
  td.now{ display:flex; align-items:center; gap:12px; }
  td.now .count{ font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
  td.after{ width:30%; }
  .glyph{ font-size:22px; font-weight:900; line-height:1; } .glyph.no{ color:var(--red); } .glyph.yes{ color:var(--green); }
  .await{ color:var(--faint); font-style:italic; font-size:12px; }
  .after-note{ margin-top:12px; font-size:12px; color:var(--faint); }

  /* CLOSING CTA — Findable blue band with a yellow highlight */
  .cta{ background:var(--blue); color:#fff; padding:26px 40px; }
  .cta h3{ margin:0 0 8px; font-size:23px; font-weight:850; color:#fff; letter-spacing:-.01em; }
  .cta h3 .y{ color:var(--yellow); }
  .cta p{ margin:0 0 6px; font-size:14px; color:#c7d3ea; max-width:60ch; }
  .cta .close{ margin-top:10px; font-size:15px; font-weight:800; color:#fff; }

  .foot{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 40px; font-size:12px; color:var(--faint); }
  .foot a{ color:var(--muted); text-decoration:none; }

  @page{ size:A4; margin:11mm; }
  @media print{
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .band,.hero,.exhibit,.why,.block,.cta{ break-inside:avoid; }
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

    <div class="hero">
      <div class="score">
        <span class="num ${v.band}">${d.named}</span>
        <div class="score-txt">
          <div class="l1">times you showed up</div>
          <div class="l2">out of ${d.total} answers, when customers asked AI</div>
        </div>
      </div>
      <div class="punch">${v.punch}</div>
    </div>
${exhibit}${comps}
    <section class="why">
      <h2>Why this matters</h2>
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

    <section class="block">
      <h2>Where AI named you</h2>
      <table>
        <thead><tr><th>AI engine</th><th>Now</th><th>After changes</th></tr></thead>
        <tbody>${engineRows}
        </tbody>
      </table>
      <div class="after-note">Once we improve your AI visibility, we re-run this exact audit to fill the “After” column.</div>
    </section>

    <!-- ============================================================================
         SEO SECTION SLOT — reserved. Render results.seo here once it's proven on a real
         site: overall A–F grade + the three category grades (Local Presence / On-Page SEO
         / Content & Technical) with their failed findings. Not built yet (data unproven).
         ============================================================================ -->

    <section class="cta">
      <h3>Ready to get <span class="y">found</span>?</h3>
      <p>We fix what AI says about you — then re-run this exact audit so you can see the before/after in black and white.</p>
      <div class="close">Let’s get ${esc(d.businessName)} named when your customers ask.</div>
    </section>

    <div class="foot">
      <span>Prepared for ${esc(d.businessName)}</span>
      <span>Findable · AI Visibility Audit${shareFoot}</span>
    </div>
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
