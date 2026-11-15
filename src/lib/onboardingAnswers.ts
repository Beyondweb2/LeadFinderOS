/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT'S ONBOARDING ANSWERS — ONE READING, USED BY THE ALERT, THE CLIENT RECORD AND THE BASELINE
   (v1-onboarding-to-audit, Paul 2026-11-15: "onboarding → payment → audits fully self-serve").

   ⛔ TWO KINDS OF "NO", ONE EXCLUSION.
     · services_not_offered — they do NOT do it. Never measured, never described as offered.
     · services_not_wanted  — they DO it but do not want it pushed (London Domestic Maintenance:
       emergency call-outs). Never measured or pushed; nothing claims they don't do it.
   For question writing and the final-20 checks both are the same thing: a question about either must
   not reach the baseline. `excludedServicesOf` is that one rule — paid-baseline reads it, nothing
   re-joins the two lists by hand.

   ⚠️ coverage_area is the client's own words ("all London boroughs inside the M25"). It is CONTEXT for
   Paul approving towns, never parsed into places here — a place list is only ever what the client or
   Paul typed (areas_list), so no question is written about a town nobody named.

   Pure. Edge-reachable (findable-onboarding, paid-baseline): relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { splitServiceList } from './serviceScope.ts';
import { operatorAppUrl } from '../config/operatorApp.ts';

export interface OnboardingAnswerRow {
  confirmed_location?: unknown;
  services?: unknown;
  services_list?: unknown;
  services_not_wanted?: unknown;
  services_not_offered?: unknown;
  coverage_area?: unknown;
  areas_list?: unknown;
  top_requests?: unknown;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Every service a question must not be about: not offered + not wanted, de-duplicated, first spelling kept. */
export function excludedServicesOf(row: Pick<OnboardingAnswerRow, 'services_not_offered' | 'services_not_wanted'> | null | undefined): string[] {
  return splitServiceList([...splitServiceList(row?.services_not_offered), ...splitServiceList(row?.services_not_wanted)]);
}

/** The services they WANT to be found for: the ticked list, else the typed answer. */
export function wantedServicesOf(row: Pick<OnboardingAnswerRow, 'services' | 'services_list'> | null | undefined): string[] {
  const list = splitServiceList(row?.services_list);
  return list.length ? list : splitServiceList(row?.services);
}

export interface AnswerLine { label: string; value: string }

/** The answers as labelled lines, in the order Paul reads them. A blank answer is left out, never "—". */
export function onboardingAnswerLines(row: OnboardingAnswerRow | null | undefined): AnswerLine[] {
  if (!row) return [];
  const out: AnswerLine[] = [];
  const add = (label: string, value: string) => { if (value) out.push({ label, value }); };
  add('Main town', text(row.confirmed_location));
  add('Wants to be found for', wantedServicesOf(row).join(', '));
  add('Does NOT want pushed', splitServiceList(row.services_not_wanted).join(', '));
  add('Does NOT offer', splitServiceList(row.services_not_offered).join(', '));
  add('Area covered', text(row.coverage_area));
  add('Priority towns', splitServiceList(row.areas_list).join(', '));
  add('Most asked for', text(row.top_requests));
  return out;
}

/** The client page with the Prepare baseline step opened (ClientHub reads ?baseline=open). */
export const prepareBaselinePath = (leadId: string) => `/paid-clients/${leadId}?baseline=open`;

export interface AnswersAlert { subject: string; lines: string[]; bellTitle: string; bellBody: string; link: string }

/** The email + bell sent when a paid client finishes their setup answers. */
export function onboardingAnswersAlert(i: { businessName: string; leadId: string; row: OnboardingAnswerRow }): AnswersAlert {
  const name = text(i.businessName) || 'A client';
  const answers = onboardingAnswerLines(i.row);
  const link = prepareBaselinePath(i.leadId);
  const lines = [
    `${name} has sent their setup answers.`,
    '',
    ...answers.map((a) => `${a.label}: ${a.value}`),
    '',
    'Next: open Prepare baseline. Discovery and the 20 baseline questions are written from these answers (wanted services only, their towns, never the excluded services). Nothing runs until you approve.',
    operatorAppUrl(link),
  ];
  const wanted = wantedServicesOf(i.row);
  const excluded = excludedServicesOf(i.row);
  const bellBody = [
    wanted.length ? `Wants: ${wanted.join(', ')}` : '',
    excluded.length ? `Not: ${excluded.join(', ')}` : '',
    text(i.row.coverage_area) ? `Covers: ${text(i.row.coverage_area)}` : '',
  ].filter(Boolean).join(' · ') || 'Their answers are on the client record.';
  return {
    subject: `SETUP ANSWERS IN · ${name}`.slice(0, 180),
    lines,
    bellTitle: `Setup answers in · ${name} — prepare baseline`.slice(0, 120),
    bellBody: bellBody.slice(0, 280),
    link,
  };
}
