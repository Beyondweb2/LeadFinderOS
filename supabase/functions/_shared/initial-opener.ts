// THE SELECTED INITIAL OPENER — the one read of whatsapp_outreach_state.initial_opener_template.
// The rule itself (which openers exist, what "selected" means, fail-closed) is src/lib/openerVariant.ts.
import { openerSendability } from "../../../src/lib/openerVariant.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

/**
 * The stored selection. `undefined` when it could not be READ (the column missing, a failed query):
 * callers treat that as "no opener is sendable" — never as the default, never as the other opener.
 * `null` = the row has no value stored, which resolveSelectedOpener reads as the default.
 */
export async function readSelectedOpener(service: Client): Promise<string | null | undefined> {
  try {
    const { data, error } = await service.from("whatsapp_outreach_state").select("initial_opener_template").eq("id", 1).maybeSingle();
    if (error || !data) return undefined;
    const v = (data as { initial_opener_template?: unknown }).initial_opener_template;
    return typeof v === "string" ? v : null;
  } catch {
    return undefined;
  }
}

/** For a sender about to send `template` NOW: refused when it is an opener other than the selected one. */
export async function openerRefusal(service: Client, template: string): Promise<string | null> {
  const verdict = openerSendability(template, await readSelectedOpener(service));
  return verdict.ok ? null : verdict.reason;
}
