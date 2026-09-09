// Shared print-document chrome: the CSS token block, the Findable header band, escaping, and the
// print-to-PDF helper. EXTRACTED VERBATIM from playbookHtml.ts so two documents can look identical
// without either owning the styling.
//
// WHAT IS SHARED IS THE LOOK, AND ONLY THE LOOK. playbookHtml.ts renders `PlaybookData`, which comes
// out of the now-deleted generate-playbook LLM pipeline; playbookDoc.ts renders `Playbook`, which comes out of
// buildPlaybook and is a pure fold over citations plus hand-maintained host facts. Those two data
// paths never meet, and that separation is the point: the LLM document recommended ICAEW to an ACCA
// firm, ACCA's own directory (zero citations in our data) and Bing Places (zero citations across all
// 8,913), because a model asked for plausible directories will produce plausible directories. Sharing
// the stylesheet is safe. Sharing the data path would reintroduce exactly that failure.
//
// The CSS below is byte-for-byte what the client-facing document already ships, so extracting it
// cannot change that document's appearance. New rules belong in the caller, not here.

/** HTML-escape. Every interpolated value in both documents goes through this. */
export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The full token + layout + print stylesheet, without the <style> tags. */
export const DOC_CSS = `
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
  .act-group{ margin:0 0 18px; }
  .act-group:last-child{ margin-bottom:0; }
  .act-group-h{ font-size:15px; font-weight:850; color:var(--ink); letter-spacing:-.01em; margin:0 0 2px; }
  .act-group-sub{ font-size:12px; color:var(--muted); margin:0 0 8px; }
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
`;

/** The blue Findable band with its wave. `meta` is the uppercase right-hand label. */
export const docBand = (meta: string): string => `    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">${esc(meta)}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" fill="#ffffff"/>
      </svg>
    </header>`;

/** "ABLM Associates" + suffix → a clean PDF filename base ("ABLM-Associates-…"). Chrome/Edge
 *  use the document <title> as the default "Save as PDF" filename. */
export function pdfTitle(businessName: string, suffix: string): string {
  const base = (businessName || "Business").trim()
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "Business";
  return `${base}-${suffix}`;
}

/** Save a self-contained HTML document as a PDF via the browser's print-to-PDF. Renders the
 *  HTML into an offscreen iframe, sets its <title> (the default "Save as PDF" filename), then
 *  invokes the print dialog. Vector output: the artifact's own @page / @media print / break-
 *  inside CSS carries through, so the design stays crisp and text stays selectable. The iframe
 *  is removed after printing (no leaked nodes). NO PDF LIBRARY — the browser does it. */
export function printHtmlAsPdf(html: string, title: string): void {
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
