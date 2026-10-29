/* THE PITCH STEP — Jess's pitch system drives it (docs/ugc-brand-finder.md). Pure: fn ugc-brands supplies the two
 * model calls; the orchestration, the prompts and every check live here and are tested without a model.
 *
 *   1 WRITE   the writer is given her whole pitch system (private DB record), "About Jess", the ONE template this
 *             brand's tier + contact route needs, and the research fields. It returns the research it used, a concept
 *             (her concept recipe), its own concept-gate verdict, hooks and the hook test, and the draft.
 *   2 REVIEW  a SECOND, independent call that never saw the writer's reasoning re-runs the concept gate and the
 *             hook test against her system and the research only.
 *   3 CODE    pitchProblems(): no rate, no Thailand in a brand or agency pitch, no figure that is not in "About Jess" or the
 *             research, no placeholder, the portfolio link where her template has one.
 *   Fail any → try again, at most MAX_PITCH_ATTEMPTS. Still failing → "Needs Jess": NOTHING is drafted.
 *
 * ⛔ "About Jess" is the only source for personal claims. Rates are stored but never given to the writer.
 * ⛔ NOTHING IS SENT. Jess copies, opens Gmail / Instagram / WhatsApp herself, and logs it. */

import { JESS_PORTFOLIO_URL } from './config.ts';

export const MAX_PITCH_ATTEMPTS = 3;

/** Her template keys (names follow her sheet's "Template version"). Text is hers, from her private record. */
export const TEMPLATE_KEYS = [
  'ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2', 'ig_dm_ad_idea_v2', 'follow_up_1', 'follow_up_2',
  'agency_roster_v1', 'cm_collab_dm_v4',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  ad_idea_v2: 'Ad idea v2 (Tier A/B)', video_idea_v3: 'Video idea v3 (Tier C/D)', generic_inbox_v2: 'Generic inbox (v2)',
  ig_dm_ad_idea_v2: 'IG DM ad idea v2', follow_up_1: 'Follow-up 1 (hook v1)', follow_up_2: 'Follow-up 2',
  agency_roster_v1: 'Agency roster v1', cm_collab_dm_v4: 'CM collab DM v4',
};

/** WhatsApp: her system has no template. This is a DRAFT for Jess to approve (Paul, 2026-10-29) — offered as the
 *  default opener only once she approves it in her settings. Two-step: ask who handles it, then pitch that person. */
export const WHATSAPP_ASK_DRAFT =
  "Hi [Brand] team! I'm Jess, a British UGC creator (and former lawyer). I have a paid UGC ad idea for [Product]. Who's the best person to send it to? Happy to email it over.";

export function fillWhatsAppAsk(template: string, brand: string, product: string | null | undefined): string {
  return template.replace(/\[Brand\]/g, brand).replace(/\[Product\]/g, product?.trim() || brand);
}

export interface PitchSystem {
  content: string;
  about_jess: string;
  templates: Partial<Record<TemplateKey, string>>;
  /** Her formatted sign-off (added by Copy email). The writer never writes a sign-off itself. */
  signoff_html?: string;
}

export interface ResearchFields {
  brand: string;
  product: string | null;
  product_detail: string | null;
  detail_url: string | null;
  pays_for_ugc_evidence: string | null;
  niche: string | null;
  website: string | null;
  ads_summary: string | null;
  creators_seen: string[];
  snippets: string[];
}

export interface PitchBrand {
  name: string;
  niche?: string | null;
  website?: string | null;
  live_ads_count?: number | null;
  creators_seen?: readonly string[] | null;
  ad_samples?: ReadonlyArray<{ text?: string; link?: string }> | null;
  research?: { snippets?: readonly string[]; product?: string; product_detail?: string; detail_url?: string; pays_for_ugc_evidence?: string } | null;
}

export function researchFields(b: PitchBrand): ResearchFields {
  const r = b.research ?? {};
  const ads = (b.live_ads_count ?? 0) > 0 ? `${b.live_ads_count} active video ads in the Meta Ads Library` : null;
  return {
    brand: b.name, product: r.product ?? null, product_detail: r.product_detail ?? null, detail_url: r.detail_url ?? null,
    pays_for_ugc_evidence: r.pays_for_ugc_evidence ?? (b.creators_seen?.length ? `Branded content with ${b.creators_seen.slice(0, 3).join(', ')}` : null),
    niche: b.niche ?? null, website: b.website ?? null, ads_summary: ads,
    creators_seen: [...(b.creators_seen ?? [])].slice(0, 5),
    snippets: [...(r.snippets ?? []), ...(b.ad_samples ?? []).map((a) => a.text ?? '').filter(Boolean)].slice(0, 5).map((s) => s.slice(0, 300)),
  };
}

