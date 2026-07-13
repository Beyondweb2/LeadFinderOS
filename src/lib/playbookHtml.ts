// Client/internal delivery-playbook renderer — a standalone, self-contained, PRINT-READY
// HTML document (Findable-branded, inline CSS/SVG, no dependencies). Visual sibling of
// aiAuditReportHtml.ts: reuses the same :root tokens + header band.
//
// renderPlaybookHtml(data, view) is a PURE function of PlaybookData + a view selector:
//   - "internal": our execution checklist — per-week internalActions (action/why/pillar/dep).
//   - "client":   a softer roadmap — per-week clientSummary only (no internal/technical talk).
// One generated plan, two registers. Used by the in-app iframe preview AND the download.

export interface PlaybookInternalAction {
  action: string;
  why: string;
  pillar: string;
  dependsOn?: string;
}
export interface PlaybookWeek {
  window: string;              // "Week 0" | "Weeks 1-2" | "Weeks 2-4" | "Week 4" | "Weeks 5-8" | "Week 8"
  goal: string;
  internalActions: PlaybookInternalAction[];
  clientSummary: string;
}
export interface PlaybookDirectory {
  name: string;
  why: string;
}
export interface PlaybookData {
  businessName: string;
  vertical: string;
  summary: string;
  weeks: PlaybookWeek[];
  quickWins: string[];
  directories: PlaybookDirectory[];
  timelineNote: string;
  guaranteeNote: string;
}
export type PlaybookView = "internal" | "client";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Build the standalone playbook HTML for the chosen view. */
export function renderPlaybookHtml(d: PlaybookData, view: PlaybookView): string {
  const internal = view === "internal";
  const viewLabel = internal ? "Internal delivery plan" : "Your roadmap";

  const weeks = (d.weeks ?? []).map((w) => {
    const body = internal
      ? `<ul class="acts">${
          (w.internalActions ?? []).map((a) => `
            <li class="act">
              <div class="act-top"><span class="act-do">${esc(a.action)}</span><span class="pillar">${esc(a.pillar)}</span></div>
              <div class="act-why">${esc(a.why)}</div>
              ${a.dependsOn ? `<div class="act-dep">Depends on: ${esc(a.dependsOn)}</div>` : ""}
            </li>`).join("")
        }</ul>`
      : `<p class="wk-client">${esc(w.clientSummary)}</p>`;
    return `
      <section class="wk">
        <div class="wk-rail"><span class="wk-dot"></span></div>
        <div class="wk-body">
          <div class="wk-win">${esc(w.window)}</div>
          <div class="wk-goal">${esc(w.goal)}</div>
          ${body}
        </div>
      </section>`;
  }).join("");

  const quickWins = (d.quickWins ?? []).length
    ? `<section class="block">
        <div class="sec-eyebrow">Quick wins</div>
        <div class="sec-title">First moves</div>
        <ul class="qw">${(d.quickWins ?? []).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
      </section>`
    : "";

  const directories = (d.directories ?? []).length
    ? `<section class="block tint">
        <div class="sec-eyebrow">Where AI reads</div>
        <div class="sec-title">Authority listings for ${esc(d.vertical || "your sector")}</div>
        <ul class="dirs">${(d.directories ?? []).map((x) => `
          <li class="dir"><span class="dir-name">${esc(x.name)}</span><span class="dir-why">${esc(x.why)}</span></li>`).join("")}</ul>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Delivery Playbook — ${esc(d.businessName)}</title>
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

  /* Header band — matches the report */
  .band{ position:relative; background:var(--blue); color:#fff; padding:26px 40px 40px; }
  .band-row{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .wordmark{ font-size:27px; font-weight:900; letter-spacing:-.02em; color:var(--yellow); }
  .wordmark .dot{ color:#fff; }
  .band-meta{ font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#b9c8e4; font-weight:700; }
  .wave{ position:absolute; left:0; right:0; bottom:-1px; width:100%; height:38px; display:block; }

  /* Internal-only banner */
  .internal-flag{ background:#fff5f5; color:var(--red); font-size:11px; font-weight:800; letter-spacing:.08em;
    text-transform:uppercase; padding:8px 40px; border-bottom:1px solid var(--line); }

  /* For-business header + summary */
  .head{ padding:24px 40px 6px; }
  .head .for{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .head h1{ margin:4px 0 2px; font-size:26px; font-weight:900; letter-spacing:-.02em; color:var(--ink); }
  .head .vert{ font-size:13px; color:var(--muted); font-weight:600; }
  .summary{ padding:12px 40px 20px; font-size:16px; line-height:1.5; color:#334155; font-weight:600; max-width:64ch; }

  /* Consistent section headers */
  .sec-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 4px; }
  .sec-title{ font-size:22px; line-height:1.15; letter-spacing:-.01em; font-weight:850; color:var(--ink); margin:0 0 16px; }

  /* 8-week timeline */
  .timeline{ padding:20px 40px 8px; border-top:1px solid var(--line); }
  .timeline-h{ margin-bottom:6px; }
  .wk{ display:flex; gap:16px; }
  .wk-rail{ position:relative; flex:0 0 auto; width:14px; }
  .wk-rail::before{ content:""; position:absolute; left:6px; top:0; bottom:0; width:2px; background:var(--line); }
  .wk:last-child .wk-rail::before{ bottom:auto; height:22px; }
  .wk-dot{ position:relative; z-index:1; display:block; width:14px; height:14px; margin-top:4px; border-radius:50%;
    background:var(--blue); box-shadow:0 0 0 3px var(--paper); }
  .wk-body{ flex:1; padding-bottom:22px; }
  .wk-win{ font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--blue); font-weight:800; }
  .wk-goal{ font-size:17px; font-weight:850; color:var(--ink); margin:1px 0 10px; }
  .wk-client{ margin:0; font-size:14px; line-height:1.55; color:var(--muted); max-width:64ch; }
  .acts{ list-style:none; margin:0; padding:0; }
  .act{ padding:9px 0; border-bottom:1px solid var(--line); }
  .act:last-child{ border-bottom:0; }
  .act-top{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .act-do{ font-size:14px; font-weight:800; color:var(--ink); }
  .pillar{ flex:0 0 auto; font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    color:var(--blue); background:#eaf1fc; border-radius:999px; padding:2px 9px; white-space:nowrap; }
  .act-why{ margin-top:2px; font-size:12.5px; line-height:1.45; color:var(--muted); }
  .act-dep{ margin-top:3px; font-size:11px; color:var(--faint); font-weight:700; }

  /* Blocks (quick wins / directories) */
  .block{ padding:22px 40px; border-top:1px solid var(--line); }
  .block.tint{ background:var(--page); }
  .qw{ margin:0; padding-left:18px; }
  .qw li{ font-size:14px; line-height:1.5; color:var(--ink); font-weight:600; margin-bottom:6px; }
  .dirs{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; }
  .dir{ display:flex; flex-direction:column; }
  .dir-name{ font-size:14px; font-weight:850; color:var(--ink); }
  .dir-why{ font-size:12.5px; color:var(--muted); line-height:1.4; }

  /* Notes footer band (honest framing) */
  .notes{ padding:22px 40px 26px; border-top:1px solid var(--line); }
  .note{ margin:0 0 12px; font-size:13.5px; line-height:1.5; color:var(--muted); max-width:70ch; }
  .note:last-child{ margin-bottom:0; }
  .note b{ color:var(--ink); font-weight:800; }

  .site-foot{ background:var(--foot); padding:14px 40px 16px; }
  .site-foot .row{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
    font-size:11.5px; color:#c7d5ee; font-weight:600; }
  .site-foot .row b{ color:#fff; }

  @page{ size:A4; margin:11mm; }
  @media print{
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .band,.head,.summary,.timeline,.block,.notes,.site-foot{ break-inside:avoid; }
    .wk,.dir,.act{ break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">Delivery Playbook · ${esc(viewLabel)}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" fill="#ffffff"/>
      </svg>
    </header>
${internal ? `    <div class="internal-flag">Internal — execution copy, not for the client</div>\n` : ""}
    <div class="head">
      <div class="for">8-week Sprint · prepared for</div>
      <h1>${esc(d.businessName)}</h1>
      ${d.vertical ? `<div class="vert">${esc(d.vertical)}</div>` : ""}
    </div>
    <div class="summary">${esc(d.summary)}</div>

    <section class="timeline">
      <div class="timeline-h"><div class="sec-eyebrow">The plan</div><div class="sec-title">Your 8-week Sprint</div></div>
${weeks}
    </section>

    ${quickWins}
    ${directories}

    <section class="notes">
      <p class="note"><b>Timeline &amp; re-audit.</b> ${esc(d.timelineNote)}</p>
      <p class="note"><b>Our promise.</b> ${esc(d.guaranteeNote)}</p>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(d.businessName)}</b></span>
        <span>Findable · Delivery Playbook</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

/** "ABLM Associates" + suffix → a clean PDF filename base ("ABLM-Associates-…"). Chrome/Edge
 *  use the document <title> as the default "Save as PDF" filename. */
function pdfTitle(businessName: string, suffix: string): string {
  const base = (businessName || "Business").trim()
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "Business";
  return `${base}-${suffix}`;
}

/** Save a self-contained HTML document as a PDF via the browser's print-to-PDF. Renders the
 *  HTML into an offscreen iframe, sets its <title> (the default "Save as PDF" filename), then
 *  invokes the print dialog. Vector output: the artifact's own @page / @media print / break-
 *  inside CSS carries through, so the design stays crisp and text stays selectable. The iframe
 *  is removed after printing (no leaked nodes). */
function printHtmlAsPdf(html: string, title: string): void {
  const titled = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  let done = false;
  const cleanup = () => { if (done) return; done = true; iframe.remove(); };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    try { if (iframe.contentDocument) iframe.contentDocument.title = title; } catch { /* same-origin srcdoc */ }
    win.addEventListener("afterprint", () => setTimeout(cleanup, 300), { once: true });
    setTimeout(cleanup, 60_000); // fallback if afterprint never fires (rare)
    win.focus();
    win.print();
  };
  document.body.appendChild(iframe);
  iframe.srcdoc = titled;
}

/** Save the standalone playbook (the currently-shown view) as a PDF (print-to-PDF). */
export function downloadPlaybookHtml(d: PlaybookData, view: PlaybookView): void {
  printHtmlAsPdf(renderPlaybookHtml(d, view), pdfTitle(d.businessName, `Playbook-${view === "internal" ? "Internal" : "Client"}`));
}
