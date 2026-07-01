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

// Human-readable copies of the Meta-registered template BODIES, purely so the Inbox
// can show what the barber actually receives (the real wording lives in Meta and is
// never returned by the API). These are DISPLAY-ONLY — the actual send still uses the
// approved template + {{1}}/{{2}} variables. ⚠️ Keep these in sync with the exact Meta
// template text; drift affects only the preview, never what is sent.
const bookingPageIntroBody = (b: string, u: string) =>
  `Hi, I came across ${b || "your business"} and built you an online booking page so customers can book appointments directly

Here it is: ${u}

You can edit it yourself - services, prices, hours

Have a look and let me know what you think`;

const noWebsiteBody = (b: string, u: string) =>
  `Hi, I noticed ${b || "your business"} doesn't have a website, so I built you one - it's live and free. You can edit it yourself: photos, text, services, colours.

Here it is: ${u}

It's yours to keep, free - let me know what you think.`;

export const WA_TEMPLATE_BODIES: Record<string, (businessName: string, claimUrl: string) => string> = {
  booking_page_intro: bookingPageIntroBody,
  // The "no website / free website" template. The send code uses free_website_intro;
  // no_website_barbers is aliased to the SAME body so the preview renders whichever
  // name is actually sent. ⚠️ the SEND name must match Meta — see the whatsapp-send note.
  free_website_intro: noWebsiteBody,
  no_website_barbers: noWebsiteBody,
};

/** Render the display copy of a template body with its variables filled. */
export function renderTemplateBody(templateName: string, businessName: string, claimUrl: string): string {
  const fn = WA_TEMPLATE_BODIES[templateName];
  return fn ? fn(businessName, claimUrl) : `[${templateName}]`;
}

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
