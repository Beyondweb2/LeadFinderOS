/* ═════════════════════════════════════════════════════════════════
   THE ADMIN HOME'S ONE-TAP TEMPLATES (Concept A, Paul 2026-10-26). Pure and edge-safe.
   docs/design/admin-dashboard/README.md §3.
   ⛔ A button sends ONLY through the normal sender (sendWhatsAppRequest → send-whatsapp-message): send hours,
   opt-outs, the 24-hour window, one-per-lead and Meta's template rules all apply there; nothing here bypasses them.
   ⛔ A PROPOSED template (not yet registered with Meta and the sender) is never sendable: its button stays disabled.
   Paul marks it "approved by Meta" (table dashboard_template_approvals); even then it stays disabled until it is
   added to the sender's own template list with the exact registered words — `inSender` below — never "try it".
   The words here are PLACEHOLDERS from the README for Paul to edit; Meta renders its own registered text.
   ═════════════════════════════════════════════════════════════════ */

export type NeedsTemplateKey =
  | 'questionnaire_followup' | 'domain_help' | 'agency_access' | 'agreement_next_steps' | 'payment_help'
  | 'what_we_need' | 'interested_follow_up' | 'nudge_24h' | 'final_nudge';

export interface NeedsTemplate {
  key: NeedsTemplateKey;
  /** The button text. */
  label: string;
  /** Placeholder wording ({{1}} first name, {{2}} the detail). */
  body: string;
  /** Registered with Meta AND in the sender's template list today. */
  inSender: boolean;
  /** Never to a prospect-only market (Australia): it talks about the questions, the agreement or payment. */
  ukOnly: boolean;
}

export const NEEDS_TEMPLATES: Readonly<Record<NeedsTemplateKey, NeedsTemplate>> = {
  /* The one that exists today (registered 2026-08-17; body in questionnaireFollowup.ts). One per lead (the sender refuses a repeat). */
  questionnaire_followup: { key: 'questionnaire_followup', label: 'Send payment-step nudge', inSender: true, ukOnly: true,
    body: "Hi {{1}}, saw your form come through for {{2}}, thanks for that. Everything is ready this end, it's just the payment step left…" },
  domain_help: { key: 'domain_help', label: 'Send domain help', inSender: false, ukOnly: true,
    body: "Hi {{1}}, it's Paul from Findable. I saw the website address part of the questions was left blank. Easier if I go through it with you on a quick call?" },
  agency_access: { key: 'agency_access', label: 'Send agency access', inSender: false, ukOnly: true,
    body: "Hi {{1}}, it's Paul from Findable. To get your new site live we need the domain, which {{2}} looks after. Would you like me to ask them for you?" },
  agreement_next_steps: { key: 'agreement_next_steps', label: 'Send agreement & next steps', inSender: false, ukOnly: true,
    body: "Hi {{1}}, it's Paul from Findable. Your answers are saved. The next step is to read and sign the agreement, then the first payment. Shall I send you the link?" },
  payment_help: { key: 'payment_help', label: 'Send payment help', inSender: false, ukOnly: true,
    body: "Hi {{1}}, it's Paul from Findable. It looks like the payment didn't go through. Would it help if I sent the link again?" },
  what_we_need: { key: 'what_we_need', label: 'Send what we need', inSender: false, ukOnly: true,
    body: "Hi {{1}}, it's Paul from Findable. To start your new site I just need {{2}}. Could you send that over here?" },
  interested_follow_up: { key: 'interested_follow_up', label: 'Send follow-up', inSender: false, ukOnly: false,
    body: "Hi {{1}}, it's Paul from Findable. Still keen to see what I found for your business?" },
  nudge_24h: { key: 'nudge_24h', label: 'Send 24h nudge', inSender: false, ukOnly: false,
    body: 'Hi {{1}}, just checking you saw my last message. Anything I can help with?' },
  final_nudge: { key: 'final_nudge', label: 'Send final nudge', inSender: false, ukOnly: false,
    body: "Hi {{1}}, I'll leave this with you for now. If you want to pick it up, just reply here and I'll help you finish." },
};

/** ok = the button may send; reason says why not (shown on the disabled button). */
export interface TemplateGate { ok: boolean; reason?: string }

/** Can this button send? Positive match only: anything unknown is a no. */
export function templateGate(key: NeedsTemplateKey | null | undefined, ctx: { approvals: readonly string[]; prospectOnly: boolean; hasPhone: boolean; alreadySent?: boolean }): TemplateGate {
  if (!key) return { ok: false, reason: 'No template for this step' };
  const t = NEEDS_TEMPLATES[key];
  if (!t) return { ok: false, reason: 'Unknown template' };
  if (!ctx.hasPhone) return { ok: false, reason: 'No phone number on the lead' };
  if (t.ukOnly && ctx.prospectOnly) return { ok: false, reason: 'Prospect-only market: no sign-up or payment messages' };
  if (ctx.alreadySent && key === 'questionnaire_followup') return { ok: false, reason: 'Already sent to this lead (one per lead)' };
  if (t.inSender) return { ok: true };
  if (!ctx.approvals.includes(key)) return { ok: false, reason: 'Waiting for Meta approval' };
  return { ok: false, reason: 'Approved: waiting to be added to the sender' };
}