export type PitchTrack = 'brand' | 'local';
export interface PitchPlan { track: PitchTrack; template: TemplateKey; variant: 'standard' | 'named_person' | 'generic_inbox' | 'ig_dm'; personName?: string | null }

/** Which of her templates: tier family for email, Generic inbox for a generic address, IG DM v2 for a DM, CM v4 local. */
export function chooseTemplate(a: { track: PitchTrack; tierFamily: 'ad_idea_v2' | 'video_idea_v3' | null; variant: PitchPlan['variant'] }): TemplateKey | null {
  if (a.track === 'local') return 'cm_collab_dm_v4';
  if (a.variant === 'ig_dm') return 'ig_dm_ad_idea_v2';
  if (a.variant === 'generic_inbox') return 'generic_inbox_v2';
  return a.tierFamily;
}

/** Templates that carry her portfolio link (the IG DM and the CM DM have none, as she wrote them). */
const LINKED: ReadonlySet<TemplateKey> = new Set(['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2', 'agency_roster_v1']);

export const WRITE_OUTPUT_SHAPE = '{"research_used":{"product":"","hero_moment":"","detail":"","detail_url":""},"concept":{"name":"","visuals":["",""],"why_it_fits":""},"concept_gate":{"pass":true,"reasons":[""]},"hooks":["",""],"hook_test":{"chosen":"","pass":true,"why":""},"subject":"","body":""}';
export const REVIEW_OUTPUT_SHAPE = '{"concept_gate_pass":true,"hook_test_pass":true,"follows_template":true,"problems":[""]}';

