import { toWhatsAppNumber } from "./whatsapp-send.ts";
import { armFirstReplyAuditIntent } from "./first-reply-audit.ts";
import { countsAsFirstReply } from "../../../src/lib/firstReplyAutomation.ts";
import { INBOUND_NO_DOWNGRADE, postgrestList } from "../../../src/lib/strongStatuses.ts";
import { createMockupRow, fillMockupFromSite } from "./mockup-trigger.ts";
import { chooseInboundLead, type InboundLeadCandidate } from "../../../src/lib/inboundMatch.ts";

// Inbound WhatsApp message handling — barber replies arriving on the SAME Meta
// webhook that delivers statuses (Cloud API has ONE callback URL; inbound lives in
// entry[].changes[].value.messages[], statuses in value.statuses[]). Called from
// whatsapp-status for each change that carries messages[]. Writes each reply into
// whatsapp_messages as an inbound row so it surfaces in the Inbox, resolving the
// conversation owner + lead so it lands in the right operator's thread (or the
// admin-only Unassigned bucket when the sender can't be matched).
//
// service = service-role Supabase client (bypasses RLS). Loose-typed to any to
// avoid supabase-js generic friction, matching the rest of the codebase.

// Statuses we must never overwrite when a reply comes in (forward-only, no thrash).
// A new inbound reply flips the matched lead to 'replied' UNLESS it's already at a
// protected status. not_interested is deliberately NOT protected: a reply means the
// prospect is re-engaging, so it should flip to 'replied' (which also un-hides the
// conversation in the Inbox, where not_interested is hidden by default). report_sent
// is deliberately NOT protected either — a reply to the pitch flips it to 'replied'.
// price_given and beyond (interested / won / paid / in_delivery / completed / refunded) ARE protected:
// an inbound must never wipe quote/deal state. ⛔ The ONE list: src/lib/strongStatuses.ts.
const NO_DOWNGRADE = postgrestList(INBOUND_NO_DOWNGRADE);

/** Best text/body for an inbound message. Text → the text body; a template QUICK-REPLY BUTTON
 *  or an INTERACTIVE reply → the button/list LABEL (so "Yes please" is stored and treated as a
 *  real reply, not "[button]"); reactions retain their actual emoji and attachments retain any
 *  caption. Other non-text types fall back to a "[type]" placeholder so the operator can see a
 *  reply landed and follow up.
 *  ⛔ Load-bearing for the auto-pitch: the arm gate keys on isSubstantiveText(body), which rejects
 *  "[...]" placeholders — so a button reply only triggers a pitch because its label is extracted
 *  HERE. WhatsApp shapes: text→msg.text.body, template button→msg.button.text (payload as
 *  fallback), interactive→msg.interactive.button_reply.title / list_reply.title. */
function bodyFor(msg: Record<string, unknown>): string {
  const type = typeof msg?.type === "string" ? msg.type : "unknown";
  if (type === "text") {
    const t = msg?.text as { body?: string } | undefined;
    return (t?.body ?? "").toString();
  }
  if (type === "button") {
    const b = msg?.button as { text?: string; payload?: string } | undefined;
    const txt = (b?.text ?? b?.payload ?? "").toString().trim();
    if (txt) return txt;
  }
  if (type === "interactive") {
    const it = msg?.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    } | undefined;
    const txt = (it?.button_reply?.title ?? it?.list_reply?.title ?? "").toString().trim();
    if (txt) return txt;
  }
  // Reactions are normal inbound customer replies too. Preserve the actual emoji rather than
  // collapsing it to "[reaction]", so the Inbox transcript matches what the operator received.
  if (type === "reaction") {
    const reaction = msg?.reaction as { emoji?: string } | undefined;
    const emoji = (reaction?.emoji ?? "").toString().trim();
    if (emoji) return emoji;
  }
  // Keep a sender-provided caption beside the stored attachment. The image/video itself is
  // downloaded separately by saveInboundMedia and rendered from the private media bucket.
  if (type === "image" || type === "video" || type === "document") {
    const media = msg?.[type] as { caption?: string } | undefined;
    const caption = (media?.caption ?? "").toString().trim();
    if (caption) return caption;
  }
  return `[${type}]`;
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

