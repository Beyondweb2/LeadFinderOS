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
}

export interface WhatsAppSendResult {
  ok: boolean;
  simulated?: boolean;
  error?: string;
  reason?: string;
  /** The whatsapp_messages row the server wrote, when it returns one. */
  message?: { id?: string } & Record<string, unknown>;
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
    },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'send_failed', reason: data?.reason };
  return { ok: true, simulated: data.simulated, message: data.message ?? undefined };
}
