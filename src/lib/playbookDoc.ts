import { DOC_CSS, docBand, esc, pdfTitle, printHtmlAsPdf } from './playbookDocStyle';
import type { Playbook, PlaybookStep } from './buildPlaybook';
import { EVIDENCE_MIN_AUDITS, thinTradeMessage } from './buildPlaybook';

/* ============================================================
   PRINTABLE OPERATOR PLAYBOOK — the buildPlaybook fold in the old document's clothes.

   NO LANGUAGE MODEL, AT ANY POINT. This is a pure function of the Playbook object: every sentence
   is either a template or a value already on that object. generate-playbook is not called, not
   imported, and not reachable from here.

   That is the whole design constraint, because the LLM document is what recommended ICAEW to an ACCA
   firm, ACCA's own directory (zero citations in our data) and Bing Places (zero citations across all
   8,913 audits). A model asked for plausible directories returns plausible directories. Only the
   STYLING came across from that document; the data cannot, by construction — there is no code path
   from here to PlaybookData.

   TWO SECTIONS, NOT EIGHT WEEKS. The old document was branded an 8-week Sprint but rendered a single
   priority-ordered list — there were never any weeks in it. The evidence supports exactly two
   moments: work the operator can complete now, and what is still outstanding when the guarantee is
   re-measured at week 8. Weeks 3 to 7 would be filler, and filler is the same failure mode that put
   Bing Places in the old document.

   THE HONESTY MARKERS ARE LOUDER ON PAPER THAN ON SCREEN, DELIBERATELY. A printed sheet is worked
   through away from the screen, where nothing can be checked and no tooltip can be hovered: if a
   signup URL is unverified or a source rests on 3 audits, the sheet is the only place that can say
   so. On screen those are small chips; here they are filled pills, and the print block enlarges them
   again. That is the entire difference between this document and the one it replaces.
   ============================================================ */

/** Extra rules on top of DOC_CSS. Kept here so the shared stylesheet stays byte-identical to the
 *  client-facing document it was extracted from. */
const EXTRA_CSS = `
  /* Evidence, always paired: citations alone lie, breadth is what makes them mean anything. */
  .ev{ flex:0 0 auto; font-size:11px; font-weight:700; color:var(--muted); white-space:nowrap; }
  .ev .a{ font-size:13px; font-weight:900; color:var(--ink); }
  .mins{ flex:0 0 auto; font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    color:var(--muted); background:#eef1f6; border-radius:999px; padding:2px 8px; white-space:nowrap; }

  /* Honesty pills. Filled, not outlined — these must survive a greyscale office printer. */
  .flag{ font-size:9.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    border-radius:999px; padding:2px 8px; white-space:nowrap; }
  .flag-thin{ background:var(--amber); color:#fff; }
  .flag-unver{ background:var(--red); color:#fff; }
  .flag-done{ background:var(--green); color:#fff; }

  .host{ font-size:11.5px; color:var(--faint); font-weight:700; }
  .url{ margin-top:3px; font-size:11px; color:var(--blue-2); font-weight:700; word-break:break-all; }
  .warn{ margin:0 40px 16px; padding:10px 14px; background:#fff5f5; border-left:3px solid var(--red);
    font-size:13px; font-weight:800; color:var(--red); }
  .thintrade{ margin:0 40px 16px; padding:10px 14px; background:#fffbeb; border-left:3px solid var(--amber);
    font-size:12.5px; line-height:1.5; color:#713f12; font-weight:600; }

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

  @media print{
    /* LOUDER ON PAPER. Bigger pills, bigger breadth number, and the pill backgrounds forced. */
    .flag{ font-size:10.5px; padding:3px 10px; }
    .ev .a{ font-size:14px; }
    .flag,.mins,.kind,.warn,.thintrade,.fields{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    .fields,.win,.act{ break-inside:avoid; }
  }
`;

/** citations + audits, always together, with the breadth number emphasised. */
const evidence = (s: { citations: number; audits: number }): string =>
  `<span class="ev"><span class="a">${s.audits} audits</span> · ${s.citations} citations</span>`;

const flags = (s: PlaybookStep): string => {
  const out: string[] = [];
  if (s.done) out.push('<span class="flag flag-done">done</span>');
  if (s.host && s.strength === 'thin') out.push(`<span class="flag flag-thin">thin · ${s.audits} audits only</span>`);
  // Loudest marker on the sheet. 63 of 66 signup URLs have never been clicked by a human.
  if (s.signupUrl && !s.urlVerified) out.push('<span class="flag flag-unver">url unverified</span>');
  return out.join(' ');
};

const fields = (s: PlaybookStep): string => s.fields.length === 0 ? '' : `
        <div class="fields">${s.fields.map((f) => `
          <div class="fk">${esc(f.name)}</div><div class="fv${f.missing ? ' miss' : ''}">${esc(f.value || '—')}</div>`).join('')}
        </div>`;

const act = (s: PlaybookStep): string => `
      <li class="act">
        <div class="act-top">
          <span class="act-do">${esc(s.label)}${s.host ? ` <span class="host">${esc(s.host)}</span>` : ''}</span>
          <span class="act-tags">${s.minutes > 0 ? `<span class="mins">${s.minutes} min</span>` : ''}${s.host ? evidence(s) : ''}</span>
        </div>
        ${flags(s) ? `<div style="margin-top:4px">${flags(s)}</div>` : ''}
        ${s.blockedReason ? `<div class="act-why"><b>Client must do this:</b> ${esc(s.blockedReason)}</div>` : ''}
        ${s.notes ? `<div class="act-why">${esc(s.notes)}</div>` : ''}
        ${s.signupUrl ? `<div class="url">${esc(s.signupUrl)}</div>` : ''}
        ${fields(s)}
      </li>`;