async function mediaObjectPath(userId: string | null, wamid: string, type: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wamid));
  const id = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const extension = ({ image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin', sticker: 'webp' } as Record<string, string>)[type] ?? 'bin';
  return `${userId ?? 'unassigned'}/${id}.${extension}`;
}

async function saveInboundMedia(service: any, msg: Record<string, unknown>, userId: string | null, wamid: string) {
  const type = typeof msg.type === 'string' ? msg.type : '';
  if (!MEDIA_TYPES.has(type)) return { message_type: 'text', media_path: null, media_mime_type: null, media_filename: null, error: null };
  const media = msg[type] as { id?: string; mime_type?: string; filename?: string } | undefined;
  const mediaId = media?.id;
  if (!mediaId || !wamid) return { message_type: type, media_path: null, media_mime_type: media?.mime_type ?? null, media_filename: media?.filename ?? null, error: 'Media unavailable: Meta did not provide an attachment id.' };
  try {
    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
    if (!token) throw new Error('WhatsApp access token is unavailable');
    const meta = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meta.ok) throw new Error(`Meta media lookup failed (${meta.status})`);
    const details = await meta.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!details.url) throw new Error('Meta did not return a media URL');
    if (Number(details.file_size ?? 0) > 20 * 1024 * 1024) throw new Error('Media exceeds the 20 MB limit');
    const download = await fetch(details.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!download.ok) throw new Error(`Meta media download failed (${download.status})`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Media exceeds the 20 MB limit');
    const mime = details.mime_type ?? media?.mime_type ?? 'application/octet-stream';
    const path = await mediaObjectPath(userId, wamid, type);
    const { error } = await service.storage.from('whatsapp-media').upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
    return { message_type: type, media_path: path, media_mime_type: mime, media_filename: media?.filename ?? `${type}`, error: null };
  } catch (error) {
    console.error(`[whatsapp-inbound] media save failed for ${wamid}:`, (error as Error).message);
    return { message_type: type, media_path: null, media_mime_type: media?.mime_type ?? null, media_filename: media?.filename ?? null, error: `Media unavailable: ${(error as Error).message}` };
  }
}

/** Meta unix-seconds timestamp → ISO, falling back to now() when absent/bad. */
function tsToIso(ts: unknown): string {
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  return new Date().toISOString();
}

/**
 * Resolve the conversation owner (user_id) + lead_id for an inbound sender.
 *  1. Primary: the most recent OUTBOUND whatsapp_messages row to this phone that names a lead — this
 *     is authoritative and IS the agreed tiebreak ("whoever most recently sent an outbound to that
 *     number"). Always hits for a reply to a message we sent.
 *  2. Fallback (2026-10-04, M-005 / E-07): the number was never messaged by the system — the
 *     call-first case. Candidates come from public.inbound_lead_candidates (phone_key on BOTH sides,
 *     so "07700 900123", "+44 7700 900123" and "07700900123" all meet), and src/lib/inboundMatch.ts
 *     decides: one lead → that lead; several → AMBIGUOUS, never a guess.
 *     The old fallback's `ilike '%<last 9 digits>%'` never matched a spaced stored phone (almost all
 *     of them), and it judged ambiguity by `user_id` — always the one book owner — so it never fired.
 *  3. Default: Unassigned (lead null) → the admin-only bucket the Inbox supports.
 * ⛔ A failed candidate read is "none" (the message still lands, Unassigned): an inbound row is never
 *    dropped because matching failed, and nothing is attached on a guess.
 */
type OwnerResolution = { userId: string | null; leadId: string | null; ambiguous: number };

