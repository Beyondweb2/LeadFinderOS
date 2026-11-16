/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AUTOMATIC SENDS' FREE WINDOW (2026-11-16, Paul: "never pay for a template when it doesn't have to").

   process-whatsapp-queue's automatic audit reply (it fires minutes after a prospect writes, so their window is open) and the
   report follow-up sent the paid template every time. Here they ask the SAME rule as send-whatsapp-message:
   src/lib/inWindowFreeText.ts (is there a faithful free version of these words?) and its freeWindowOpen
   (will it land inside the 24 hours, with the margin?). Open → the same wording as a normal message (a video template as a
   normal video, the words as its caption), still recorded as that template. Anything else → the template, exactly as before.

   ⛔ The window is the NUMBER'S, as WhatsApp keeps it: the newest inbound row for these digits. A failed read is CLOSED (the
      template goes — paid, but it is delivered), never "open".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { textPayload, videoPayload } from "./whatsapp-send.ts";
import { freeTextVersionOf, freeWindowOpen, inWindowShape } from "../../../src/lib/inWindowFreeText.ts";
import { bareTrade, normaliseTrade, withTradeArticle } from "../../../src/lib/templateVars.ts";

/* ⛔ "an <trade>" IN FREE TEXT (Paul, 2026-11-16) — the queue's copy of send-whatsapp-message's rule. A template whose body says
   "for a {{trade}}" (audit_reply, video_template, audit_reply_warm) HOLDS a vowel trade as a PAID template (Meta's registered
   "a"). Inside the open 24-hour window it goes as FREE TEXT, so the words say "an electrician" instead. freeTextOnly = build
   the payload with the bare trade; the caller MUST then refuse to send unless it really goes as free text. The words also get
   the normalised trade ("a plumber", not the typed "a Plumbers"). */
export interface TradeForWords { freeTextOnly: boolean; bodyTrade: string | undefined; fixWords: (w: string) => string }
export function tradeForFreeText(vars: readonly string[], rawTrade: string | undefined, lastInboundMs: number | null, nowMs: number = Date.now()): TradeForWords {
  const same = (w: string) => w;
  if (!vars.includes("trade") || !rawTrade) return { freeTextOnly: false, bodyTrade: rawTrade, fixWords: same };
  const n = normaliseTrade(rawTrade);
  if (n.ok) return { freeTextOnly: false, bodyTrade: n.value, fixWords: same };
  if (n.reason === "trade_starts_with_vowel_sound" && freeWindowOpen(lastInboundMs, nowMs)) {
    const b = bareTrade(rawTrade);
    if (b.ok) return { freeTextOnly: true, bodyTrade: b.value, fixWords: (w) => withTradeArticle(w, rawTrade) };
  }
  return { freeTextOnly: false, bodyTrade: rawTrade, fixWords: same };
}

// deno-lint-ignore no-explicit-any
type Service = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The newest inbound message time (ms) for this WhatsApp number, or null (none, or the read failed). */
export async function lastInboundMsFor(service: Service, phoneDigits: string | null | undefined): Promise<number | null> {
  const phone = String(phoneDigits ?? "").trim();
  if (!phone) return null;
  try {
    const { data, error } = await service.from("whatsapp_messages")
      .select("created_at").eq("phone", phone).eq("direction", "inbound")
      .order("created_at", { ascending: false }).limit(1);
    if (error || !Array.isArray(data) || !data.length) return null;
    const at = new Date(String((data[0] as { created_at?: string }).created_at ?? "")).getTime();
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export interface FreeWindowSwap {
  /** The payload to POST instead of the template. */
  payload: Record<string, unknown>;
  /** What the message row records ("text", or "video" for a video template's in-window version). */
  messageType: "text" | "video";
  /** The words sent (the transcript). */
  body: string;
}

/** The free version of a built template send when the window is open at `nowMs`; null → send the template as built. */
export function freeWindowSwap(templatePayload: unknown, words: string, lastInboundMs: number | null, nowMs: number = Date.now()): FreeWindowSwap | null {
  const shape = inWindowShape({
    origin: "other", windowOpen: freeWindowOpen(lastInboundMs, nowMs), allowClosedText: false, typed: false,
    version: freeTextVersionOf(templatePayload, words),
  });
  if (shape.as !== "text") return null;
  return shape.videoUrl
    ? { payload: videoPayload(shape.videoUrl, shape.text) as Record<string, unknown>, messageType: "video", body: shape.text }
    : { payload: textPayload(shape.text) as Record<string, unknown>, messageType: "text", body: shape.text };
}
