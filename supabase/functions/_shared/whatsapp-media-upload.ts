// whatsapp-media-upload — POST a file to Meta's media endpoint and get back its media id.
//
// Cloud API "Media" reference: POST /<PHONE_NUMBER_ID>/media, multipart form with
// messaging_product=whatsapp, type=<mime>, file=<bytes>; the answer is { id }.
// ⚠️ A NEW FILE ON PURPOSE, not an addition to whatsapp-send.ts: that module is reached by every
// sender (queue, Inbox, payment, free check), and changing it would mean redeploying all of them
// for a feature only send-whatsapp-voice uses. It reads GRAPH_VERSION from there so the two can
// never call different API versions.
import { GRAPH_VERSION } from "./whatsapp-send.ts";

export async function uploadMediaToGraph(
  accessToken: string,
  phoneNumberId: string,
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([bytes], { type: mime }), filename);
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data?.id === "string" && data.id) return { ok: true, mediaId: data.id };
    return { ok: false, error: JSON.stringify(data?.error ?? data ?? { status: res.status }).slice(0, 500) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