async function resolveOwner(
  // deno-lint-ignore no-explicit-any
  service: any,
  waPhone: string,
): Promise<OwnerResolution> {
  // 1. Most recent outbound to this number.
  const { data: prior } = await service
    .from("whatsapp_messages")
    .select("user_id, lead_id")
    .eq("phone", waPhone)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior?.user_id && prior?.lead_id) {
    return { userId: prior.user_id as string, leadId: prior.lead_id as string, ambiguous: 0 };
  }
  /* An outbound with no lead (a send to a bare number) still names the conversation's owner; the
     lead is then looked for by phone exactly as for a never-messaged number. */
  const priorUser = (prior?.user_id as string | null | undefined) ?? null;

  // 2. Fallback — the canonical phone key, in SQL (index-backed).
  const { data: candidates, error } = await service.rpc("inbound_lead_candidates", { _phone: waPhone });
  if (error) {
    console.error(`[whatsapp-inbound] candidate lookup failed for ${waPhone}: ${String((error as { message?: string }).message ?? error)} — Unassigned`);
    return { userId: priorUser, leadId: null, ambiguous: 0 };
  }
  const choice = chooseInboundLead((candidates ?? []) as InboundLeadCandidate[]);
  if (choice.kind === "matched") return { userId: choice.userId ?? priorUser, leadId: choice.leadId, ambiguous: 0 };
  if (choice.kind === "ambiguous") {
    console.warn(`[whatsapp-inbound] ${choice.candidates} leads share ${waPhone} and none was ever messaged — Unassigned, Paul told`);
    return { userId: priorUser, leadId: null, ambiguous: choice.candidates };
  }

  // 3. Unknown sender.
  return { userId: priorUser, leadId: null, ambiguous: 0 };
}

/** AMBIGUOUS (several leads share the number): the message lands Unassigned (admin-only) and the book
 *  owner gets ONE notification per message, so a real reply is never silently lost and never shown to
 *  the wrong rep. Best-effort: a failed notification never fails the inbound. */
// deno-lint-ignore no-explicit-any
async function notifyAmbiguousInbound(service: any, waPhone: string, candidates: number, messageId: string, convUserId: string | null) {
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
    const to = (owner?.user_id as string | undefined) ?? null;
    if (!to) return;
    const { error } = await service.rpc("notify_person", {
      _user: to,
      _kind: "whatsapp_reply",
      _title: "WhatsApp reply needs matching",
      _body: `+${waPhone} wrote in and that number is on ${candidates} leads. It is in Unassigned — open it and attach it to the right lead.`,
      _link: "/inbox?c=" + encodeURIComponent((convUserId ?? "unassigned") + "::" + waPhone),
      _lead: null,
      _dedupe: `reply-ambiguous:${messageId}`,
      _priority: 2,
    });
    if (error) console.error(`[whatsapp-inbound] ambiguous notification failed: ${String((error as { message?: string }).message ?? error)}`);
  } catch (e) {
    console.error("[whatsapp-inbound] ambiguous notification error:", e instanceof Error ? e.message : String(e));
  }
}
/** The first persisted inbound after outreach began. Meta redelivery is already removed by wamid's
 * unique index; timestamp plus id gives two genuine rapid replies a deterministic winner. */
async function firstInboundForLead(service: any, leadId: string, insertedMessageId: string): Promise<{ first: boolean; reliable: boolean }> {
  const { data: firstOutbound, error: outboundError } = await service.from("whatsapp_messages")
    .select("created_at").eq("lead_id", leadId).eq("direction", "outbound").neq("status", "failed")
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
  if (outboundError) {
    console.error(`[whatsapp-inbound] first-outbound lookup failed (${leadId}): ${outboundError.message}`);
    return { first: false, reliable: false };
  }
  if (!firstOutbound?.created_at) return { first: false, reliable: true };
  /* ⛔ THEIR FIRST HUMAN REPLY, not their first inbound row (2026-09-28). A reaction, a bare "[image]"
     or an out-of-office landing first used to BE "the first inbound" — the guard refuses it, and the
     real "yes" a minute later was then not first, so it armed nothing. The first message that counts
     (countsAsFirstReply: human text, not an auto-responder) is the one. */
  const { data, error } = await service.from("whatsapp_messages").select("id, body")
    .eq("lead_id", leadId).eq("direction", "inbound").gte("created_at", firstOutbound.created_at)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(50);
  if (error) {
    console.error(`[whatsapp-inbound] first-inbound lookup failed (${leadId}): ${error.message}`);
    return { first: false, reliable: false };
  }
  const firstHuman = ((data ?? []) as Array<{ id: string; body: string | null }>).find((m) => countsAsFirstReply(m.body));
  return { first: firstHuman?.id === insertedMessageId, reliable: true };
}

/** Mockup preparation remains independent and non-blocking: it must never decide whether the
 * durable audit intent is recorded, nor extend Meta's webhook response time. */
