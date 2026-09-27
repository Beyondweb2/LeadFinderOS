/* The browser half of an attachment send (2026-09-27): one multipart POST to send-whatsapp-media,
 * shared by the Inbox (useInbox.sendMedia) and the salesperson's lead page, so both read the server's
 * answer the same way. The server decides everything; this only carries the file and reads the reply.
 * `dryRun` asks every check and stops before anything is stored or sent. */

export interface MediaSendArgs { phone: string; leadId: string; file: File; caption: string; sendId: string; dryRun?: boolean }
export interface MediaSendReply {
  ok: boolean; simulated?: boolean; dryRun?: boolean; kind?: 'image' | 'video' | 'document';
  message?: Record<string, unknown> | null; error?: string; reason?: string; retryable?: boolean;
}

interface Invoker { functions: { invoke: (name: string, opts: { body: FormData }) => Promise<{ data: unknown; error: unknown }> } }

export async function sendMediaAttachmentRequest(client: Invoker, args: MediaSendArgs): Promise<MediaSendReply> {
  const form = new FormData();
  form.append('lead_id', args.leadId);
  form.append('phone', args.phone);
  form.append('send_id', args.sendId);
  form.append('caption', args.caption);
  if (args.dryRun) form.append('mode', 'dry_run');
  form.append('file', args.file, args.file.name);
  const { data, error } = await client.functions.invoke('send-whatsapp-media', { body: form });
  if (error) {
    /* A non-2xx still carries our JSON reason; read it rather than showing "non-2xx". A network drop
       is retryable: the server's claim on sendId refuses a second delivery of the same file. */
    let body: MediaSendReply | null = null;
    try { body = await (error as { context?: Response }).context?.json(); } catch { body = null; }
    return { ok: false, error: body?.error ?? (error as Error).message, reason: body?.reason, retryable: body?.retryable ?? true, kind: body?.kind };
  }
  const d = (data ?? {}) as MediaSendReply & { status?: string };
  if (!d.ok) return { ok: false, error: d.error ?? 'send_failed', reason: d.reason, retryable: d.retryable, kind: d.kind };
  return { ok: true, simulated: d.simulated, dryRun: d.dryRun, kind: d.kind, message: d.message ?? null };
}
