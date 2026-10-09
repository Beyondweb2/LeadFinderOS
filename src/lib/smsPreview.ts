/* WHAT A TEXT WILL SAY — THE WHATSAPP WORDING, NOTHING ELSE (2026-10-09) — client side.
   The preview is the WhatsApp template body rendered by the SAME mirror the Inbox uses (readableTemplateBody, parity-tested against the
   function the server renders with), plus — on a COLD text only — the opt-out line (smsTextFromWhatsAppBody). So the queue dialog and the
   composer show exactly what the server will send; there is no second copy of any wording. The business name is shortened the way the
   real send shortens it (sentAt = now makes the mirror apply today's greeting rules). */
import { readableTemplateBody } from './templateBodies';
import { smsTextFromWhatsAppBody, SMS_COLD_TEMPLATES, SMS_CONVERSATION_TEMPLATES, type SmsTemplateName } from './smsMessages';
import { WHATSAPP_TEMPLATES } from '../types/outreach';

export function smsPreview(template: SmsTemplateName, lead: { business_name?: string | null; derived_town?: string | null }, now: Date = new Date()): string {
  const body = readableTemplateBody(null, template, { businessName: lead.business_name ?? '', town: lead.derived_town ?? null, sentAt: now.toISOString() });
  return smsTextFromWhatsAppBody(template, body);
}

/** The picker label: the WhatsApp template's own label (one place decides what a template is called). */
export function smsTemplateLabel(name: string): string {
  return WHATSAPP_TEMPLATES.find((t) => t.value === name)?.label ?? name;
}

export const SMS_COLD_CHOICES = SMS_COLD_TEMPLATES.map((v) => ({ value: v, label: smsTemplateLabel(v) }));
export const SMS_CONVERSATION_CHOICES = SMS_CONVERSATION_TEMPLATES.map((v) => ({ value: v, label: smsTemplateLabel(v) }));