const group = (title: string, sub: string, rows: PlaybookStep[]): string => rows.length === 0 ? '' : `
      <div class="act-group">
        <div class="act-group-h">${esc(title)}</div>
        <div class="act-group-sub">${esc(sub)}</div>
        <ul class="acts">${rows.map(act).join('')}</ul>
      </div>`;

/** How many competitors to print. See the note at the call site. */
const WHO_IS_WINNING_LIMIT = 20;

export function renderPlaybookDoc(pb: Playbook): string {
  const now = pb.steps.filter((s) => s.section === 'do_now');
  const blocked = pb.steps.filter((s) => s.section === 'blocked');
  const noWebsite = pb.steps.filter((s) => s.section === 'no_website');
  const deprioritised = pb.steps.filter((s) => s.section === 'deprioritised');
  const nowMinutes = now.reduce((n, s) => n + s.minutes, 0);
  const vert = [pb.trade, pb.town].filter(Boolean).join(' · ');

  /* Template, never generated. Counts and minutes come straight off the fold. */
  const summary = `${now.length} task${now.length === 1 ? '' : 's'} I can complete now, about `
    + `${nowMinutes} minutes of work. ${blocked.length} item${blocked.length === 1 ? '' : 's'} `
    + `need${blocked.length === 1 ? 's' : ''} the client before week 8. Derived from `
    + `${pb.tradeAudits} measured ${pb.trade ?? 'business'} audit${pb.tradeAudits === 1 ? '' : 's'} — `
    + `nothing here is a recommendation anyone typed from memory.`;

  const winners = pb.whoIsWinning.slice(0, WHO_IS_WINNING_LIMIT);
  const hidden = pb.whoIsWinning.length - winners.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Playbook — ${esc(pb.businessName)}</title>
<style>${DOC_CSS}${EXTRA_CSS}</style>
</head>
<body>
  <div class="sheet">
${docBand('Delivery Playbook · Operator copy')}
    <div class="internal-flag">Internal — execution copy. Contains the client’s competitors; never hand this over</div>
    <div class="head">
      <div class="for">8-week Sprint · delivery checklist for</div>
      <h1>${esc(pb.businessName)}</h1>
      ${vert ? `<div class="vert">${esc(vert)}</div>` : ''}
    </div>
    <div class="summary">${esc(summary)}</div>
${pb.missingAddress ? `    <div class="warn">No address on file — every signup below asks for one. Get it from the client first or none of this can be completed.</div>\n` : ''}${pb.tradeTooThin ? `    <div class="thintrade">${esc(thinTradeMessage(pb.trade, pb.tradeAudits))}</div>\n` : ''}
    <section class="plan">
      <div class="plan-h">
        <div class="sec-eyebrow">Section 1 of 2 · now</div>
        <div class="sec-title">What I can do now — ${nowMinutes} minutes</div>
      </div>
      ${group('Do now', 'Completable start to finish without the client. In this order.', now)
        || '<p class="wk-client">Nothing is currently actionable without the client.</p>'}
    </section>

    <section class="block tint">
      <div class="sec-eyebrow">Section 2 of 2 · week 8</div>
      <div class="sec-title">What unblocks by week 8, when we re-measure</div>
      ${group('Blocked — client only', 'Goes in the client pack. None of it moves until they act, and week 8 measures whether it did.', blocked)}
      ${group('No website', 'Gemini builds answers from businesses’ own sites. With no site there is nothing of theirs to read.', noWebsite)}
    </section>

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
      <div class="sec-eyebrow">Measured and rejected</div>
      <div class="sec-title">Do not spend the hour here</div>
      <ul class="skips">${deprioritised.map((s) => `
        <li class="skip-item"><span class="skip-name">${esc(s.label)}</span><span class="skip-why">${esc(s.notes ?? '')}</span></li>`).join('')}
      </ul>
    </section>` : ''}

    <section class="notes">
      <p class="note"><b>How to read the numbers.</b> Every source carries the number of separate
      audits it appeared in, not just its citation count, because volume alone lies — one source had
      32 citations from a single audit and read as a pattern until breadth was shown. Anything under
      ${EVIDENCE_MIN_AUDITS} audits is marked <b>thin</b> and anything under 2 is not printed at all.</p>
      <p class="note"><b>URL UNVERIFIED means nobody has clicked it.</b> The domains are all evidenced
      from real citations; the signup paths mostly are not. Only Yell, MyBuilder, 192.com and
      Checkatrade have been checked by hand. Expect to navigate the rest yourself.</p>
      <p class="note"><b>Which sources appear</b> is derived only from citations in completed audits.
      What each host <i>is</i>, and who is allowed to action it, is hand-maintained per host and never
      per trade. No model wrote any part of this sheet.</p>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Delivery checklist · <b>${esc(pb.businessName)}</b></span>
        <span>Findable · Operator copy</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

/** Print the operator playbook via the browser's own dialog. No PDF library. */
export function printPlaybookDoc(pb: Playbook): void {
  printHtmlAsPdf(renderPlaybookDoc(pb), pdfTitle(pb.businessName, 'Playbook-Operator'));
}
