/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE BULK QUEUE'S TEMPLATE LANES ASK THE ONE IN-WINDOW RULE (Paul, 2026-11-16; docs/in-window-free-text.md).

   Window open (the customer wrote to our number in the last 24 hours) → the template's own wording goes as a normal
   free-form message (a video template: its video by link with the wording as caption), still recorded as that template.
   Closed → the approved template, exactly as before. The decision is src/lib/inWindowFreeText.ts (queueSendShape); this file
   only reads the window and builds the payload.
   ⛔ A FAILED WINDOW READ = CLOSED = THE TEMPLATE: free text into a closed window is refused by Meta, a template always lands.
   ⛔ The window is the NUMBER's: Meta measures it per business number and customer, so it is read from every inbound row for
      that phone (one Meta number for every user), never from anything we sent.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { textPayload, videoPayload } from "./whatsapp-send.ts";
import { queueSendShape } from "../../../src/lib/inWindowFreeText.ts";
import { WHATSAPP_SERVICE_WINDOW_MS } from "../../../src/lib/serviceWindow.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (t: string) => any };

/** Is this number's 24-hour window open now? Any failure → false (the template goes). */
export async function phoneWindowOpen(service: Sb, phone: string, nowMs: number = Date.now()): Promise<boolean> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  try {
    const { data, error } = await service.from("whatsapp_messages").select("created_at")
      .in("phone", [digits, `+${digits}`]).eq("direction", "inbound")
      .order("created_at", { ascending: false }).limit(1);
    if (error || !data?.length) return false;
    const at = Date.parse((data[0] as { created_at: string }).created_at);
    return Number.isFinite(at) && nowMs - at < WHATSAPP_SERVICE_WINDOW_MS;
  } catch {
    return false;
  }
}

/** The payload a queue lane posts, and how the row records it. `templatePayload` = claimTemplatePayload's; `words` = its body. */
export function queueLanePayload(templatePayload: Record<string, unknown>, words: string, windowOpen: boolean):
  { payload: Record<string, unknown>; messageType: "template" | "text" | "video"; freeText: boolean } {
  const s = queueSendShape({ payload: templatePayload, words, windowOpen });
  if (s.as === "text") {
    return s.videoUrl
      ? { payload: videoPayload(s.videoUrl, s.text), messageType: "video", freeText: true }
      : { payload: textPayload(s.text), messageType: "text", freeText: true };
  }
  return { payload: templatePayload, messageType: "template", freeText: false };
}
