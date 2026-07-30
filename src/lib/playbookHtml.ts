// Client/internal delivery-playbook renderer — a standalone, self-contained, PRINT-READY
// HTML document (Findable-branded, inline CSS/SVG, no dependencies). Visual sibling of
// aiAuditReportHtml.ts: reuses the same :root tokens + header band.
//
// The chrome (stylesheet, header band, escaping, print-to-PDF) now lives in playbookDocStyle.ts so
// playbookDoc.ts can render the buildPlaybook fold with an identical look. This file's DATA path —
// PlaybookData from the generate-playbook LLM pipeline — is unchanged and is NOT shared.
//
// renderPlaybookHtml(data, view) is a PURE function of PlaybookData + a view selector:
//   - "internal": our execution checklist — the ONE ordered action list (action/why/pillar/tags).
//   - "client":   a softer roadmap — the plain-language clientSummary paragraph (no technical talk).
// One generated plan, two registers. Used by the in-app iframe preview AND the download.

import { DOC_CSS, docBand, esc, pdfTitle, printHtmlAsPdf } from "./playbookDocStyle";

export type ActionPriority = "high" | "medium" | "low";
export interface PlaybookInternalAction {
  action: string;
  why: string;
  pillar: string;
  priority?: ActionPriority; // leverage for THIS business; optional (older playbooks lack it)
  leadTime?: "fast" | "medium" | "slow"; // how long until it moves AI visibility; optional (older playbooks lack it)
  track?: "seo" | "visibility"; // which deliverable — visibility (base) vs seo (add-on); optional (older playbooks lack it)
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

/** Build the standalone playbook HTML for the chosen view. */
export function renderPlaybookHtml(d: PlaybookData, view: PlaybookView): string {
  const internal = view === "internal";
  const viewLabel = internal ? "Internal delivery plan" : "Your roadmap";

  const prioLabel: Record<ActionPriority, string> = { high: "High", medium: "Med", low: "Low" };
  const leadLabel: Record<string, string> = { fast: "Fast", medium: "Weeks", slow: "Slow-burn · start now" };
  // Internal view = ONE ordered action list with per-task step-by-step (already sorted by the
  // generator: priority then leadTime). Client view = plain roadmap + what-we'll-do + what-we-need.
  // Per-action <li> renderer — unchanged detail (priority badge, leadTime tag, pillar, why, steps).
  const renderAct = (a: PlaybookInternalAction): string => {
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
  };

  // Group the INTERNAL action list by track — AI Visibility (base deliverable) FIRST, then SEO
  // Improvement (separately-priced add-on). Preserve the incoming order within each group (already
  // sorted by priority then leadTime — do NOT re-sort). Missing/unknown track counts as visibility
  // so no action is ever dropped. An empty group renders nothing (no heading).
  const allActs = d.actions ?? [];
  const visActs = allActs.filter((a) => a.track !== "seo");
  const seoActs = allActs.filter((a) => a.track === "seo");
  const actGroup = (label: string, sub: string, items: PlaybookInternalAction[]): string =>
    items.length
      ? `<div class="act-group">
           <div class="act-group-h">${esc(label)}</div>
           ${sub ? `<div class="act-group-sub">${esc(sub)}</div>` : ""}
           <ul class="acts">${items.map(renderAct).join("")}</ul>
         </div>`
      : "";

  const planBody = internal
    ? `${actGroup("AI Visibility", "", visActs)}${actGroup("SEO Improvement (add-on)", "Charged as a separate SEO package", seoActs)}`
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
<style>${DOC_CSS}</style>
</head>
<body>
  <div class="sheet">
${docBand(`Delivery Playbook · ${viewLabel}`)}
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

/** Save the standalone playbook (the currently-shown view) as a PDF (print-to-PDF). */
export function downloadPlaybookHtml(d: PlaybookData, view: PlaybookView): void {
  printHtmlAsPdf(renderPlaybookHtml(d, view), pdfTitle(d.businessName, `Playbook-${view === "internal" ? "Internal" : "Client"}`));
}
