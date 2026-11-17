/* ⛔ A BOUNCED ADDRESS IS NEVER EMAILED AGAIN (2026-11-17).
   Before this, a bounce on a salesperson's email (Send more info, e.g. info@oefonline.co.uk) only emailed Paul: the lead
   still showed the address as good, and the next person pressed Send again. Now resend-webhook records a HARD bounce on
   every lead that carries that address:
     - outreach_leads.email_status = 'bounced' (data), and
     - a History row (lead_activity kind 'email_bounced', data.to = the address, lower-case) — what the rep reads.
   The send-time check (emailBounced) asks "has THIS address bounced on THIS lead?" from those History rows, so it holds even
   if enrichment later re-writes email_status, and it lets go by itself the moment someone fixes the email on the lead.
   A soft bounce (Resend type "Transient": mailbox full, server busy) is NOT recorded: the address is real. */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;

export const EMAIL_BOUNCED_KIND = "email_bounced";
export const EMAIL_BOUNCED_DETAIL = "Email bounced: this address did not accept our last email, so nothing more is sent to it. Fix the email on the lead, or send a text.";

/** Hard unless Resend says Transient. "Undetermined"/missing counts as hard: re-sending to a dead address hurts every send. */
export function isHardBounce(detail: unknown): boolean {
  const t = detail && typeof detail === "object" ? String((detail as Record<string, unknown>).type ?? "") : "";
  return !/^transient$/i.test(t.trim());
}

/** The recipients of a webhook event, lower-case, de-duplicated, only things that look like an address. */
export function bounceAddresses(to: unknown): string[] {
  const list = Array.isArray(to) ? to : [to];
  const out = new Set<string>();
  for (const v of list) {
    const m = String(v ?? "").match(/[^\s<>,"']+@[^\s<>,"']+\.[^\s<>,"']+/);
    if (m) out.add(m[0].toLowerCase());
  }
  return [...out];
}

/** The History line the rep reads. */
export function emailBouncedLine(address: string): string {
  return `Email bounced: ${address} did not accept our email. Nothing more will be emailed to it until the address is changed.`;
}

/** ilike with no wildcards: an address may contain "_" (a one-character wildcard). */
function exactIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Records a hard bounce on every lead whose CURRENT email is the bounced address (and on the lead the send was logged on).
 *  Idempotent: a webhook retry finds the History row and writes nothing. Returns how many leads were marked. Never throws. */
export async function recordEmailBounce(service: Service, a: { messageId: string; addresses: readonly string[]; detail: unknown }): Promise<number> {
  if (!a.addresses.length) return 0;
  let marked = 0;
  try {
    const ids = new Set<string>();
    if (a.messageId) {
      const { data } = await service.from("lead_activity").select("lead_id").eq("data->>resend_id", a.messageId).limit(5);
      for (const r of (data ?? []) as Array<{ lead_id: string }>) ids.add(r.lead_id);
    }
    for (const addr of a.addresses) {
      const { data } = await service.from("outreach_leads").select("id").ilike("email", exactIlike(addr)).limit(50);
      for (const r of (data ?? []) as Array<{ id: string }>) ids.add(r.id);
    }
    if (!ids.size) return 0;
    const { data: leads } = await service.from("outreach_leads").select("id, email").in("id", [...ids]);
    for (const l of (leads ?? []) as Array<{ id: string; email: string | null }>) {
      const addr = String(l.email ?? "").trim().toLowerCase();
      if (!a.addresses.includes(addr)) continue; // the address on the lead has since been changed: nothing to mark
      const { data: seen } = await service.from("lead_activity").select("id").eq("lead_id", l.id).eq("kind", EMAIL_BOUNCED_KIND)
        .eq("data->>to", addr).limit(1);
      if (Array.isArray(seen) && seen.length) continue;
      const { error: hErr } = await service.from("lead_activity").insert({
        lead_id: l.id, actor_user_id: null, kind: EMAIL_BOUNCED_KIND, body: emailBouncedLine(addr),
        data: { to: addr, resend_id: a.messageId || null, detail: a.detail ?? null },
      });
      if (hErr) { console.error(`[email-bounce] history not written for ${l.id}:`, hErr.message); continue; }
      await service.from("outreach_leads").update({ email_status: "bounced", email_last_checked_at: new Date().toISOString() }).eq("id", l.id)
        .then(() => undefined, () => undefined);
      marked++;
    }
  } catch (e) {
    console.error("[email-bounce] record failed:", e instanceof Error ? e.message : String(e));
  }
  return marked;
}

/** Has this exact address bounced on this lead? Throws when it cannot be read — the caller refuses the send (fail closed). */
export async function emailBounced(service: Service, leadId: string, email: string | null | undefined): Promise<boolean> {
  const addr = String(email ?? "").trim().toLowerCase();
  if (!addr) return false;
  const { data, error } = await service.from("lead_activity").select("id").eq("lead_id", leadId).eq("kind", EMAIL_BOUNCED_KIND)
    .eq("data->>to", addr).limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}
