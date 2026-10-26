/* ═════════════════════════════════════════════════════════════════
   THE ADMIN HOME'S ONE-TAP TEMPLATES (Concept A, Paul 2026-10-26). Pure.
   The six Meta templates (src/lib/dashboardTemplates.ts) plus the two Paul chose NOT to wire (the final nudge and the
   interested follow-up), which stay disabled.
   ⛔ A button sends ONLY through sendWhatsAppRequest → send-whatsapp-message (its dashboard branch): send hours, opt-outs,
   the 24-hour rule, the QA hold and Meta's template rules all apply there; nothing here bypasses them.
   ⛔ ON / OFF IS META'S ANSWER, never a manual flip: dashboardTemplateState reads each template's last real send.
   ═════════════════════════════════════════════════════════════════ */
import { DASHBOARD_TEMPLATES, dashboardTemplateState, isDashboardTemplate, type TemplateSend } from './dashboardTemplates.ts';
import { sendErrorMeaning } from './sendErrorMeaning.ts';

export type NeedsTemplateKey =
  | 'questionnaire_domain_help' | 'questionnaire_payment_help' | 'needs_from_you' | 'agency_access' | 'agreement_next_steps' | 'nudge_24h'
  | 'final_nudge' | 'interested_follow_up';

export interface NeedsTemplate {
  key: NeedsTemplateKey;
  /** The button text. */
  label: string;
  /** Wired into the sender (one of the six). */
  wired: boolean;
  /** Never to a prospect-only market (Australia): it talks about the questions, the agreement or payment. */
  ukOnly: boolean;
}

export const NEEDS_TEMPLATES: Readonly<Record<NeedsTemplateKey, NeedsTemplate>> = {
  questionnaire_domain_help: { key: 'questionnaire_domain_help', label: 'Send domain help', wired: true, ukOnly: true },
  questionnaire_payment_help: { key: 'questionnaire_payment_help', label: 'Send payment help', wired: true, ukOnly: true },
  needs_from_you: { key: 'needs_from_you', label: 'Send what we need', wired: true, ukOnly: true },
  agency_access: { key: 'agency_access', label: 'Send agency access', wired: true, ukOnly: true },
  agreement_next_steps: { key: 'agreement_next_steps', label: 'Send agreement & next steps', wired: true, ukOnly: true },
  nudge_24h: { key: 'nudge_24h', label: 'Send 24h nudge', wired: true, ukOnly: false },
  final_nudge: { key: 'final_nudge', label: 'Send final nudge', wired: false, ukOnly: false },
  interested_follow_up: { key: 'interested_follow_up', label: 'Send follow-up', wired: false, ukOnly: false },
};

/** ok = the button may send; reason says why not (shown on the disabled button). */
export interface TemplateGate { ok: boolean; reason?: string }

const meaning = (code: string): string | null => sendErrorMeaning('whatsapp', Number(code));

/** Can this button send? Positive match only: anything unknown is a no. */
export function templateGate(key: NeedsTemplateKey | null | undefined, ctx: { prospectOnly: boolean; hasPhone: boolean; lastSend?: TemplateSend | null; nowMs?: number; neededItem?: string | null }): TemplateGate {
  if (!key) return { ok: false, reason: 'No template for this step' };
  const t = NEEDS_TEMPLATES[key];
  if (!t) return { ok: false, reason: 'Unknown template' };
  if (!t.wired || !isDashboardTemplate(key)) return { ok: false, reason: 'Not set up at Meta' };
  if (!ctx.hasPhone) return { ok: false, reason: 'No phone number on the lead' };
  if (t.ukOnly && ctx.prospectOnly) return { ok: false, reason: 'Prospect-only market: no sign-up or payment messages' };
  if (DASHBOARD_TEMPLATES[key].vars.includes('needed_item') && !(ctx.neededItem ?? '').trim()) return { ok: false, reason: 'Nothing listed as missing to ask for' };
  const s = dashboardTemplateState(key, ctx.lastSend ?? null, ctx.nowMs ?? Date.now(), meaning);
  return s.ok ? { ok: true } : { ok: false, reason: s.reason };
}
