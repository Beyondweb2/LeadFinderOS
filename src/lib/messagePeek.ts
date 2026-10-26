/* ═════════════════════════════════════════════════════════════════
   THE DASHBOARD'S "LAST 3" PEEK (Paul, 2026-10-26). Pure: one stored WhatsApp row → one short line.
   ⛔ READ-ONLY BY CONSTRUCTION: this file has no I/O. The read (useLeadPeek) is a plain SELECT under the viewer's own RLS —
   the same rows the Inbox reads — and nothing marks a message read, sends a receipt, changes a status or writes anything.
   - who:  them (inbound) / us (outbound)
   - text: a template send shows its name and the words/values the Inbox shows (the stored snapshot, else the readable
           body, which for the dashboard's templates is "which template, with what"); voice notes, stickers, images,
           videos and files show as a plain label, never the file.
   ═════════════════════════════════════════════════════════════════ */
import { parseTemplateSnapshot } from './whatsappTemplateSnapshot.ts';
import { readableTemplateBody } from './templateBodies.ts';
import { dashboardTranscriptView } from './dashboardTemplates.ts';
import { templateLabel } from '../types/outreach.ts';

/** The columns the peek reads — a short explicit list, never `*`. */
export const PEEK_MESSAGE_COLUMNS = 'id, created_at, direction, body, message_type, template_name, template_snapshot, status';
export const PEEK_COUNT = 3;

export interface PeekRow {
  id: string;
  created_at: string;
  direction: 'inbound' | 'outbound' | string;
  body: string | null;
  message_type: string | null;
  template_name: string | null;
  template_snapshot?: unknown;
  status?: string | null;
}

export interface PeekLine {
  id: string;
  who: 'them' | 'us';
  at: string;
  /** "Template · Domain help (dashboard)" for a template send, else null. */
  tag: string | null;
  text: string;
  failed: boolean;
}

const MEDIA_LABEL: Record<string, string> = {
  audio: '[voice note]', voice: '[voice note]', sticker: '[sticker]', image: '[image]', video: '[video]',
  document: '[file]', reaction: '[reaction]', location: '[location]', contacts: '[contact card]',
};

/** Inbound placeholders the webhook stores for media ("[audio]", "[image]"…), read as the same plain labels. */
const PLACEHOLDER = /^\[(audio|voice|sticker|image|video|document|reaction|location|contacts)\]$/i;

export function peekLine(m: PeekRow, ctx: { businessName?: string | null; firstName?: string | null } = {}): PeekLine {
  const who: 'them' | 'us' = m.direction === 'inbound' ? 'them' : 'us';
  const type = (m.message_type ?? '').toLowerCase();
  const raw = (m.body ?? '').trim();
  const base = { id: m.id, who, at: m.created_at, failed: m.status === 'failed' };
  if (type === 'template' || (m.template_name && who === 'us')) {
    const snap = parseTemplateSnapshot(m.template_snapshot);
    /* A dashboard template: Meta's words when known, else "template, to whom, what is needed" — never the stored line. */
    const dash = dashboardTranscriptView(m.template_name, snap?.body ?? m.body);
    const dashText = dash ? dash.words ?? [`Sent the ${dash.label} template`, dash.who && `to ${dash.who}`, dash.neededItem && `· needed: ${dash.neededItem}`].filter(Boolean).join(' ') : null;
    const text = dashText || snap?.body?.trim()
      || readableTemplateBody(m.body, m.template_name, { businessName: ctx.businessName ?? '', firstName: ctx.firstName ?? undefined, sentAt: m.created_at })
      || (m.template_name ? templateLabel(m.template_name) : '');
    return { ...base, tag: `Template · ${m.template_name ? templateLabel(m.template_name) : 'unknown'}`, text: text || '[template]' };
  }
  if (MEDIA_LABEL[type]) {
    /* An attachment with a caption keeps the caption after the label; a bare placeholder or "Voice note (0:08)" is the label. */
    const caption = raw && !PLACEHOLDER.test(raw) && !/^voice note/i.test(raw) ? ` ${raw}` : '';
    return { ...base, tag: null, text: `${MEDIA_LABEL[type]}${caption}` };
  }
  const ph = PLACEHOLDER.exec(raw);
  if (ph) return { ...base, tag: null, text: MEDIA_LABEL[ph[1].toLowerCase()] ?? raw };
  return { ...base, tag: null, text: raw || '[no text]' };
}

/** The newest-first read, shown oldest-first (newest at the bottom, like the thread). */
export function peekLines(rowsNewestFirst: readonly PeekRow[], ctx: { businessName?: string | null; firstName?: string | null } = {}): PeekLine[] {
  return [...rowsNewestFirst].slice(0, PEEK_COUNT).reverse().map((m) => peekLine(m, ctx));
}
