import { DOC_CSS, docBand, esc, pdfTitle, printHtmlAsPdf } from './playbookDocStyle';
import type { Playbook, PlaybookStep } from './buildPlaybook';
import { EVIDENCE_MIN_AUDITS, thinTradeMessage } from './buildPlaybook';
import { factFor } from './directoryFacts';
import type { AiAuditSeo } from './aiAuditReportHtml';

/* ============================================================
   PRINTABLE OPERATOR PLAYBOOK — the buildPlaybook fold, in the LLM document's layout.

   NO LANGUAGE MODEL, AT ANY POINT. This is a pure function of the Playbook object (plus the stored
   SEO scan): every sentence is either a template or a value already on that object.
   generate-playbook is not called, not imported, and not reachable from here.

   That is the whole design constraint. The LLM document is what, for Macca-Gas Ltd specifically,
   recommended Bing Places (ZERO citations in 10,615) while never once mentioning Checkatrade (662
   citations across 58 of 59 plumber audits — the strongest signal in the data) or Yell (232 across
   45). A model asked for plausible directories returns plausible directories. Only the LAYOUT came
   across from that document; the data cannot, by construction — there is no code path from here to
   PlaybookData.

   WHY BING PLACES / THE ACCA DIRECTORY / REVIEWS CANNOT APPEAR HERE. Not because they are filtered
   out — because a host only becomes a task if it was CITED. bingplaces.com and accaglobal.com have
   zero citations across all 10,615, so they never enter the fold, and there is no review step in it
   at all. Structurally impossible rather than merely avoided.

   THE LAYOUT, MATCHED TO THE OLD DOCUMENT: header → THE PLAN (grouped) → SEO Improvement (add-on) →
   QUICK WINS → WHERE AI READS → who keeps getting named → EFFORT (do lightly or skip) → Timeline &
   Our promise. Every class used below already exists in the shared stylesheet, which was extracted
   verbatim from the LLM renderer, so the two documents print identically.

   THE HONESTY MARKERS ARE LOUDER ON PAPER THAN ON SCREEN, DELIBERATELY. A printed sheet is worked
   through away from the screen, where nothing can be checked: if a signup URL is unverified or a
   source rests on 3 audits, the sheet is the only place that can say so.
   ============================================================ */

/** Extra rules on top of DOC_CSS. Kept here so the shared stylesheet stays byte-identical to the
 *  client-facing document it was extracted from. */