export function writePrompt(sys: PitchSystem, plan: PitchPlan, research: ResearchFields, previousProblems: string[] = []): { system: string; user: string } {
  const template = sys.templates[plan.template] ?? '';
  const system = [
    "You write cold pitches for Jess, a UGC creator, following HER pitch system exactly. Her system:",
    '"""', sys.content.trim() || '(her pitch system has not been loaded yet)', '"""',
    'About Jess — the ONLY source for anything personal about her. Never add a claim, number or client that is not here:',
    '"""', sys.about_jess.trim() || '(empty)', '"""',
    `The template to follow exactly as written (${TEMPLATE_LABEL[plan.template]}${plan.variant === 'generic_inbox' ? ', generic inbox' : plan.variant === 'named_person' ? ', named person' : ''}):`,
    '"""', template.trim() || '(template text not loaded)', '"""',
    'Hard rules: use ONLY the research fields for facts about the brand; never state a rate or price; never invent timings, results or figures.',
    sys.signoff_html?.trim() ? 'Stop after the call to action: do NOT write a sign-off or portfolio line. Her formatted sign-off is added after the body.' : '',
    /* Paul, 2026-10-29: no Thailand in brand or agency pitches (her export dropped "I'm based in Thailand" on 27.10.26).
       The Chiang Mai local track uses CM collab DM v4 exactly as written, "living in Chiang Mai" included. */
    plan.track === 'local'
      ? 'This is the Chiang Mai local collab track: use CM collab DM v4 exactly as written, including "living in Chiang Mai".'
      : 'Never mention Thailand, Chiang Mai, any Thai place, or where Jess lives.',
    ...(['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2'].includes(plan.template) ? [
      'These are checked word for word and the draft is rejected without them:',
      `- the Hume proof, both sentences: "${HUME_PROOF}"`,
      '- the intro has "(and former lawyer)" in brackets, and the concept sentence ends "I can film it with a few opening hooks, so you can see which one works best."',
      `- the ONE call to action: "${plan.template === 'generic_inbox_v2' ? CTA.generic : plan.template === 'ad_idea_v2' ? CTA.ad : CTA.video}"`,
      plan.template === 'generic_inbox_v2' ? '- the routing line comes first after the greeting' : '- NO routing line (that is only for a generic inbox)',
    ] : []),
    plan.track === 'brand' ? 'Draft at least five hooks in both voices; the chosen hook is a first-person or "you" statement, not a question. The payoff is an action, never a state or a result.' : '',
    `Return JSON only, this shape: ${WRITE_OUTPUT_SHAPE}`,
  ].join('\n');
  const user = [
    'Research fields:', JSON.stringify(research, null, 1),
    plan.personName ? `Named contact: ${plan.personName}` : '',
    previousProblems.length ? `Your last attempt failed these checks — fix them: ${previousProblems.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  return { system, user };
}

/** The second, independent pass: it sees her system, the research and the draft — never the writer's own verdicts. */
export function reviewPrompt(sys: PitchSystem, plan: PitchPlan, research: ResearchFields, draft: { concept: unknown; hook: string; subject: string; body: string }): { system: string; user: string } {
  return {
    system: [
      "You independently check a pitch against Jess's pitch system. Apply her concept gate and her hook test strictly. Her system:",
      '"""', sys.content.trim() || '(not loaded)', '"""',
      'Also fail it if it uses any fact not in the research or in About Jess, states a rate, or breaks the template.',
      `About Jess: """${sys.about_jess.trim()}"""`,
      `Template (${TEMPLATE_LABEL[plan.template]}): """${(sys.templates[plan.template] ?? '').trim()}"""`,
      `Return JSON only: ${REVIEW_OUTPUT_SHAPE}`,
    ].join('\n'),
    user: `Research: ${JSON.stringify(research)}\nConcept: ${JSON.stringify(draft.concept)}\nOpening hook: ${draft.hook}\nSubject: ${draft.subject}\nBody:\n${draft.body}`,
  };
}

const THAILAND = /\b(thailand|thai|chiang mai|bangkok|phuket|krabi|koh samui|based in asia)\b/i;
const RATE = /(£|\$|€|usd|gbp)\s?\d|\d+\s?(£|\$|€)|\b(rate|rates|per video|fee|day rate|package price)\b/i;

/** Figures in the text that appear neither in About Jess nor in the research (an unverified claim). */
export function unverifiedFigures(text: string, sources: string): string[] {
  const src = sources.toLowerCase();
  const figs = text.match(/\b\d[\d,.]*\s?(k|%|x|m)?\b/gi) ?? [];
  return [...new Set(figs.map((f) => f.trim()))].filter((f) => !src.includes(f.toLowerCase()) && !src.includes(f.replace(/,/g, '').toLowerCase()));
}

export function pitchProblems(d: { subject?: string; body?: string } | null | undefined, ctx: { plan: PitchPlan; aboutJess: string; research: ResearchFields; signoffHtml?: string; templateText?: string }): string[] {
  if (!d?.body?.trim()) return ['no_body'];
  const p: string[] = [];
  const isEmail = ctx.plan.template !== 'ig_dm_ad_idea_v2' && ctx.plan.template !== 'cm_collab_dm_v4';
  if (isEmail && !d.subject?.trim()) p.push('no_subject');
  const all = `${d.subject ?? ''}\n${d.body}`;
  /* No Thailand in a brand or agency pitch (Paul, 2026-10-29). The local track's own template says "living in Chiang Mai". */
  if (ctx.plan.track !== 'local' && THAILAND.test(all)) p.push('mentions_thailand');
  if (RATE.test(all)) p.push('mentions_a_rate');
  if (/\[[^\]]*\]|\{\{|<\w+>|\bTODO\b/.test(all)) p.push('placeholder_left');
  /* Her formatted sign-off carries the portfolio link; a body without it is fine only when the sign-off has it. */
  if (LINKED.has(ctx.plan.template) && !/jesscousin\.com/i.test(`${d.body}\n${ctx.signoffHtml ?? ''}`)) p.push('no_portfolio_link');
  /* A figure is verified when it is in About Jess, the research, or her own template (her CM v4 reach figures). */
  const sources = `${ctx.aboutJess}\n${JSON.stringify(ctx.research)}\n${ctx.templateText ?? ''}\n${JESS_PORTFOLIO_URL}`;
  const figs = unverifiedFigures(all, sources);
  if (figs.length) p.push(`unverified_figures:${figs.join(',')}`);
  /* Her length rules (pitch-system sections 4 and 5), counted on the body before the sign-off. */
  const lim = WORD_LIMITS[ctx.plan.template];
  if (lim) {
    const n = wordCount(d.body);
    if (n > lim.max) p.push(`too_long:${n}>${lim.max}`);
    if (lim.min && n < lim.min) p.push(`too_short:${n}<${lim.min}`);
  }
  p.push(...emailStructureProblems(d.body, ctx.plan));
  return p;
}

/* ── her fixed wording, checked word for word (pitch system 4b, 5b) ─────────────────────────── */
export const HUME_PROOF = 'I recently created paid content for Hume Health, whose feedback highlighted my fast turnaround and attention to the brief. You can see my work and their review on my portfolio.';
export const CTA = {
  ad: 'Would this be worth testing in your paid ads?',
  video: 'Would this fit any paid UGC briefs you have coming up?',
  generic: "Who's the best person to speak to about paid UGC?",
} as const;
const ROUTING_LINE = /Could you (point me towards whoever manages paid creator content at|pass this to)/i;
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ');

/** The brand-email structure her template fixes: the Hume proof (both sentences), "(and former lawyer)", the hooks
 *  line, the ONE call to action for this tier / inbox, and the routing line only on a generic inbox. */
export function emailStructureProblems(body: string, plan: PitchPlan): string[] {
  if (!['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2'].includes(plan.template)) return [];
  const b = norm(body);
  const p: string[] = [];
  if (!b.includes(norm(HUME_PROOF))) p.push('hume_proof_not_word_for_word');
  if (!/\(and former lawyer\)/.test(b)) p.push('intro_missing_former_lawyer_in_brackets');
  if (!/I can film it with a few opening hooks/i.test(b)) p.push('hooks_line_missing');
  const generic = plan.template === 'generic_inbox_v2';
  const want = generic ? CTA.generic : plan.template === 'ad_idea_v2' ? CTA.ad : CTA.video;
  if (!b.includes(norm(want))) p.push(`cta_should_be:${want}`);
  for (const other of Object.values(CTA)) if (other !== want && b.includes(norm(other))) p.push('wrong_cta_for_tier_or_inbox');
  if (generic && !ROUTING_LINE.test(b)) p.push('routing_line_missing');
  if (!generic && ROUTING_LINE.test(b)) p.push('routing_line_only_for_a_generic_inbox');
  return p;
}

/** Her hook test, the parts code can hold: at least five hooks drafted, and the chosen one is not a plain question
 *  (she allows a question at most one hook in five, never as the safe default). */
export function hookProblems(w: WriteOut): string[] {
  const p: string[] = [];
  const hooks = (w.hooks ?? []).filter((h) => h?.trim());
  if (hooks.length < 5) p.push(`fewer_than_five_hooks:${hooks.length}`);
  if (/\?\s*$/.test(w.hook_test?.chosen ?? '')) p.push('chosen_hook_is_a_question');
  return p;
}

/** Her readiness rule (pitch system 2): a brand is "Ready" only when its research is filled — ONE named product, a
 *  verified product detail, and a contact route. Anything missing → Needs Jess, and the model is never called. */
export function researchMissing(research: ResearchFields, route: { kind: string } | null | undefined, track: PitchTrack): string[] {
  if (track === 'local') return route && route.kind !== 'none' ? [] : ['contact (Instagram)'];
  const m: string[] = [];
  if (!research.product?.trim()) m.push('product');
  if (!research.product_detail?.trim()) m.push('verified product detail');
  if (!route || route.kind === 'none') m.push('contact');
  return m;
}

/** Words in a body, the way a reader counts them (hyphenated words and contractions are one word). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Her word limits per template (email 80 to 140 before the sign-off; IG DM 40 to 65; agency 70 to 120; FU1 under 60). */
export const WORD_LIMITS: Partial<Record<TemplateKey, { min?: number; max: number }>> = {
  ad_idea_v2: { min: 80, max: 140 }, video_idea_v3: { min: 80, max: 140 }, generic_inbox_v2: { min: 80, max: 140 },
  ig_dm_ad_idea_v2: { min: 40, max: 65 }, agency_roster_v1: { min: 70, max: 120 }, follow_up_1: { max: 59 },
};

/* ── the pipeline ──────────────────────────────────────────────────────────────────────────── */

export interface WriteOut {
  research_used?: Record<string, unknown>;
  concept?: { name?: string; visuals?: string[]; why_it_fits?: string };
  concept_gate?: { pass?: boolean; reasons?: string[] };
  hooks?: string[];
  hook_test?: { chosen?: string; pass?: boolean; why?: string };
  subject?: string;
  body?: string;
}
export interface ReviewOut { concept_gate_pass?: boolean; hook_test_pass?: boolean; follows_template?: boolean; problems?: string[] }

export interface PipelineDeps {
  write(prompt: { system: string; user: string }): Promise<WriteOut | null>;
  review(prompt: { system: string; user: string }): Promise<ReviewOut | null>;
}
export interface PipelineAttempt { n: number; write: WriteOut | null; review: ReviewOut | null; problems: string[] }
export type PipelineResult =
  | { outcome: 'drafted'; subject: string; body: string; attempts: PipelineAttempt[] }
  | { outcome: 'needs_jess'; why: string; attempts: PipelineAttempt[] };

/** Run write → independent review → code checks, at most MAX_PITCH_ATTEMPTS times. Positive match: only an
 *  explicit pass from BOTH the writer's gate/hook test and the reviewer counts; an absent verdict is a fail. */
export async function runPitchPipeline(deps: PipelineDeps, sys: PitchSystem, plan: PitchPlan, research: ResearchFields, missing: string[] = []): Promise<PipelineResult> {
  const attempts: PipelineAttempt[] = [];
  if (!sys.content.trim() || !(sys.templates[plan.template] ?? '').trim()) {
    return { outcome: 'needs_jess', why: 'Her pitch system or this template is not loaded yet.', attempts };
  }
  /* Not "Ready" (her rule): no model call, nothing drafted. */
  if (missing.length) return { outcome: 'needs_jess', why: `Research missing: ${missing.join(', ')}.`, attempts };
  let carry: string[] = [];
  for (let n = 1; n <= MAX_PITCH_ATTEMPTS; n++) {
    const w = await deps.write(writePrompt(sys, plan, research, carry));
    const problems: string[] = [];
    let r: ReviewOut | null = null;
    if (!w) problems.push('writer_failed');
    else {
      if (plan.track === 'brand') {
        if (w.concept_gate?.pass !== true) problems.push('concept_gate_failed');
        if (w.hook_test?.pass !== true) problems.push('hook_test_failed');
        problems.push(...hookProblems(w));
      }
      problems.push(...pitchProblems(w, { plan, aboutJess: sys.about_jess, research, signoffHtml: sys.signoff_html, templateText: sys.templates[plan.template] }));
      if (!problems.length) {
        r = await deps.review(reviewPrompt(sys, plan, research, { concept: w.concept ?? null, hook: w.hook_test?.chosen ?? '', subject: w.subject ?? '', body: w.body ?? '' }));
        if (!r) problems.push('review_failed');
        else {
          if (plan.track === 'brand' && r.concept_gate_pass !== true) problems.push('review_concept_gate_failed');
          if (plan.track === 'brand' && r.hook_test_pass !== true) problems.push('review_hook_test_failed');
          if (r.follows_template !== true) problems.push('review_template_not_followed');
          for (const x of r.problems ?? []) if (x?.trim()) problems.push(`review:${x.trim().slice(0, 120)}`);
        }
      }
    }
    attempts.push({ n, write: w, review: r, problems });
    if (!problems.length && w) return { outcome: 'drafted', subject: (w.subject ?? '').trim(), body: (w.body ?? '').trim(), attempts };
    carry = problems;
  }
  return { outcome: 'needs_jess', why: `Failed checks ${MAX_PITCH_ATTEMPTS} times: ${carry.slice(0, 3).join('; ')}`, attempts };
}

/* ── sending is Jess's: copy + open links ──────────────────────────────────────────────────── */

/** Gmail compose with To and Subject only — the body is pasted from "Copy email" so her formatted sign-off and
 *  live links survive. (Gmail API drafts are a later stage.) */
export function gmailComposeUrl(a: { to: string; subject: string; from?: string | null }): string {
  const p = new URLSearchParams({ view: 'cm', fs: '1', to: a.to, su: a.subject });
  if (a.from) p.set('authuser', a.from);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);

/** Her sign-off HTML kept to plain formatting: p, br, b/strong, i/em, span, div and https / mailto links. Any other
 *  tag, any on* attribute and any other link scheme is dropped (it is rendered on the page and copied to Gmail). */
export function safeSignoffHtml(html: string | null | undefined): string {
  const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'span', 'div', 'a', 'u']);
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, name: string, attrs: string) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return '';
      if (tag.startsWith('</')) return `</${n}>`;
      if (n !== 'a') return `<${n}>`;
      const href = attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? attrs.match(/href\s*=\s*'([^']*)'/i)?.[1] ?? '';
      return /^(https:\/\/|mailto:)/i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}">` : '<a>';
    });
}

/** "Copy email": HTML (paragraphs, live links, her formatted sign-off) + a plain-text twin for the clipboard. */
export function copyEmailPayload(body: string, signoffHtml: string | null | undefined): { html: string; text: string } {
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, '<br>')}</p>`).join('');
  const sign = safeSignoffHtml(signoffHtml).trim();
  const signText = sign.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  return { html: `${paras}${sign ? `<div>${sign}</div>` : ''}`, text: `${body.trim()}${signText ? `\n\n${signText}` : ''}` };
}

/** A wa.me link from stored digits (country code included); null when unusable. */
export function whatsappChatUrl(digits: string | null | undefined, text: string): string | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
