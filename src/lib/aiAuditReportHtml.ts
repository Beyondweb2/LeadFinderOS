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

/** Verdict + severity band from the visibility percentage. */
function verdictOf(pct: number, named: number): { band: "crit" | "low" | "mid" | "high"; text: string } {
  if (named === 0) return { band: "crit", text: "When customers ask AI, you’re invisible — it never names you." };
  if (pct < 34) return { band: "low", text: "Low visibility — competitors are the default answer AI gives your customers." };
  if (pct < 67) return { band: "mid", text: "Partial visibility — you’re named some of the time, but there’s a lot of room to grow." };
  return { band: "high", text: "Strong visibility — AI names you in most answers." };
}

/** Build the full standalone one-page HTML document (light, branded, print-ready). */
export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  const v = verdictOf(d.pct, d.named);

  const engineRows = d.perEngine.map((pe) => {
    const w = pe.total ? Math.round((pe.named / pe.total) * 100) : 0;
    const hit = pe.named > 0;
    return `
          <tr>
            <td class="eng">${esc(pe.label)}</td>
            <td class="now">
              <span class="glyph ${hit ? "yes" : "no"}">${hit ? "✓" : "✕"}</span>
              <span class="bar"><i style="width:${w}%"></i></span>
              <b>${pe.named}/${pe.total}</b>
            </td>
            <td class="after"><span class="await">—</span></td>
          </tr>`;
  }).join("");

  const gut = d.gutPunch ? `
      <section class="block gut">
        <div class="eyebrow">What AI is telling your customers</div>
        <div class="q">Someone asked AI: “${esc(d.gutPunch.question)}”</div>
        <blockquote>“${esc(d.gutPunch.text)}”</blockquote>
        <div class="attr">${esc(d.gutPunch.engineLabel)} · ${esc(d.businessName)} wasn’t mentioned</div>
      </section>` : "";

  const comps = d.competitors.length ? `
      <section class="block">
        <div class="eyebrow">AI recommends these instead</div>
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
    --ink:#0f172a; --muted:#64748b; --faint:#94a3b8; --line:#e6eaf0;
    --accent:#2563eb; --accent-soft:#eff6ff;
    --green:#16a34a; --green-soft:#e9f8ee; --red:#dc2626; --red-soft:#fdecec; --amber:#d97706; --amber-soft:#fef6e7;
    --paper:#ffffff; --page:#eef1f6;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; }
  body{ background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:780px; margin:28px auto; background:var(--paper); border-radius:14px; overflow:hidden;
    box-shadow:0 8px 40px rgba(15,23,42,.10); }
  .accentbar{ height:6px; background:linear-gradient(90deg,var(--accent),#60a5fa); }
  .pad{ padding:34px 40px; }

  .hdr{ display:flex; align-items:center; justify-content:space-between; padding:20px 40px 0; }
  .brand{ font-weight:800; font-size:13px; letter-spacing:.02em; color:var(--accent); }
  .brand span{ color:var(--faint); font-weight:600; }
  .date{ font-size:12px; color:var(--faint); }

  .eyebrow{ font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:var(--faint); font-weight:800; margin-bottom:10px; }
  h1{ font-size:30px; line-height:1.2; letter-spacing:-.02em; font-weight:850; margin:6px 0 14px; }
  h1 .biz{ color:var(--accent); }
  h1 .big{ font-size:38px; }
  .verdict{ display:inline-flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .pill{ font-weight:800; font-size:13px; padding:6px 12px; border-radius:999px; white-space:nowrap; }
  .pill.crit,.pill.low{ background:var(--red-soft); color:var(--red); }
  .pill.mid{ background:var(--amber-soft); color:var(--amber); }
  .pill.high{ background:var(--green-soft); color:var(--green); }
  .verdict .say{ font-size:15px; color:var(--muted); font-weight:600; }

  .block{ padding:22px 40px; border-top:1px solid var(--line); }
  h2{ font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:800; margin:0 0 14px; }

  table{ width:100%; border-collapse:collapse; }
  thead th{ text-align:left; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint);
    padding:0 0 8px; border-bottom:1px solid var(--line); font-weight:800; }
  thead th.after{ color:var(--faint); }
  tbody td{ padding:11px 0; border-bottom:1px solid var(--line); vertical-align:middle; }
  tbody tr:last-child td{ border-bottom:0; }
  td.eng{ font-weight:700; font-size:15px; width:34%; }
  td.now{ display:flex; align-items:center; gap:10px; font-variant-numeric:tabular-nums; }
  td.now b{ font-size:14px; color:var(--ink); min-width:34px; }
  td.after{ width:22%; text-align:left; }
  .glyph{ display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:6px; font-weight:900; font-size:12px; }
  .glyph.yes{ background:var(--green-soft); color:var(--green); }
  .glyph.no{ background:var(--red-soft); color:var(--red); }
  .bar{ flex:1; height:8px; border-radius:999px; background:#eef2f7; overflow:hidden; max-width:180px; }
  .bar i{ display:block; height:100%; border-radius:999px; background:var(--green); }
  .await{ color:var(--faint); font-style:italic; font-size:13px; }
  .after-note{ margin-top:12px; font-size:12px; color:var(--faint); }

  .gut{ background:var(--red-soft); border-top:1px solid #f6d5d5; }
  .gut .q{ font-size:13px; color:var(--muted); }
  .gut blockquote{ margin:10px 0 8px; padding:16px 18px; background:#fff; border-left:4px solid var(--red);
    border-radius:0 10px 10px 0; font-size:19px; line-height:1.45; font-weight:600; color:#3f1414; box-shadow:0 2px 12px rgba(220,38,38,.06); }
  .gut .attr{ font-size:12px; color:var(--muted); font-weight:600; }

  .chips{ display:flex; flex-wrap:wrap; gap:8px; }
  .chip{ background:#f4f6fa; border:1px solid var(--line); border-radius:999px; padding:6px 14px; font-size:14px; font-weight:700; }

  .means{ margin:22px 40px 8px; padding:20px 22px; background:var(--accent-soft); border:1px solid #dbe7ff; border-radius:12px; }
  .means h3{ margin:0 0 6px; font-size:14px; color:var(--accent); }
  .means p{ margin:0; font-size:15px; }

  .foot{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
    padding:16px 40px 28px; font-size:12px; color:var(--faint); }
  .foot a{ color:var(--accent); text-decoration:none; }

  @page{ size:A4; margin:14mm; }
  @media print{
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .block,.gut,.means,.hero{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="accentbar"></div>
    <div class="hdr">
      <div class="brand">AI Visibility Report <span>· ${esc(d.businessType.trim() || "local business")}</span></div>
      <div class="date">${esc(d.generatedAtLabel)}</div>
    </div>

    <div class="pad hero">
      <div class="eyebrow">When customers ask AI to recommend a ${esc(type)}</div>
      <h1><span class="biz">${esc(d.businessName)}</span> is named in <span class="big">${d.named}</span> of <span class="big">${d.total}</span> AI answers</h1>
      <div class="verdict">
        <span class="pill ${v.band}">${d.pct}% visibility</span>
        <span class="say">${v.text}</span>
      </div>
    </div>

    <section class="block">
      <h2>Where AI named you</h2>
      <table>
        <thead><tr><th>AI engine</th><th>Now</th><th class="after">After changes</th></tr></thead>
        <tbody>${engineRows}
        </tbody>
      </table>
      <div class="after-note">Once we improve your AI visibility, we re-run this exact audit to fill the “After” column and show your progress.</div>
    </section>
${gut}${comps}
    <div class="means">
      <h3>What this means</h3>
      <p>When people ask AI assistants to recommend a ${esc(type)}, you’re mostly invisible — and other businesses are the answer AI hands your customers. The good news: this is fixable. We can improve what AI says about you, then re-run this exact audit to prove the “after”.</p>
    </div>

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
