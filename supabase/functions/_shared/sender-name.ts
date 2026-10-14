// THE SENDER'S OWN NAME FOR A MESSAGE (2026-10-14, src/lib/messageName.ts, docs/team-access-tidy.md §4).
// ⛔ Only ever the person who queued / pressed send: their profiles.message_name, else the first part of THEIR OWN
//    email. No user id → no name → the caller refuses. Never the lead's owner, assignee, the book owner or "Paul".
// Service role only (reads auth.users for the email fallback). Never throws.
import { messageNameFor } from "../../../src/lib/messageName.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export async function senderMessageName(service: Service, userId: string | null | undefined): Promise<string> {
  const id = String(userId ?? "").trim();
  if (!id) return "";
  let saved: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await service.from("profiles").select("message_name").eq("user_id", id).maybeSingle();
    saved = (data?.message_name as string | null) ?? null;
  } catch { /* fall through to the email */ }
  if (!messageNameFor({ message_name: saved, email: null })) {
    try {
      const { data } = await service.auth.admin.getUserById(id);
      email = data?.user?.email ?? null;
    } catch { /* no email → '' → the caller refuses */ }
  }
  return messageNameFor({ message_name: saved, email });
}
