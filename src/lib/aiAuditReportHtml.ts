// Client-facing AI Visibility Audit report — shared data shape + a standalone,
// self-contained HTML file for download (inline styles, dark theme, no dependencies).
// Deliberately client-friendly: no engine keys, no JSON, no vendor scores.

export interface ReportEngineRow {
  label: string;   // "ChatGPT", "Gemini", "AI Overview", "Google"
  named: number;   // how many tested questions named the business on this engine
  total: number;   // questions tested on this engine
}

export interface AiAuditReportData {
  businessName: string;
  businessType: string;          // for the "what this means" line; may be ""
  named: number;                 // AI answers that named the business
  total: number;                 // AI answers tested
  pct: number;                   // 0–100
  perEngine: ReportEngineRow[];
  competitors: string[];         // brands AI named instead
  gutPunch: { question: string; engineLabel: string; text: string } | null;
  generatedAtLabel: string;      // e.g. "11 Jul 2026"
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function slug(s: string): string {
  return (s || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "business";
}

/** Build the full standalone HTML document (dark theme, inline CSS, self-contained). */
export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  const engineRows = d.perEngine.map((pe) => `
        <div class="row">
          <span class="eng">${esc(pe.label)}</span>
          <span class="now">${pe.named > 0 ? '<span class="tick">✓</span>' : '<span class="cross">✗</span>'}<b>${pe.named}/${pe.total}</b></span>
          <span class="after">re-run to compare</span>
        </div>`).join("");

  const gut = d.gutPunch ? `
      <section class="card gut">
        <div class="card-title">What AI is telling your customers</div>
        <div class="q">Someone asked AI: &ldquo;${esc(d.gutPunch.question)}&rdquo;</div>
        <blockquote>&ldquo;${esc(d.gutPunch.text)}&rdquo;</blockquote>
        <div class="attr">— ${esc(d.gutPunch.engineLabel)}. ${esc(d.businessName)} wasn&rsquo;t mentioned.</div>
      </section>` : "";

  const comps = d.competitors.length ? `
      <section class="card">
        <div class="card-title">AI names these instead</div>
        <div class="chips">${d.competitors.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
      </section>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Visibility Report — ${esc(d.businessName)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0f1a; color: #e6ebf5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .page { max-width: 720px; margin: 0 auto; padding: 40px 24px 56px; }
  .brand { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #6f7c92; font-weight: 700; }
  h1 { font-size: 30px; line-height: 1.2; margin: 10px 0 6px; font-weight: 800; letter-spacing: -.01em; }
  h1 .biz { color: #3b9cff; }
  .sub { color: #8a94a6; font-size: 15px; margin-bottom: 28px; }
  .card { background: #11182a; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 20px; margin: 16px 0; }
  .card-title { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #8a94a6; font-weight: 700; margin-bottom: 14px; }
  .grid-head, .row { display: grid; grid-template-columns: 1fr 120px 130px; align-items: center; gap: 12px; }
  .grid-head { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #6f7c92; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.07); margin-bottom: 8px; }
  .grid-head .after, .row .after { color: #5a6577; }
  .row { padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .row:last-child { border-bottom: 0; }
  .row .eng { font-weight: 600; font-size: 14px; }
  .row .now { font-variant-numeric: tabular-nums; }
  .row .now b { margin-left: 6px; }
  .row .after { font-size: 12px; font-style: italic; }
  .tick { color: #34d399; font-weight: 800; }
  .cross { color: #f87171; font-weight: 800; }
  .gut blockquote { margin: 10px 0; padding: 14px 16px; border-left: 3px solid #f87171;
    background: rgba(248,113,113,.07); border-radius: 0 8px 8px 0; font-size: 17px; color: #f3f5fa; }
  .gut .q { color: #8a94a6; font-size: 14px; }
  .gut .attr { color: #8a94a6; font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 999px;
    padding: 5px 12px; font-size: 13px; font-weight: 600; }
  .means { margin: 22px 0 0; padding: 18px 20px; border-radius: 14px; background: rgba(59,156,255,.08);
    border: 1px solid rgba(59,156,255,.22); font-size: 15px; }
  .means strong { color: #3b9cff; }
  .footer { margin-top: 32px; color: #5a6577; font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">AI Visibility Report</div>
    <h1>When customers ask AI, <span class="biz">${esc(d.businessName)}</span> is named in ${d.named} of ${d.total} searches</h1>
    <div class="sub">${d.pct}% of the AI answers we tested mentioned you.</div>

    <section class="card">
      <div class="card-title">Where AI named you</div>
      <div class="grid-head"><span>Engine</span><span>Now</span><span class="after">After</span></div>${engineRows}
    </section>
${gut}${comps}
    <div class="means">
      <strong>What this means.</strong> When people ask AI assistants to recommend a ${esc(type)}, you&rsquo;re mostly invisible — and other businesses are the default answer AI gives your customers. The good news: this is fixable. We can improve what AI says about you and then re-run this exact audit to show the &ldquo;after&rdquo;.
    </div>

    <div class="footer">Generated ${esc(d.generatedAtLabel)} · AI Visibility Audit</div>
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
