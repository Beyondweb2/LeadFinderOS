// Client/internal delivery-playbook renderer — a standalone, self-contained, PRINT-READY
// HTML document (Findable-branded, inline CSS/SVG, no dependencies). Visual sibling of
// aiAuditReportHtml.ts: reuses the same :root tokens + header band.
//
// renderPlaybookHtml(data, view) is a PURE function of PlaybookData + a view selector:
//   - "internal": our execution checklist — the ONE ordered action list (action/why/pillar/tags).
//   - "client":   a softer roadmap — the plain-language clientSummary paragraph (no technical talk).
// One generated plan, two registers. Used by the in-app iframe preview AND the download.

export type ActionPriority = "high" | "medium" | "low";
export interface PlaybookInternalAction {
  action: string;
  why: string;
  pillar: string;
  priority?: ActionPriority; // leverage for THIS business; optional (older playbooks lack it)
  leadTime?: "fast" | "medium" | "slow"; // how long until it moves AI visibility; optional (older playbooks lack it)
  steps?: string[]; // step-by-step how-to (internal view); optional (older playbooks lack it)
  dependsOn?: string;
}
export interface PlaybookDeprioritised {
  item: string;
  why: string;
}
export interface PlaybookDirectory {
  name: string;
  why: string;
}
export interface PlaybookData {
  businessName: string;
  vertical: string;
  businessScope?: "national" | "local" | "hybrid"; // model's scope determination; optional, not rendered
  summary: string;                        // where-they-stand + what-we'll-do overview
  clientSummary: string;                  // plain-language roadmap paragraph (client view)
  actions: PlaybookInternalAction[];      // ONE ordered list (code-sorted: priority then leadTime)
  clientTasks?: string[];                 // "what we need from you" (client view); optional (older playbooks lack it)
  quickWins: string[];
  directories: PlaybookDirectory[];
  deprioritised?: PlaybookDeprioritised[]; // do lightly or skip for THIS business (optional)
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

