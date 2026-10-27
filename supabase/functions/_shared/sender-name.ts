// THE SENDER'S OWN NAME FOR A MESSAGE (2026-10-14, src/lib/messageName.ts, docs/team-access-tidy.md §4).
// ⛔ Only ever the person who queued / pressed send: their profiles.message_name, else the first part of THEIR OWN
//    email. No user id → no name → the caller refuses. Never the lead's owner, assignee, the book owner or "Paul".
// Service role only (reads auth.users for the email fallback). Never throws.
import { hasChosenMessageName, messageNameFor } from "../../../src/lib/messageName.ts";
import { hookSignatureName } from "../../../src/lib/hookSignature.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export async function senderMessageName(service: Service, userId: string | null | undefined): Promise<string> {
  const id = String(userId ?? "").trim();
  if (!id) return "";
  let saved: string | null = null;
  let waiting: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await service.from("profiles").select("message_name, message_name_pending").eq("user_id", id).maybeSingle();
    saved = (data?.message_name as string | null) ?? null;
    waiting = (data?.message_name_pending as string | null) ?? null;
  } catch { /* fall through to the email */ }
  /* ⛔ WAITING FOR APPROVAL (2026-10-27, migration 20261128100000): a person whose only name is still waiting for Paul's
     approval has NO name — not the email fallback either. '' → the caller refuses. message_name is only ever approved. */
  if (!hasChosenMessageName(saved) && hasChosenMessageName(waiting)) return "";
  if (!messageNameFor({ message_name: saved, email: null })) {
    try {
      const { data } = await service.auth.admin.getUserById(id);
      email = data?.user?.email ?? null;
    } catch { /* no email → '' → the caller refuses */ }
  }
  return messageNameFor({ message_name: saved, email });
}

/** The name the HOOK is signed with (src/lib/hookSignature.ts): the person's CHOSEN name only, never the email fallback.
 *  null = none chosen, or unreadable (the caller does not send the hook as that person). Never throws. */
export async function senderChosenName(service: Service, userId: string | null | undefined): Promise<string | null> {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  try {
    const { data, error } = await service.from("profiles").select("message_name").eq("user_id", id).maybeSingle();
    if (error) return null;
    return hookSignatureName((data?.message_name as string | null) ?? null);
  } catch { return null; }
}
