/* A bell row for the book owner, NO email (2026-11-26, Paul: emails are for real pauses only; src/lib/queuePauseRules.ts).
   The row is the once-only claim (unique user_id + dedupe_key). Never throws. Used by process-whatsapp-queue (stuck senders,
   auto-resume) and whatsapp-number-health (cold stop cleared by itself). */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;

export async function bellOnly(service: Service, a: { title: string; body: string; link: string; dedupeKey: string }): Promise<"sent" | "duplicate" | "no_owner" | "failed"> {
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).limit(1).maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id ?? null;
    if (!ownerId) return "no_owner";
    const { data: claimed, error } = await service.from("notifications").upsert([{
      user_id: ownerId, kind: "team_update", title: a.title, body: a.body, link: a.link, lead_id: null, dedupe_key: a.dedupeKey, priority: 3,
    }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) return "failed";
    return Array.isArray(claimed) && claimed.length ? "sent" : "duplicate";
  } catch { return "failed"; }
}
