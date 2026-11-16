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