const EXTRA_CSS = `
  /* Evidence, always paired: citations alone lie, breadth is what makes them mean anything. */
  .ev{ flex:0 0 auto; font-size:11px; font-weight:700; color:var(--muted); white-space:nowrap; }
  .ev .a{ font-size:13px; font-weight:900; color:var(--ink); }
  .mins{ flex:0 0 auto; font-size:9.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    color:var(--muted); background:#eef1f6; border-radius:999px; padding:2px 7px; white-space:nowrap; }

  /* Honesty pills. Filled, not outlined — these must survive a greyscale office printer. */
  .flag{ font-size:9.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    border-radius:999px; padding:2px 8px; white-space:nowrap; }
  .flag-thin{ background:var(--amber); color:#fff; }
  .flag-unver{ background:var(--red); color:#fff; }
  .flag-done{ background:var(--green); color:#fff; }
  .flag-client{ background:var(--blue); color:#fff; }

  .host{ font-size:11.5px; color:var(--faint); font-weight:700; }
  .url{ margin-top:3px; font-size:11px; color:var(--blue-2); font-weight:700; word-break:break-all; }
  .warn{ margin:0 40px 16px; padding:10px 14px; background:#fff5f5; border-left:3px solid var(--red);
    font-size:13px; font-weight:800; color:var(--red); }
  .thintrade{ margin:0 40px 16px; padding:10px 14px; background:#fffbeb; border-left:3px solid var(--amber);
    font-size:12.5px; line-height:1.5; color:#713f12; font-weight:600; }
  /* Provenance line: says out loud that this is trade-level, not bespoke to this business. */
  .prov{ margin:0 40px 18px; padding:9px 13px; background:var(--page); border-left:3px solid var(--faint);
    font-size:12px; line-height:1.5; color:var(--muted); font-weight:600; }

  /* THE PRIORITY BADGE PRINTS ITS OWN EVIDENCE. A bare "HIGH" is a judgement the reader cannot
     audit; "HIGH · 58 of 59 plumber audits" is a summary of a fact that is visible right next to it. */
  .prio{ font-size:9.5px; }
  .no-steps{ margin:6px 0 2px; font-size:11.5px; font-weight:700; color:var(--amber); }

  /* Paste-values table — the point of the sheet: what goes in each field, and what we do not hold. */
  .fields{ margin:6px 0 0; padding:8px 10px; background:var(--page); border-radius:8px;
    display:grid; grid-template-columns:auto 1fr; gap:2px 12px; }
  .fk{ font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .fv{ font-size:12px; color:var(--ink); font-weight:600; word-break:break-word; }
  .fv.miss{ color:var(--red); font-weight:900; }

  .wins{ list-style:none; margin:0; padding:0; }
  .win{ display:flex; justify-content:space-between; gap:12px; padding:4px 0;
    border-bottom:1px solid var(--line); font-size:12.5px; }
  .win:last-child{ border-bottom:0; }
  .win-h{ font-weight:800; color:var(--ink); word-break:break-all; }
  .kind{ font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
    color:var(--muted); background:#eef1f6; border-radius:999px; padding:1px 7px; white-space:nowrap; }
  .more{ margin-top:8px; font-size:12px; font-weight:800; color:var(--muted); }

  /* SEO add-on: real grades from the stored scan. Deliberately visually quieter than the plan —
     it is a separately-charged extra, not part of the visibility work. */
  .seo-grades{ display:flex; gap:10px; flex-wrap:wrap; margin:0 0 12px; }
  .seo-g{ flex:1 1 150px; padding:9px 12px; background:var(--page); border-radius:8px; }
  .seo-g .k{ font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .seo-g .v{ font-size:19px; font-weight:900; color:var(--ink); letter-spacing:-.01em; }
  .seo-g .s{ font-size:11px; color:var(--muted); font-weight:700; }
  .seo-find{ list-style:none; margin:0; padding:0; }
  .seo-find li{ padding:5px 0; border-bottom:1px solid var(--line); font-size:12.5px; }
  .seo-find li:last-child{ border-bottom:0; }
  .sev{ font-size:9px; font-weight:900; letter-spacing:.05em; text-transform:uppercase;
    border-radius:999px; padding:1px 7px; margin-right:6px; white-space:nowrap; }
  .sev-high{ background:var(--red); color:#fff; }
  .sev-med{ background:var(--amber); color:#fff; }
  .sev-low{ background:#eef1f6; color:var(--muted); }
  .seo-name{ font-weight:800; color:var(--ink); }
  .seo-detail{ display:block; margin-top:1px; font-size:11.5px; color:var(--muted); line-height:1.4; }
  /* The claim this section must never make. Stated as a positive fact, not a disclaimer. */
  .seo-note{ margin:12px 0 0; padding:9px 13px; background:#fffbeb; border-left:3px solid var(--amber);
    font-size:12px; line-height:1.5; color:#713f12; font-weight:600; }

  @media print{
    /* LOUDER ON PAPER. Bigger pills, bigger breadth number, and the pill backgrounds forced. */
    .flag{ font-size:10.5px; padding:3px 10px; }
    .ev .a{ font-size:14px; }
    .flag,.mins,.kind,.warn,.thintrade,.fields,.prov,.sev,.seo-g,.seo-note{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }

    /* LET THE CONTAINERS FLOW, PROTECT THE ATOMS.
       The shared stylesheet sets break-inside:avoid on .plan and .block. That was harmless for the
       LLM document, whose plan was a short list — but MEASURED here, .plan is ~4,600px, about 4.5
       A4 pages. A browser cannot honour "avoid" on something taller than a page, and in trying it
       will often push the whole section to a fresh sheet and leave the first page half empty. So the
       containers are released and the things that must never split across a page — a task with its
       sub-steps, a paste-values table, one ranking row — keep the rule instead. That is the right
       granularity and it is why this override lives here rather than in the shared file: the LLM
       document is deliberately untouched. */
    .plan,.block{ break-inside:auto !important; }
    .fields,.win,.act,.skip-item,.dir,.seo-find li,.seo-g,.act-group-h{ break-inside:avoid; }
    /* Never leave a group heading stranded as the last line on a page. */
    .act-group-h,.sec-title{ break-after:avoid; }
  }
`;