  const prioLabel: Record<ActionPriority, string> = { high: "High", medium: "Med", low: "Low" };
  const leadLabel: Record<string, string> = { fast: "Fast", medium: "Weeks", slow: "Slow-burn · start now" };
  // Internal view = ONE ordered action list with per-task step-by-step (already sorted by the
  // generator: priority then leadTime). Client view = plain roadmap + what-we'll-do + what-we-need.
  const planBody = internal
    ? `<ul class="acts">${
        (d.actions ?? []).map((a) => {
          const prio: ActionPriority | null = a.priority === "high" || a.priority === "medium" || a.priority === "low" ? a.priority : null;
          const prioPill = prio ? `<span class="prio prio-${prio}">${prioLabel[prio]}</span>` : "";
          const lead = a.leadTime === "fast" || a.leadTime === "medium" || a.leadTime === "slow" ? a.leadTime : null;
          const leadPill = lead ? `<span class="lead lead-${lead}">${leadLabel[lead]}</span>` : "";
          const steps = (a.steps ?? []).filter(Boolean); // null-safe: older playbooks have no steps
          const stepsList = steps.length
            ? `<ol class="act-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
            : "";
          return `
          <li class="act${prio ? ` p-${prio}` : ""}">
            <div class="act-top"><span class="act-do">${esc(a.action)}</span><span class="act-tags">${leadPill}${prioPill}<span class="pillar">${esc(a.pillar)}</span></span></div>
            <div class="act-why">${esc(a.why)}</div>
            ${stepsList}
            ${a.dependsOn ? `<div class="act-dep">Depends on: ${esc(a.dependsOn)}</div>` : ""}
          </li>`;
        }).join("")
      }</ul>`
    : `<p class="wk-client">${esc(d.clientSummary)}</p>
       <div class="client-do">
         <div class="cd-title">What we'll be doing</div>
         <ul class="cd-list">${(d.actions ?? []).map((a) => `<li>${esc(a.action)}</li>`).join("")}</ul>
       </div>
       ${(d.clientTasks ?? []).filter(Boolean).length
          ? `<div class="client-need">
               <div class="cd-title">What we need from you</div>
               <ul class="cd-list">${(d.clientTasks ?? []).filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
             </div>`
          : ""}`;

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

  // Do lightly or skip — the deprioritised list. Shown in BOTH views; the client register gets
  // a softer heading. Renders only when the model flagged something.
  const dep = (d.deprioritised ?? []).filter((x) => x && x.item && x.why);
  const deprioritised = dep.length
    ? `<section class="block skip">
        <div class="sec-eyebrow">${internal ? "Effort" : "Where we focus"}</div>
        <div class="sec-title">${internal ? "Do lightly or skip" : "What we won’t over-invest in"}</div>
        <ul class="skips">${dep.map((x) => `
          <li class="skip-item"><span class="skip-name">${esc(x.item)}</span><span class="skip-why">${esc(x.why)}</span></li>`).join("")}</ul>
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

  /* Ordered action plan (internal) / roadmap paragraph (client) */
  .plan{ padding:20px 40px 8px; border-top:1px solid var(--line); }
  .plan-h{ margin-bottom:14px; }
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
  /* Priority ranking — leverage for THIS business. HIGH stands out (solid blue), LOW recedes. */
  .act-tags{ display:flex; align-items:center; gap:6px; flex:0 0 auto; }
  .prio{ font-size:9.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; border-radius:999px; padding:2px 7px; white-space:nowrap; }
  .prio-high{ background:var(--blue); color:#fff; }
  .prio-medium{ background:#eef1f6; color:var(--muted); }
  .prio-low{ background:#f4f5f7; color:var(--faint); border:1px solid var(--line); }
  .act.p-low .act-do{ color:var(--muted); font-weight:700; }   /* low-leverage actions recede */
  .act.p-low .act-why{ color:var(--faint); }
  /* Lead-time pills — same sizing as .prio. "Slow-burn · start now" is emphasised (filled
     amber) so the start-early signal stands out; fast/medium are muted. */
  .lead{ font-size:9.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; border-radius:999px; padding:2px 7px; white-space:nowrap; }
  .lead-slow{ background:var(--amber); color:#fff; }
  .lead-fast{ background:#eef1f6; color:var(--muted); }
  .lead-medium{ background:#f4f5f7; color:var(--faint); border:1px solid var(--line); }

  /* Per-task step-by-step (internal view) — an indented numbered sub-list under each action. */
  .act-steps{ margin:6px 0 2px; padding:0 0 0 20px; }
  .act-steps li{ font-size:12.5px; line-height:1.5; color:var(--ink); margin:2px 0; padding-left:2px; }
  .act.p-low .act-steps li{ color:var(--muted); }

  /* Client view — "What we'll be doing" + "What we need from you". */
  .client-do, .client-need{ margin-top:16px; }
  .cd-title{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:800; margin:0 0 8px; }
  .client-need .cd-title{ color:var(--blue); }
  .cd-list{ margin:0; padding-left:18px; }
  .cd-list li{ font-size:14px; line-height:1.5; color:var(--ink); margin-bottom:6px; }

  /* "Do lightly or skip" block — the deprioritised list. */
  .skips{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 22px; }
  .skip-item{ display:flex; flex-direction:column; }
  .skip-name{ font-size:13.5px; font-weight:850; color:var(--ink); }
  .skip-why{ font-size:12px; color:var(--muted); line-height:1.4; }

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
    /* Force backgrounds (blue header band, tinted blocks, pillar chips, timeline dots, internal
       flag, footer) to print WITHOUT the user ticking Chrome's "Background graphics". */
    html,body,.sheet,.band,.internal-flag,.block,.pillar,.prio,.lead,.wk-dot,.site-foot{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body{ background:#fff; }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .band,.head,.summary,.plan,.block,.notes,.site-foot{ break-inside:avoid; }
    .dir,.act,.skip-item{ break-inside:avoid; }
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

    <section class="plan">
      <div class="plan-h"><div class="sec-eyebrow">The plan</div><div class="sec-title">${internal ? "Prioritised action plan" : "Your roadmap"}</div></div>
      ${planBody}
    </section>

    ${quickWins}
    ${directories}
    ${deprioritised}

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
  // Off-screen but FULLY RENDERED — a real width so the document lays out at its normal size
  // and paginates correctly. A 0×0 / visibility:hidden / display:none iframe is NOT laid out,
  // so the print engine captures a collapsed render → one near-empty page. Height is grown to
  // the content after load so the whole document is in layout.
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "794px"; // ~A4 width @96dpi
  iframe.style.height = "1123px"; // ~A4 height; replaced with content height on load
  iframe.style.border = "0";
  iframe.style.opacity = "0"; // hide visually WITHOUT suppressing layout/paint (unlike visibility/display)
  let done = false;
  const cleanup = () => { if (done) return; done = true; iframe.remove(); };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) { cleanup(); return; }
    try { doc.title = title; } catch { /* same-origin srcdoc */ }
    // Size to content so the FULL document is laid out (not clipped to a viewport height).
    try { iframe.style.height = `${doc.documentElement.scrollHeight}px`; } catch { /* ignore */ }
    win.addEventListener("afterprint", () => setTimeout(cleanup, 300), { once: true });
    setTimeout(cleanup, 60_000); // fallback if afterprint never fires (rare)
    // Print only AFTER layout + paint have settled (double rAF) so nothing prints empty.
    requestAnimationFrame(() => requestAnimationFrame(() => { win.focus(); win.print(); }));
  };
  document.body.appendChild(iframe);
  iframe.srcdoc = titled;
}

/** Save the standalone playbook (the currently-shown view) as a PDF (print-to-PDF). */
export function downloadPlaybookHtml(d: PlaybookData, view: PlaybookView): void {
  printHtmlAsPdf(renderPlaybookHtml(d, view), pdfTitle(d.businessName, `Playbook-${view === "internal" ? "Internal" : "Client"}`));
}
