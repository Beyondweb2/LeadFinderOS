// outbound-log — put a queue send's REAL words on its Inbox row (2026-11-23, fix/initial-with-link-queue-code).
//
// 🔴 THE BUG THIS FIXES. The queue writes its whatsapp_sends audit row BEFORE its whatsapp_messages row. A DB trigger on
//    whatsapp_sends (mirror_whatsapp_send_to_inbox) copies that row into whatsapp_messages straight away, with the body
//    "[<template>]" and the same wa_message_id. The queue's own insert then hit the unique index wa_messages_wa_id_uq; the retry
//    saw "a row with this id already landed" and stopped. So every automatic send kept the trigger's placeholder and no
//    template_snapshot: 840 initial_contact rows and every initial_with_link row (2026-11-22). The SPA renders most placeholders
//    from its own copy of the wording, but it cannot know initial_with_link's tracking code, so the Inbox showed
//    "https://leadfinderos.com/go/<tracking code>" although Meta received the real code.
// The fix: when a row with this Meta message id already exists, UPDATE it with the real words + snapshot instead of giving up.
// ⛔ NON-BLOCKING, like the callers: the message is already sent; this never throws, never retries the send, never duplicates.

// deno-lint-ignore no-explicit-any
type Service = any;

/** The columns that carry what was actually sent; these overwrite the trigger's placeholder copy. Status is NOT among them:
 *  the status webhook may already have moved the row on to delivered / read. */
const REAL_WORD_COLUMNS = ["body", "message_type", "template_snapshot", "findings_shown", "user_id"] as const;

export function realWordsOf(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of REAL_WORD_COLUMNS) if (row[k] !== undefined && row[k] !== null) out[k] = row[k];
  return out;
}

/** Insert the outbound row, or — when the whatsapp_sends trigger already made one for this Meta message id — give that row the
 *  real words. Returns "" on success, else the last error message. */
/** How far back a simulated send's trigger copy (no Meta id) is looked for: the trigger fires a moment before this write. */
export const SIMULATED_COPY_WINDOW_MS = 2 * 60 * 1000;

/** The placeholder body the trigger writes for a template with no hand-written SQL wording. */
export function triggerPlaceholderBody(template: unknown): string {
  return "[" + (typeof template === "string" && template ? template : "template") + "]";
}

export async function logOutboundMessage(service: Service, row: Record<string, unknown>, nowMs: number = Date.now()): Promise<string> {
  const waId = typeof row.wa_message_id === "string" && row.wa_message_id ? row.wa_message_id : null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      /* Find the trigger's copy: by Meta id for a real send; for a simulated send (no id) only the placeholder copy for this
         same lead + template made in the last two minutes — never a real row, never another lead's. */
      const lookup = waId
        ? service.from("whatsapp_messages").select("id").eq("wa_message_id", waId)
        : (row.lead_id && row.template_name
            ? service.from("whatsapp_messages").select("id").eq("lead_id", row.lead_id).eq("template_name", row.template_name)
                .eq("direction", "outbound").is("wa_message_id", null).eq("body", triggerPlaceholderBody(row.template_name))
                .gte("created_at", new Date(nowMs - SIMULATED_COPY_WINDOW_MS).toISOString()).order("created_at", { ascending: false })
            : null);
      if (lookup) {
        const { data: had, error: readErr } = await lookup.limit(1);
        if (!readErr && Array.isArray(had) && had.length > 0) {
          const { error: upErr } = await service.from("whatsapp_messages").update(realWordsOf(row)).eq("id", (had[0] as { id: string }).id);
          if (!upErr) return "";
          lastErr = (upErr as { message?: string }).message ?? "update failed";
          continue;
        }
      }
      const { error: insErr } = await service.from("whatsapp_messages").insert(row);
      if (!insErr) return "";
      lastErr = (insErr as { message?: string }).message ?? "insert failed";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return lastErr;
}
