/* A FINAL PITCH PASTED BY JESS (from her own Claude Project) — docs/ugc-brand-finder.md.
 * Her words are saved as the brand's draft (the send buttons use pitch_subject / pitch_body). Our checks still run on
 * it, but they only WARN: she can save anyway. Pure. */

import { pitchProblems, researchFields, chooseTemplate, type PitchBrand, type PitchPlan, type PitchSystem, type TemplateKey } from './pitch.ts';
import type { ContactChoice } from './contactOrder.ts';
import { templateFamilyFor, type TierResult } from './tiers.ts';

/** Who wrote the draft, as stored in pitch_writer. */
export const PASTED_WRITER = 'jess';
export const AI_DRAFT_WRITER_NOTE = 'AI draft (beta)';

const PROBLEM_TEXT: Record<string, string> = {
  no_body: 'There is no pitch text.',
  no_subject: 'An email needs a subject.',
  mentions_thailand: 'It mentions Thailand (not allowed in a brand pitch).',
  mentions_a_rate: 'It states a rate or price.',
  placeholder_left: 'A [placeholder] is still in the text.',
  no_portfolio_link: 'No portfolio link (jesscousin.com) in the pitch or your sign-off.',
  banned_phrase_or_em_dash: 'It has a banned phrase or an em dash.',
  implies_she_already_uses_it: 'It implies you already use the product.',
};

/** A problem code in plain words for the warning list. */
export function problemText(code: string): string {
  if (PROBLEM_TEXT[code]) return PROBLEM_TEXT[code];
  const [k, rest] = code.split(':');
  if (k === 'too_long') return `Too long (${rest.replace('>', ' words, limit ')}).`;
  if (k === 'too_short') return `Too short (${rest.replace('<', ' words, minimum ')}).`;
  if (k === 'unverified_figures') return `A figure is not in About Jess or the research: ${rest}.`;
  return code.replace(/_/g, ' ');
}

/** Warnings for a pasted pitch (never a block: Jess can save anyway). */
export function pastedPitchProblems(
  d: { subject?: string; body?: string },
  brand: PitchBrand & { track?: string | null },
  tier: TierResult,
  contact: ContactChoice,
  system: Pick<PitchSystem, 'about_jess' | 'signoff_html' | 'templates'> | null,
): { problems: string[]; template: TemplateKey } {
  const track = brand.track === 'local' ? 'local' : 'brand';
  const variant: PitchPlan['variant'] = contact.variant ?? 'standard';
  const template = chooseTemplate({ track, tierFamily: templateFamilyFor(tier.tier), variant }) ?? 'ad_idea_v2';
  const plan: PitchPlan = { track, template, variant, personName: contact.person?.name ?? null };
  const all = pitchProblems(d, { plan, aboutJess: system?.about_jess ?? '', research: researchFields(brand), signoffHtml: system?.signoff_html, templateText: system?.templates?.[template] });
  /* Her own pitch comes from her Claude Project, so only her stated limits and the safety checks warn: no Thailand,
     no rate, no placeholder, no missing subject, her word limits. (Her fixed-wording and figure checks judged a MODEL's draft.) */
  const keep = (p: string) => /^(no_body|no_subject|mentions_thailand|mentions_a_rate|placeholder_left|too_long|too_short)/.test(p);
  return { problems: all.filter(keep), template };
}