/* ── PRIORITY, DERIVED FROM BREADTH — never from an opinion ───────────────────────────────────────
   Breadth (how many separate audits a host appeared in) rather than raw citations, because volume
   alone lies: one host had 32 citations from a SINGLE audit and read as the strongest source in the
   data until breadth was shown. Expressed as a share of the trade's audits so it means the same
   thing for a trade with 59 audits and one with 12.

   The thresholds are the only invented numbers in this document, which is exactly why the badge
   prints the count beside them — see .prio in the CSS above. */
const PRIORITY_HIGH_SHARE = 0.6;

type Prio = 'high' | 'medium' | 'low';

function priorityOf(s: PlaybookStep, tradeAudits: number): Prio | null {
  if (!s.host || s.audits <= 0) return null;          // fixed steps carry no evidence to rank on
  if (s.strength === 'thin') return 'low';            // under EVIDENCE_MIN_AUDITS — never HIGH
  if (tradeAudits > 0 && s.audits / tradeAudits >= PRIORITY_HIGH_SHARE) return 'high';
  return 'medium';
}

/** "HIGH · 58 of 59 plumber audits" — the badge and the fact that produced it, together. */
function prioPill(s: PlaybookStep, pb: Playbook): string {
  const p = priorityOf(s, pb.tradeAudits);
  if (!p) return '';
  const trade = (pb.trade ?? '').trim().toLowerCase();
  const scope = pb.tradeAudits > 0
    ? `${s.audits} of ${pb.tradeAudits} ${trade ? `${trade} ` : ''}audits`
    : `${s.audits} audit${s.audits === 1 ? '' : 's'}`;
  return `<span class="prio prio-${p}">${p.toUpperCase()} &middot; ${esc(scope)}</span>`;
}

/** Category badge = what joining this host actually costs. A real per-host fact, decision-relevant. */
const COST_LABEL: Record<string, string> = {
  free: 'Free', paid: 'Paid', 'pay-per-lead': 'Pay per lead', membership: 'Membership', 'n/a': '—',
};
function costPill(s: PlaybookStep): string {
  if (!s.host) return '';
  const f = factFor(s.host);
  const label = f ? COST_LABEL[f.cost] : undefined;
  return label && label !== '—' ? `<span class="pillar">${esc(label)}</span>` : '';
}

/** citations + audits, always together, with the breadth number emphasised. */
const evidence = (s: { citations: number; audits: number }): string =>
  `<span class="ev"><span class="a">${s.audits} audits</span> · ${s.citations} citations</span>`;

const flags = (s: PlaybookStep): string => {
  const out: string[] = [];
  if (s.done) out.push('<span class="flag flag-done">done</span>');
  if (s.section === 'blocked') out.push('<span class="flag flag-client">client must do this</span>');
  if (s.host && s.strength === 'thin') out.push(`<span class="flag flag-thin">thin · ${s.audits} audits only</span>`);
  // Loudest marker on the sheet. 60 of 64 signup URLs have never been clicked by a human.
  if (s.signupUrl && !s.urlVerified) out.push('<span class="flag flag-unver">url unverified</span>');
  return out.join(' ');
};

