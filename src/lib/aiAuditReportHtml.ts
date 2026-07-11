// Client-facing AI Visibility Audit report — shared data shape + a standalone,
// self-contained, PRINT-READY one-page HTML document for download (light/branded,
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
 * Build the full standalone one-page HTML document. Inverted pyramid, colour-disciplined:
 * the ONLY loud colour is red — the giant hero number, the gut-punch accent, and the
 * engine ✕s. Everything else stays quiet/muted so the loud things actually pop.
 */
export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  const v = heroVerdict(d.pct, d.named);

  const engineRows = d.perEngine.map((pe) => {
    const hit = pe.named > 0;
    return `
          <tr>
            <td class="eng">${esc(pe.label)}</td>
            <td class="now">
              <span class="glyph ${hit ? "yes" : "no"}">${hit ? "✓" : "✕"}</span>
              <span class="count">${pe.named} of ${pe.total}</span>
            </td>
            <td class="after"><span class="await">— re-run to compare</span></td>
          </tr>`;
  }).join("");

  // The gut-punch is the hero exhibit — sits directly under the score, before the table.
  const exhibit = d.gutPunch ? `
    <section class="exhibit">
      <div class="ex-label">When someone searched “${esc(d.gutPunch.question)}”, here’s what AI told them:</div>
      <blockquote class="ex-quote">“${esc(d.gutPunch.text)}”</blockquote>
      <div class="ex-attr">— ${esc(d.gutPunch.engineLabel)}. ${esc(d.businessName)} was never mentioned.</div>
    </section>` : "";

  const comps = d.competitors.length ? `
    <section class="block">
      <h2>AI recommends these instead</h2>
      <div class="chips">${d.competitors.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
    </section>` : "";

  const shareFoot = d.shareUrl ? ` · <a href="${esc(d.shareUrl)}">View online</a>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Visibility Report — ${esc(d.businessName)}</title>
<style>
  :root{
    --ink:#0f172a; --muted:#5b6472; --faint:#9aa3b2; --line:#e9edf3;
    --red:#e11d2a; --red-soft:#fff1f1; --amber:#c2820b; --green:#15a34a;
    --dark:#0f172a; --paper:#ffffff; --page:#eef1f6;
  }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; }
  body{ background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:760px; margin:24px auto; background:var(--paper); border-radius:14px; overflow:hidden;
    box-shadow:0 8px 40px rgba(15,23,42,.10); }

  /* Quiet header */
  .hdr{ display:flex; align-items:center; justify-content:space-between; padding:20px 40px 0; }
  .brand{ font-weight:800; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
  .date{ font-size:12px; color:var(--faint); }

  /* HERO — the loudest thing on the page */
  .hero{ padding:26px 40px 30px; }
  .kicker{ font-size:13px; color:var(--muted); font-weight:600; margin-bottom:6px; }
  .kicker b{ color:var(--ink); font-weight:800; }
  .score{ display:flex; align-items:baseline; gap:16px; margin:2px 0 12px; }
  .num{ font-size:104px; line-height:.92; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); }
  .num.mid{ color:var(--amber); }
  .num.high{ color:var(--green); }
  .denom{ font-size:19px; font-weight:700; color:var(--muted); }
  .denom small{ display:block; font-size:13px; font-weight:600; color:var(--faint); }
  .punch{ font-size:26px; line-height:1.25; font-weight:850; letter-spacing:-.01em; color:var(--ink); max-width:44ch; }

  /* GUT-PUNCH EXHIBIT — big, red-accented, right under the hero */
  .exhibit{ margin:0 40px 26px; padding:20px 22px; background:var(--red-soft); border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  .ex-label{ font-size:13px; color:var(--muted); font-weight:600; margin-bottom:8px; }
  .ex-quote{ margin:0 0 8px; font-size:23px; line-height:1.4; font-weight:700; color:#3d0f12; }
  .ex-attr{ font-size:12px; color:var(--muted); font-weight:600; }

  /* Sections — quiet */
  .block{ padding:20px 40px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 12px; }

  table{ width:100%; border-collapse:collapse; }
  thead th{ text-align:left; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint);
    padding:0 0 8px; border-bottom:1px solid var(--line); font-weight:800; }
  tbody td{ padding:12px 0; border-bottom:1px solid var(--line); vertical-align:middle; }
  tbody tr:last-child td{ border-bottom:0; }
  td.eng{ font-weight:700; font-size:15px; width:40%; color:var(--ink); }
  td.now{ display:flex; align-items:center; gap:12px; }
  td.now .count{ font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
  td.after{ width:30%; }
  /* Bold, alarming ✕ (red) / quiet ✓ (green) — the crosses are meant to pop */
  .glyph{ font-size:22px; font-weight:900; line-height:1; }
  .glyph.no{ color:var(--red); }
  .glyph.yes{ color:var(--green); }
  .await{ color:var(--faint); font-style:italic; font-size:12px; }
  .after-note{ margin-top:12px; font-size:12px; color:var(--faint); }

  .chips{ display:flex; flex-wrap:wrap; gap:8px; }
  .chip{ background:#f5f6f9; border:1px solid var(--line); border-radius:999px; padding:5px 13px; font-size:13px; font-weight:600; color:var(--muted); }

  .means{ padding:20px 40px; border-top:1px solid var(--line); }
  .means p{ margin:0; font-size:14px; color:var(--muted); max-width:64ch; }
  .means p b{ color:var(--ink); font-weight:700; }

  /* CLOSING CTA — strong close via dark contrast, not competing colour */
  .cta{ margin-top:6px; background:var(--dark); color:#e6ebf3; padding:26px 40px; }
  .cta h3{ margin:0 0 8px; font-size:22px; font-weight:850; color:#fff; letter-spacing:-.01em; }
  .cta p{ margin:0 0 6px; font-size:14px; color:#aeb7c6; max-width:60ch; }
  .cta .close{ margin-top:10px; font-size:15px; font-weight:700; color:#fff; }

  .foot{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
    padding:14px 40px; font-size:12px; color:var(--faint); }
  .foot a{ color:var(--muted); text-decoration:none; }

  @page{ size:A4; margin:12mm; }
  @media print{
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .hero,.exhibit,.block,.means,.cta{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="brand">AI Visibility Report</div>
      <div class="date">${esc(d.generatedAtLabel)}</div>
    </div>

    <div class="hero">
      <div class="kicker">When customers ask AI to recommend a ${esc(type)}, <b>${esc(d.businessName)}</b> is named in…</div>
      <div class="score">
        <span class="num ${v.band}">${d.named}</span>
        <span class="denom">of ${d.total}<small>AI answers we tested</small></span>
      </div>
      <div class="punch">${v.punch}</div>
    </div>
${exhibit}
    <section class="block">
      <h2>Where AI named you</h2>
      <table>
        <thead><tr><th>AI engine</th><th>Now</th><th>After changes</th></tr></thead>
        <tbody>${engineRows}
        </tbody>
      </table>
      <div class="after-note">Once we improve your AI visibility, we re-run this exact audit to fill the “After” column.</div>
    </section>
${comps}
    <div class="means">
      <p><b>What this means.</b> When people ask AI to recommend a ${esc(type)}, you’re mostly invisible — and other businesses are the answer it hands your customers. This is fixable.</p>
    </div>

    <section class="cta">
      <h3>Ready to get found?</h3>
      <p>We fix what AI says about you — then re-run this exact audit so you can see the before/after in black and white.</p>
      <div class="close">Let’s get ${esc(d.businessName)} named when your customers ask.</div>
    </section>

    <div class="foot">
      <span>Prepared for ${esc(d.businessName)}</span>
      <span>AI Visibility Audit · ${esc(d.generatedAtLabel)}${shareFoot}</span>
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
