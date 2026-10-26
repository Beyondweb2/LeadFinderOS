/* ═════════════════════════════════════════════════════════════════
   THE DASHBOARD'S META TEMPLATES IN THE INBOX PICKER (Paul, 2026-10-26: "make them selectable there too"). Pure.
   The templates themselves (variables, transcript) are src/lib/dashboardTemplates.ts; this file only says how the Inbox's
   "Send a template" picker offers them: their own group, a plain-English label, and who may pick which.
   ⛔ SENT THROUGH THE SAME ONE SENDER as every Inbox template (useInbox.send → send-whatsapp-message, via 'inbox'): send
   hours (queued outside them), caps, opt-outs, the 24-hour rule, the QA hold and Meta's rules all apply there. The server's
   dashboard branch is ADMIN ONLY, so the group is shown to an admin only. WhatsApp only (never the SMS tab).
   ⛔ AUSTRALIA IS PROSPECT-ONLY: the ones about the questionnaire, the agreement or payment (NEEDS_TEMPLATES ukOnly) are
   greyed for an Australian lead, with the reason. re_engage_49 is already in the main list (WHATSAPP_TEMPLATES).
   NOT offered (Paul): final_nudge, payment_failed.
   ═════════════════════════════════════════════════════════════════ */
import { DASHBOARD_TEMPLATES, DASHBOARD_TEMPLATE_NAMES, isDashboardTemplate, type DashboardTemplateName } from './dashboardTemplates.ts';
import { NEEDS_TEMPLATES } from './needsMeTemplates.ts';

export const INBOX_DASHBOARD_GROUP_LABEL = 'Questionnaire / follow-up';

/** What each one is FOR, in the picker. Meta's wording is not known to the app, so a label never quotes it. */
const PICKER_LABELS: Record<DashboardTemplateName, string> = {
  questionnaire_domain_help: 'Domain help — stuck on the domain step of the questionnaire',
  questionnaire_payment_help: 'Payment help — stuck at the payment step',
  needs_from_you: 'What we need from you — asks for one thing (you type it)',
  agency_access: 'Agency access — getting access from their web agency',
  agreement_next_steps: 'Agreement & next steps — after they sign',
  nudge_24h: '24-hour nudge — a gentle chase a day later',
  pick_up_conversation: 'Pick up the conversation — they replied, we were slow',
};

export const INBOX_DASHBOARD_TEMPLATES: { value: DashboardTemplateName; label: string }[] =
  DASHBOARD_TEMPLATE_NAMES.map((value) => ({ value, label: PICKER_LABELS[value] }));

export { isDashboardTemplate };

/** Does this template need the person to type something before it can go (needs_from_you {{2}}). */
export const needsTypedItem = (name: string): boolean =>
  isDashboardTemplate(name) && (DASHBOARD_TEMPLATES[name].vars as readonly string[]).includes('needed_item');

/** May this person pick it for this lead, and if not, why. Absent facts refuse (never an open default). */
export function inboxDashboardSendability(name: DashboardTemplateName, ctx: { isAdmin: boolean; sms: boolean; prospectOnly: boolean }): { ok: boolean; reason?: string } {
  if (ctx.sms) return { ok: false, reason: 'WhatsApp only.' };
  if (ctx.isAdmin !== true) return { ok: false, reason: 'Only an admin can send this template.' };
  if (NEEDS_TEMPLATES[name].ukOnly && ctx.prospectOnly) return { ok: false, reason: 'Australia is prospect-only: no questionnaire, agreement or payment messages.' };
  return { ok: true };
}
