// Browser-only PDF/download helpers for the AI-visibility report — SPLIT OUT of
// aiAuditReportHtml.ts so that module stays PURE (no document/window) and is importable
// server-side (the Deno edge fn render-audit-report reuses renderReportHtml). These use the
// DOM (offscreen iframe + window.print) and only ever run in the SPA.
import { renderReportHtml, esc, type AiAuditReportData } from './aiAuditReportHtml';

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
 *  inside CSS carries through, so the SVG header, grade circles and coloured bands stay crisp
 *  and text stays selectable. The iframe is removed after printing (no leaked nodes). */
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

/** Save the standalone report as a PDF (print-to-PDF — vector, design-preserving). */
export function downloadReportHtml(d: AiAuditReportData): void {
  /* ⛔ A DOWNLOADED REPORT IS A CLIENT ARTIFACT — STRIP the internal winnability signal even though
     the operator's on-screen preview shows it. The operator downloads this to send to the client, so
     internal must be forced off here regardless of what the passed data carries. Single defensive
     point: no caller can accidentally hand a client a report with winnability on it. */
  printHtmlAsPdf(renderReportHtml({ ...d, internal: false }), pdfTitle(d.businessName, "AI-Visibility-Report"));
}
