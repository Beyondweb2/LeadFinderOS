/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the whole generation, as one pure function.

     facts (lead + audit + crawl + research + their homepage)  →  ProspectConfig
     trade key                                                →  template (registry)
     template.render(config)                                  →  homepage HTML
     audit headline + ranked findings                         →  card copy + suggested message
     every output                                             →  claim check + contamination check

   The callers (the edge function; the local fixture script) only FETCH and PHOTOGRAPH. Every
   judgement is here, where the tests reach it. A refusal names the stage it failed at, which is
   the status the row records.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FindingSelection, PreviewStatus, ProspectConfig, ProspectHeadline, ProspectTemplate } from './types.ts';
import { buildProspectConfig, type FactsInput } from './facts.ts';
import { selectFindings, type ResearchForCard } from './findings.ts';
import { buildCardCopy, cardCopyText, copyProblems, suggestedMessage, type CardCopy } from './copy.ts';
import { renderEvidenceCard } from './evidenceCard.ts';
import { selectTemplate, PROSPECT_TEMPLATES, templateKey } from './templates/index.ts';
import { scanContamination, type ContaminationHit } from './contamination.ts';

export interface GenerateInput {
  facts: FactsInput;
  headline: ProspectHeadline;
  research: ResearchForCard | null;
  registry?: readonly ProspectTemplate[];
  /** Values from OTHER prospects/clients the caller knows about (tests; a batch run). */
  extraForbidden?: readonly string[];
  year?: number;
}

export interface GeneratedPreview {
  config: ProspectConfig;
  template: { id: string; version: string; key: string; name: string; status: string; why: string };
  selection: FindingSelection;
  card: CardCopy;
  message: string;
  homepageHtml: string;
  /** Operator-only warnings (flags + conflicts), in reading order. */
  notes: string[];
}

export type GenerateResult =
  | { ok: true; preview: GeneratedPreview }
  | { ok: false; stage: PreviewStatus; reason: string; contamination?: ContaminationHit[]; problems?: string[] };

export function generatePreview(i: GenerateInput): GenerateResult {
  const facts = buildProspectConfig(i.facts);
  if (facts.ok === false) return { ok: false, stage: 'gathering', reason: facts.reason };
  const config = facts.config;

  const choice = selectTemplate(config.tradeKey, i.registry ?? PROSPECT_TEMPLATES);
  if (choice.ok === false) return { ok: false, stage: 'selecting_template', reason: choice.reason };
  const t = choice.template;

  const selection = selectFindings(i.research);
  const hasWebsite = !!config.business.website;
  const card = buildCardCopy(i.headline, selection, config.business.name.value, hasWebsite);
  const message = suggestedMessage(i.headline, selection, hasWebsite);
  // Only OUR words are checked; the question and the firms' names are quoted verbatim from the audit.
  let msg = message;
  for (const c of i.headline.competitors) msg = msg.split(c).join('');
  const ours = cardCopyText({ ...card, question: '', competitors: [] }).split(config.business.name.value).join('') + '\n' + msg;
  const problems = copyProblems(ours);
  if (problems.length) return { ok: false, stage: 'building', reason: 'The generated wording failed the claim check.', problems };

  let homepageHtml: string;
  try {
    homepageHtml = t.render(config, { year: i.year });
  } catch (e) {
    return { ok: false, stage: 'building', reason: `The template failed to render: ${String((e as Error)?.message ?? e).slice(0, 200)}` };
  }
  const hits = scanContamination(homepageHtml, config, i.extraForbidden ?? []);
  if (hits.length) {
    return { ok: false, stage: 'building', reason: `Refused: the page contained ${hits.length} value(s) that are not this prospect's.`, contamination: hits };
  }

  const notes = [
    ...config.flags,
    ...config.conflicts.map((c) => `Conflict (${c.field}): ${c.note}`),
    ...(selection.fallback && selection.fallbackReason ? [`Card uses the no-issue wording: ${selection.fallbackReason}`] : []),
    choice.why,
  ];
  return {
    ok: true,
    preview: {
      config,
      template: { id: t.id, version: t.version, key: templateKey(t), name: t.name, status: t.status, why: choice.why },
      selection, card, message, homepageHtml, notes,
    },
  };
}

/** The card is rendered after the homepage has been photographed, so it can carry the phone shot.
 *  Checked for contamination against the same config. */
export function buildCardHtml(p: GeneratedPreview, previewImageSrc: string | null): { ok: true; html: string } | { ok: false; contamination: ContaminationHit[] } {
  const html = renderEvidenceCard(p.card, { businessName: p.config.business.name.value, brandPrimary: p.config.brand.primary?.value ?? null, previewImageSrc });
  // The card legitimately names the competitors (they are the evidence); strip them before the scan.
  let scan = html.replace(/<img[^>]*>/g, '');
  for (const c of p.card.competitors) scan = scan.split(c.replace(/&/g, '&amp;').replace(/'/g, '&#39;')).join('');
  const hits = scanContamination(scan, p.config);
  return hits.length ? { ok: false, contamination: hits } : { ok: true, html };
}