const fields = (s: PlaybookStep): string => s.fields.length === 0 ? '' : `
        <div class="fields">${s.fields.map((f) => `
          <div class="fk">${esc(f.name)}</div><div class="fv${f.missing ? ' miss' : ''}">${esc(f.value || '—')}</div>`).join('')}
        </div>`;

/** THE ONE-LINE WHY — the evidence, stated. No causal claim: a citation count says where the engines
 *  read, never why a business is or is not named. */
function why(s: PlaybookStep, pb: Playbook): string {
  if (!s.host || s.audits <= 0) return s.notes ? `<div class="act-why">${esc(s.notes)}</div>` : '';
  const trade = (pb.trade ?? '').trim().toLowerCase();
  return `<div class="act-why">Cited ${s.citations} time${s.citations === 1 ? '' : 's'} across `
    + `${s.audits} of ${pb.tradeAudits} measured ${esc(trade || 'business')} audit${pb.tradeAudits === 1 ? '' : 's'}.</div>`;
}

/* NUMBERED SUB-STEPS, HAND-WRITTEN PER HOST, WITH NO GENERIC FALLBACK.
   Generic filler ("create an account, complete your profile") is exactly what made the LLM document
   useless, so a host without written steps says so in one amber line instead. A visible gap the
   operator can act on beats invented instructions they will follow into a dead end. */
