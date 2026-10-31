/* ⛔ THE ONE BROWSER CALL THAT SENDS A WHATSAPP MESSAGE (2026-10-11). The Inbox (useInbox.send) and the Outreach WhatsApp
   dialog (LeadWhatsAppPanel) both send through this, so the request body — and so every server guard in send-whatsapp-message
   (cold vs continuation, opt-outs, the 24-hour window, the opener choice, QA holds, the abuse guard) — is byte-for-byte the same
   from either screen. It was lifted out of useInbox.send unchanged; never add a field here for one caller only. */
import type { supabase as Supabase } from '@/integrations/supabase/client';

export interface WhatsAppSendArgs {
  phone: string;
  leadId: string | null;
  country?: string | null;
  body?: string;
  templateName?: string;
  /** Only true when the operator is repeating a template this lead already had (the server's explicit override). */
  allowResend?: boolean;
  /** Where the person pressed Send. 'inbox' (the Inbox) and 'lead_panel' (the Outreach WhatsApp popup): outside the lead's send hours
   *  the server QUEUES it (src/lib/inboxSendWindow.ts, SEND_WINDOW_SURFACES) instead of sending (Paul, 2026-10-21). */
  via?: 'inbox' | 'lead_panel';
  /** Values a template needs from the person sending it (today only needs_from_you's "item needed"); the server cleans them. */
  templateVars?: Record<string, string>;
  /** With templateName + body: send THESE words as free text, recorded as that template (a composer filled from a saved template
   *  inside the 24-hour window — src/lib/inWindowFreeText.ts). The server honours it only for via:'inbox'. */
  asFreeText?: boolean;
}

export interface WhatsAppSendResult {
  ok: boolean;
  simulated?: boolean;
  error?: string;
  reason?: string;
  /** The whatsapp_messages row the server wrote, when it returns one. */
  message?: { id?: string } & Record<string, unknown>;
  /** Present when it was QUEUED for the lead's send hours instead of sent (nothing has gone yet). */
  scheduled?: { id: string; send_at: string; tz: string };
  /** Meta's own error code when Meta refused the send (sendErrorMeaning.ts turns it into words). */
  failCode?: number;
  /** For a template send: how it went ('text' = its free-text version inside the 24-hour window). */
  sentAs?: 'text' | 'template';
  /** With sentAs 'text': it went as a normal VIDEO message (a video template's in-window version), the words as its caption. */
  withVideo?: boolean;
  /** The window was open but this template has no plain-text version, so it went as the template — why, in words. */
  noFreeText?: string;
}

export async function sendWhatsAppRequest(sb: { functions: typeof Supabase.functions }, args: WhatsAppSendArgs): Promise<WhatsAppSendResult> {
  const { data, error } = await sb.functions.invoke('send-whatsapp-message', {
    body: {
      phone: args.phone,
      lead_id: args.leadId,
      country: args.country ?? null,
      body: args.body,
      template_name: args.templateName,
      allow_resend: args.allowResend === true,
      ...(args.via ? { via: args.via } : {}),
      ...(args.templateVars ? { template_vars: args.templateVars } : {}),
      ...(args.asFreeText ? { as_free_text: true } : {}),
    },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'send_failed', reason: data?.reason, ...(typeof data?.failCode === 'number' ? { failCode: data.failCode } : {}) };
  const shape = {
    /* 'video' = a video template's in-window version (a normal video message, the words as its caption): free-form, like text. */
    ...(data.sent_as === 'text' || data.sent_as === 'template' ? { sentAs: data.sent_as as 'text' | 'template' } : data.sent_as === 'video' ? { sentAs: 'text' as const, withVideo: true } : {}),
    ...(typeof data.no_free_text === 'string' ? { noFreeText: data.no_free_text } : {}),
  };
  if (data.scheduled) return { ok: true, scheduled: data.scheduled, ...shape };
  return { ok: true, simulated: data.simulated, message: data.message ?? undefined, ...shape };
}