async function prepareMockupForFirstReply(service: any, leadId: string) {
  try {
    const outcome = await createMockupRow(service, leadId);
    if (!outcome.started) return;
    const fill = () => fillMockupFromSite(service, outcome.siteId, {
      website: outcome.website,
      businessName: outcome.businessName,
      niche: outcome.niche,
      leadId,
      ownerId: outcome.ownerId,
    }, {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      auth: { kind: "internal" as const, cronSecret: Deno.env.get("CRON_SECRET") ?? "" },
    }).catch((e) => console.error(`[mockup] lead ${leadId}: scrape failed`, e instanceof Error ? e.message : String(e)));
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime && typeof runtime.waitUntil === "function") runtime.waitUntil(fill());
  } catch (e) {
    console.error(`[mockup] lead ${leadId}: prepare failed`, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle every inbound message in a webhook `change.value`. Idempotent per message
 * via the wa_messages_wa_id_uq unique index (23505 on redelivery → skip). Returns
 * the number of NEW rows inserted.
 */
export async function handleInboundMessages(
  service: any,
  value: any,
): Promise<number> {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  let inserted = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>;
    try {
      const wamid = typeof msg?.id === "string" ? msg.id : "";
      const rawFrom = (typeof msg?.from === "string" && msg.from) ||
        (typeof contacts[i]?.wa_id === "string" && contacts[i].wa_id) || "";
      const waPhone = toWhatsAppNumber(String(rawFrom), null);
      if (!waPhone) {
        console.warn(`[whatsapp-inbound] message ${wamid || "(no id)"} has no usable phone — skipping`);
        continue;
      }
      const { userId, leadId, ambiguous } = await resolveOwner(service, waPhone);
      const body = bodyFor(msg);
      const media = await saveInboundMedia(service, msg, userId, wamid);
      const { data: insertedRow, error: insErr } = await service.from("whatsapp_messages").insert({
        direction: "inbound", user_id: userId, lead_id: leadId, phone: waPhone, body,
        message_type: media.message_type, media_path: media.media_path,
        media_mime_type: media.media_mime_type, media_filename: media.media_filename,
        wa_message_id: wamid || null, status: "received", test_mode: false,
        created_at: tsToIso(msg?.timestamp), error: media.error,
      }).select("id").single();
      if (insErr) {
        if ((insErr as { code?: string }).code === "23505") {
          console.log(`[whatsapp-inbound] duplicate ${wamid} — already stored, skipping`);
          continue;
        }
        console.error(`[whatsapp-inbound] insert failed for ${wamid}: ${(insErr as { message?: string }).message}`);
        continue;
      }
      inserted++;
      if (!leadId && ambiguous > 0 && insertedRow?.id) await notifyAmbiguousInbound(service, waPhone, ambiguous, insertedRow.id as string, userId);
      if (!leadId || !insertedRow?.id) continue;

      await service.from("outreach_leads").update({ status: "replied" })
        .eq("id", leadId).not("status", "in", NO_DOWNGRADE);
      const firstInbound = await firstInboundForLead(service, leadId, insertedRow.id as string);
      const { data: lead } = await service.from("outreach_leads")
        .select("is_archived").eq("id", leadId).maybeSingle();
      const armed = await armFirstReplyAuditIntent({
        service, leadId, phone: waPhone, wamid: wamid || null,
        firstInbound: firstInbound.first, firstInboundReliable: firstInbound.reliable,
        archived: lead?.is_archived === true,
        body,
      });
      console.log(`[first-reply-audit] lead ${leadId}: ${armed.reason}`);
      if (armed.armed) await prepareMockupForFirstReply(service, leadId);
    } catch (e) {
      // The inbound row is durable before automation is considered. Any later failure is visible
      // in function logs and cannot make Meta redeliver a duplicate message.
      console.error("[whatsapp-inbound] durable handler error:", e instanceof Error ? e.message : String(e));
    }
  }
  return inserted;
}

/* The pre-2026-09-19 chain (legacyHandleInboundMessages) is deleted (2026-09-28). Its guards live once
   in src/lib/firstReplyAutomation.ts (firstReplyGuard) and run on the path above; git history keeps it. */