function subSteps(s: PlaybookStep): string {
  if (!s.host) return '';
  const written = (factFor(s.host)?.steps ?? []).filter(Boolean);
  if (written.length) {
    return `<ol class="act-steps">${written.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }
  return `<div class="no-steps">No written steps for this one yet — work from the signup URL and the field values below,
    then write the steps up so the next person does not have to work it out again.</div>`;
}

const act = (s: PlaybookStep, pb: Playbook): string => {
  const p = priorityOf(s, pb.tradeAudits);
  return `
      <li class="act${p ? ` p-${p}` : ''}">
        <div class="act-top">
          <span class="act-do">${esc(s.label)}${s.host ? ` <span class="host">${esc(s.host)}</span>` : ''}</span>
          <span class="act-tags">${s.minutes > 0 ? `<span class="mins">${s.minutes} min</span>` : ''}${prioPill(s, pb)}${costPill(s)}</span>
        </div>
        ${flags(s) ? `<div style="margin-top:4px">${flags(s)}</div>` : ''}
        ${why(s, pb)}
        ${s.blockedReason ? `<div class="act-why"><b>Why only they can:</b> ${esc(s.blockedReason)}</div>` : ''}
        ${s.host && s.notes ? `<div class="act-dep">${esc(s.notes)}</div>` : ''}
        ${subSteps(s)}
        ${s.signupUrl ? `<div class="url">${esc(s.signupUrl)}</div>` : ''}
        ${fields(s)}
      </li>`;
};

const group = (title: string, sub: string, rows: PlaybookStep[], pb: Playbook): string => rows.length === 0 ? '' : `
      <div class="act-group">
        <div class="act-group-h">${esc(title)}</div>
        <div class="act-group-sub">${esc(sub)}</div>
        <ul class="acts">${rows.map((s) => act(s, pb)).join('')}</ul>
      </div>`;

/** How many competitors to print. See the note at the call site. */
const WHO_IS_WINNING_LIMIT = 20;
/** A quick win is cheap in time AND broadly evidenced. Both, or it is not a quick win. */
const QUICK_WIN_MAX_MINUTES = 10;

/* ── THE SEO ADD-ON SECTION ──────────────────────────────────────────────────────────────────────
   Real grades and real findings from the stored scan (ai_audit_runs.results.seo) — the SAME object the
   customer report renders, so the two cannot disagree.

   IT MAKES NO AI CLAIM, AND THAT IS THE POINT OF REBUILDING IT. The LLM version said fixing H1 tags
   helps "AI understand and rank the site better". Our own measurements say the opposite: 22 firms
   Gemini names have WORSE sites than our clients, LocalBusiness schema is 35% vs 32% either way, and
   one business we measure has no website at all yet ChatGPT names it 4 times in 5. So the findings are
   printed as what they are — website faults worth fixing on their own merit, charged separately — and
   never as an explanation for an AI absence. */
const SEV_CLASS: Record<string, string> = { high: 'sev-high', med: 'sev-med', low: 'sev-low' };

function seoSection(seo: AiAuditSeo | null): string {
  if (!seo) return '';
  const cats: Array<[string, { grade: string; score: number } | undefined]> = [
    ['On-page', seo.categories?.onPage],
    ['Content & technical', seo.categories?.contentTechnical],
  ];
  const findings = (seo.leadFindings ?? []).filter((f) => f && f.title);
  return `
      <div class="act-group">
        <div class="act-group-h">SEO Improvement (add-on)</div>
        <div class="act-group-sub">Charged as a separate SEO package</div>
        <div class="seo-grades">
          <div class="seo-g"><div class="k">Overall grade</div><div class="v">${esc(seo.overallGrade || '—')}</div><div class="s">website SEO health</div></div>
          ${cats.map(([name, c]) => c
            ? `<div class="seo-g"><div class="k">${esc(name)}</div><div class="v">${esc(c.grade)}</div><div class="s">${c.score}/100</div></div>`
            : '').join('')}
        </div>
        ${findings.length ? `<ul class="seo-find">${findings.map((f) => `
          <li><span class="sev ${SEV_CLASS[f.severity] ?? 'sev-low'}">${esc(f.severity)}</span><span class="seo-name">${esc(f.title)}</span>
          ${f.detail ? `<span class="seo-detail">${esc(f.detail)}</span>` : ''}</li>`).join('')}
        </ul>` : '<p class="wk-client">The scan returned no individual findings for this site.</p>'}
        <p class="seo-note">These are website faults worth fixing on their own merit, and they are charged
        separately. They are NOT why the engines do not name this business: we measured 22 firms Gemini
        names that have worse sites than our clients, LocalBusiness schema at 35% against 32% either
        way, and one business with no website at all that ChatGPT still names 4 times in 5. Do not sell
        this as the fix for AI visibility.</p>
      </div>`;
}

export function renderPlaybookDoc(
  pb: Playbook,
  seo: AiAuditSeo | null = null,
  naming: { named: number; total: number } | null = null,
  /* Whether a directory check has ever been run for this business. FALSE prints an explicit note
     rather than letting the absence of "already listed" markers imply a clean sweep. */
  directoryCheckRun = false,
): string {
  /* ALREADY-LISTED STEPS ARE PULLED OUT OF EVERY WORK BUCKET FIRST, so the counters below cannot
     count them. This is the fix for the inverted header: a business whose only free listing already
     exists was being described as "3 tasks I can complete now, 0 need the client". */
  const alreadyListed = pb.steps.filter((s) => !!s.alreadyListed);
  const now = pb.steps.filter((s) => s.section === 'do_now' && !s.alreadyListed);
  const blocked = pb.steps.filter((s) => s.section === 'blocked' && !s.alreadyListed);
  const noWebsite = pb.steps.filter((s) => s.section === 'no_website' && !s.alreadyListed);
  const deprioritised = pb.steps.filter((s) => s.section === 'deprioritised');
  /* Cited, searched for, not found, and NOT in directoryFacts. Excluded from BOTH counters below:
     we do not know whether it can be joined at all, so calling it work — mine or the client's —
     would be a guess dressed as a task. */
  const needsClassification = pb.steps.filter((s) => s.section === 'needs_classification' && !s.alreadyListed);
  const nowMinutes = now.reduce((n, s) => n + s.minutes, 0);
  const vert = [pb.trade, pb.town].filter(Boolean).join(' · ');
  const trade = (pb.trade ?? '').trim().toLowerCase();

  /* THE CITATION RANKING — every joinable host the evidence surfaced, most-cited first. This is the
     same list the plan is built from, shown as a ranking so the ORDER is inspectable rather than
     implied by the order of the tasks. */
  const ranked = pb.steps
    .filter((s) => s.host && s.audits > 0)
    .sort((a, b) => b.citations - a.citations);
  const topSource = ranked[0] ?? null;

  /* QUICK WINS: cheap in time, broadly evidenced, and ACTIONABLE BY US. A client-only task is never a
     quick win however well evidenced — Checkatrade is the most-cited source in the data and cannot be
     a first move for the operator, because only the client can do it. */
  const quickWins = now
    .filter((s) => s.host && s.audits >= EVIDENCE_MIN_AUDITS && s.minutes > 0 && s.minutes <= QUICK_WIN_MAX_MINUTES)
    .sort((a, b) => b.citations - a.citations);

  /* SUMMARY — FACTS ONLY. Deliberately no explanation of WHY they are unnamed: the honest answer is
     presence in the sources the engines read, and any website-based story here would be the LLM
     document's mistake repeated. */
  const summaryBits: string[] = [];
  if (naming) summaryBits.push(`Named in ${naming.named} of ${naming.total} AI answers measured.`);
  if (topSource) {
    summaryBits.push(`The most-cited source for ${trade || 'this trade'} is ${topSource.label} `
      + `(${topSource.citations} citations across ${topSource.audits} of ${pb.tradeAudits} audits).`);
  }
  summaryBits.push(`${now.length} task${now.length === 1 ? '' : 's'} I can complete now, about ${nowMinutes} minutes of work; `
    + `${blocked.length} need${blocked.length === 1 ? 's' : ''} the client before week 8.`);
  // Counted separately and named, so the drop in the numbers above is explained rather than mysterious.
  if (alreadyListed.length) {
    summaryBits.push(`${alreadyListed.length} already listed and excluded from those counts.`);
  }
  if (needsClassification.length) {
    summaryBits.push(`${needsClassification.length} cited host${needsClassification.length === 1 ? '' : 's'} `
      + `need${needsClassification.length === 1 ? 's' : ''} classifying before ${needsClassification.length === 1 ? 'it counts' : 'they count'} as work either way.`);
  }
  const summary = summaryBits.join(' ');

  /* PROVENANCE, SAID OUT LOUD. Asked for explicitly so the sheet cannot read as more bespoke than it
     is: the ranking is trade-level and this business's OWN audit citations do not feed it at all. */
  const provenance = `Everything recommended below is derived from ${pb.tradeAudits} measured `
    + `${trade || 'business'} audit${pb.tradeAudits === 1 ? '' : 's'} across all businesses of this trade — `
    + `not from ${pb.businessName}'s own audit, whose citations are shown on screen as a separate signal `
    + `and do not affect this ranking. Two businesses in the same trade get the same directory list.`;

  const winners = pb.whoIsWinning.slice(0, WHO_IS_WINNING_LIMIT);
  const hidden = pb.whoIsWinning.length - winners.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Delivery Playbook — ${esc(pb.businessName)}</title>
<style>${DOC_CSS}${EXTRA_CSS}</style>
</head>
<body>
  <div class="sheet">
${docBand('Delivery Playbook · Operator copy')}
    <div class="internal-flag">Internal — execution copy, not for the client. Contains the client’s competitors</div>
    <div class="head">
      <div class="for">8-week Sprint · prepared for</div>
      <h1>${esc(pb.businessName)}</h1>
      ${vert ? `<div class="vert">${esc(vert)}</div>` : ''}
    </div>
    <div class="summary">${esc(summary)}</div>
    <div class="prov">${esc(provenance)}</div>
${pb.missingAddress ? `    <div class="warn">No address on file — every signup below asks for one. Get it from the client first or none of this can be completed.</div>\n` : ''}${pb.tradeTooThin ? `    <div class="thintrade">${esc(thinTradeMessage(pb.trade, pb.tradeAudits))}</div>\n` : ''}
    <section class="plan">
      <div class="plan-h">
        <div class="sec-eyebrow">The plan</div>
        <div class="sec-title">Prioritised action plan</div>
      </div>
      ${group('AI Visibility — I can complete these now', `Start to finish without the client, in this order. About ${nowMinutes} minutes.`, now, pb)
        || '<p class="wk-client">Nothing is currently actionable without the client.</p>'}
      ${group('AI Visibility — the client must do these', 'Goes in the client pack. None of it moves until they act, and week 8 measures whether it did.', blocked, pb)}
      ${group('AI Visibility — no website', 'Gemini builds answers from businesses’ own sites. With no site there is nothing of theirs to read.', noWebsite, pb)}
      ${alreadyListed.length ? `
      <div class="act-group">
        <div class="act-group-h">Already listed — verify, do not re-create</div>
        <div class="act-group-sub">A directory check found a live listing on these. Open each one and confirm the CATEGORY and the TOWN match what is being measured — a listing filed under the wrong category is a different problem from no listing, not a smaller one.</div>
        <ul class="acts">${alreadyListed.map((s) => `
          <li class="act">
            <div class="act-top">
              <span class="act-do">${esc(s.label)}${s.host ? ` <span class="host">${esc(s.host)}</span>` : ''}</span>
              <span class="act-tags"><span class="flag flag-done">already listed</span></span>
            </div>
            ${why(s, pb)}
            <div class="url">${esc(s.alreadyListed!.url)}</div>
            ${s.alreadyListed!.title ? `<div class="act-dep">${esc(s.alreadyListed!.title)}</div>` : ''}
          </li>`).join('')}
        </ul>
      </div>` : ''}
      ${needsClassification.length ? `
      <div class="act-group">
        <div class="act-group-h">Cited, searched for, not found — and not yet classified</div>
        <div class="act-group-sub">These are cited for this trade and the search did not surface a listing, but they have no entry in our host facts — so it is not known whether they can be joined, by whom, or at what cost. NOT counted as work in either direction until they are classified. Some will be competitors' own sites, which is exactly why they need a human eye rather than being dropped.</div>
        <ul class="acts">${needsClassification.map((s) => `
          <li class="act">
            <div class="act-top">
              <span class="act-do">${esc(s.label)}</span>
              <span class="act-tags"><span class="flag flag-thin">needs classification</span></span>
            </div>
            ${why(s, pb)}
            ${s.notes ? `<div class="act-dep">${esc(s.notes)}</div>` : ''}
          </li>`).join('')}
        </ul>
      </div>` : ''}
      ${!directoryCheckRun ? `
      <p class="wk-client" style="margin-top:12px"><b>Directory check not run.</b> Nothing below has been
      checked against a live search, so some of it may already be done. Run the directory check on this
      business to find out before spending the hour.</p>` : ''}
      ${seoSection(seo)}
    </section>

    ${quickWins.length ? `<section class="block">
      <div class="sec-eyebrow">Quick wins</div>
      <div class="sec-title">First moves</div>
      <ul class="qw">${quickWins.map((s) => `
        <li>${esc(s.label)} — ${s.minutes} min, cited ${s.citations} times across ${s.audits} of ${pb.tradeAudits} audits.</li>`).join('')}</ul>
    </section>` : ''}

    ${ranked.length ? `<section class="block tint">
      <div class="sec-eyebrow">Where AI reads</div>
      <div class="sec-title">Authority listings for ${esc(trade || 'this sector')}</div>
      <p class="wk-client" style="margin-bottom:10px">The citation ranking the plan above is built from, most-cited first. Breadth is the number that matters: a host cited many times in one audit is an anecdote.</p>
      <ul class="wins">${ranked.map((s) => `
        <li class="win"><span class="win-h">${esc(s.label)} ${s.section === 'blocked' ? '<span class="kind">client must do</span>' : ''}${s.strength === 'thin' ? '<span class="kind">thin</span>' : ''}</span>${evidence(s)}</li>`).join('')}
      </ul>
    </section>` : ''}

    ${winners.length ? `<section class="block">
      <div class="sec-eyebrow">Reference · not tasks</div>
      <div class="sec-title">Who keeps getting named</div>
      <p class="wk-client" style="margin-bottom:10px">Cited by the engines but not joinable — mostly national operators’ and competitors’ own sites. Study them; never task them. Ordered by how many audits each appeared in, not by citations.</p>
      <ul class="wins">${winners.map((w) => `
        <li class="win"><span class="win-h">${esc(w.host)} <span class="kind">${esc(w.kind)}</span></span><span class="ev"><span class="a">${w.audits} audits</span> · ${w.citations} citations</span></li>`).join('')}
      </ul>
      ${hidden > 0 ? `<p class="more">+ ${hidden} more cited host${hidden === 1 ? '' : 's'} below this, not shown. Printing all ${pb.whoIsWinning.length} would bury the ${winners.length} that matter.</p>` : ''}
    </section>` : ''}

    ${pb.notListings.length ? `<section class="block">
      <div class="sec-eyebrow">Reference · not tasks</div>
      <div class="sec-title">Cited, but nobody can join them</div>
      <ul class="dirs">${pb.notListings.map((n) => `
        <li class="dir"><span class="dir-name">${esc(n.label)} <span class="ev"><span class="a">${n.audits} audits</span> · ${n.citations} citations</span></span><span class="dir-why">${esc(n.why)}</span></li>`).join('')}
      </ul>
    </section>` : ''}

    ${deprioritised.length ? `<section class="block">
      <div class="sec-eyebrow">Effort</div>
      <div class="sec-title">Do lightly or skip</div>
      <ul class="skips">${deprioritised.map((s) => `
        <li class="skip-item"><span class="skip-name">${esc(s.label)}</span><span class="skip-why">${esc(s.notes ?? '')}</span></li>`).join('')}
      </ul>
    </section>` : ''}

    <section class="notes">
      <p class="note"><b>How to read the numbers.</b> Every source carries the number of separate
      audits it appeared in, not just its citation count, because volume alone lies — one source had
      32 citations from a single audit and read as a pattern until breadth was shown. Anything under
      ${EVIDENCE_MIN_AUDITS} audits is marked <b>thin</b> and anything under 2 is not printed at all.
      The priority badge states the count it was derived from, so it can be checked rather than taken
      on trust.</p>
      <p class="note"><b>URL UNVERIFIED means nobody has clicked it.</b> The domains are all evidenced
      from real citations; the signup paths mostly are not. Only Yell, MyBuilder, 192.com and
      Checkatrade have been checked by hand. Expect to navigate the rest yourself.</p>
      <p class="note"><b>Which sources appear</b> is derived only from citations in completed audits.
      What each host <i>is</i>, and who is allowed to action it, is hand-maintained per host and never
      per trade. No model wrote any part of this sheet.</p>
      <p class="note"><b>Timeline &amp; re-audit.</b> We re-measure at eight weeks on the same
      questions, so the comparison is like for like. We are not going to put a date on when an engine
      starts naming this business: a directory listing is read when it is read. Repeated runs of the
      same question also disagree with each other, which is why the re-audit repeats the whole set
      rather than spot-checking.</p>
      <p class="note"><b>Our promise.</b> Our promise is to get this business named in more AI answers
      within 8 weeks, or a full refund — the wording this was sold on. No client has completed a full
      eight-week cycle yet, so there are no results to point at, and we would rather say that than
      imply otherwise.</p>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(pb.businessName)}</b></span>
        <span>Findable · Operator copy</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

/** Print the operator playbook via the browser's own dialog. No PDF library. */
export function printPlaybookDoc(
  pb: Playbook,
  seo: AiAuditSeo | null = null,
  naming: { named: number; total: number } | null = null,
  directoryCheckRun = false,
): void {
  printHtmlAsPdf(renderPlaybookDoc(pb, seo, naming, directoryCheckRun), pdfTitle(pb.businessName, 'Playbook-Operator'));
}
