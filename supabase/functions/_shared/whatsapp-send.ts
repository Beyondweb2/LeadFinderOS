// Shared WhatsApp Cloud API send mechanism — extracted VERBATIM from
// process-whatsapp-queue so the Inbox reply sender reuses the exact same proven
// transport (Graph POST), phone normalisation, test-mode gate and claim-template
// shape. process-whatsapp-queue itself is intentionally NOT modified in this build;
// it can adopt this helper in a later cleanup.

export const GRAPH_VERSION = "v21.0";

/** UK phone → E.164 digits (no '+', as Meta wants). Mirrors send-reminders /
 *  process-whatsapp-queue exactly. Returns null when nothing usable. */
export function toWhatsAppNumber(raw: string, country?: string | null): string | null {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s.slice(1).replace(/\D/g, "") || null;
  const cc = (country || "UK").toUpperCase();
  if (s.startsWith("0")) {
    if (cc === "UK" || cc === "GB") return "44" + s.slice(1);
    return s.replace(/\D/g, "");
  }
  return s.replace(/\D/g, "") || null;
}

/** Resolve the WhatsApp env + test/live gate, IDENTICAL to process-whatsapp-queue:
 *  live sends happen ONLY when WHATSAPP_TEST_MODE === "off" AND both secrets exist. */
export function resolveWhatsAppEnv() {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const testMode = (Deno.env.get("WHATSAPP_TEST_MODE") ?? "on").toLowerCase() !== "off";
  const live = !testMode && !!accessToken && !!phoneNumberId;
  return { accessToken, phoneNumberId, testMode, live };
}

/** Approved template allowlist — mirrors process-whatsapp-queue. Both carry
 *  {{1}}=business name, {{2}}=claim URL in the BODY. */
export const WA_TEMPLATES: Record<string, { lang: string }> = {
  booking_page_intro: { lang: "en" },
  free_website_intro: { lang: "en" },
};
export const WA_DEFAULT_TEMPLATE = "booking_page_intro";

/** Body params for a claim template: {{1}} business name, {{2}} claim URL. */
export function claimTemplateComponents(businessName: string, claimUrl: string) {
  return [{
    type: "body",
    parameters: [
      { type: "text", text: businessName || "your business" },
      { type: "text", text: claimUrl },
    ],
  }];
}

/** A free-form text payload (only deliverable inside the 24h customer-service window). */
export function textPayload(body: string) {
  return { type: "text", text: { body, preview_url: false } };
}

/** A claim-template payload (deliverable any time). */
export function claimTemplatePayload(templateName: string, lang: string, businessName: string, claimUrl: string) {
  return {
    type: "template",
    template: { name: templateName, language: { code: lang }, components: claimTemplateComponents(businessName, claimUrl) },
  };
}

export interface WaSendResult {
  ok: boolean;
  messageId: string | null;
  failCode?: number;
  error: string | null;
}

/** Low-level Graph POST — the same call process-whatsapp-queue makes. The caller
 *  supplies the message payload (text or template) and only calls this when live. */
export async function sendViaGraph(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  payload: Record<string, unknown>,
): Promise<WaSendResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.messages?.[0]?.id) {
      return { ok: true, messageId: data.messages[0].id, error: null };
    }
    const failCode = typeof data?.error?.code === "number" ? data.error.code : undefined;
    return { ok: false, messageId: null, failCode, error: JSON.stringify(data?.error ?? data).slice(0, 500) };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}
