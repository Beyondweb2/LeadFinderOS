/* Where a dashboard item, notification or command goes (Sales Experience, 2026-09-28; made
   URL-addressable 2026-09-30, Paul: "click it, land in the correct place, and complete the action").
   ONE shape for "open this lead's WhatsApp thread" and "open this lead", so every entry point lands
   on the same place:
   - the Inbox deep link (/inbox?lead=<id>) for anything answered on WhatsApp;
   - the Outreach deep link (/outreach?lead=<id>) for the lead's workspace (details, Work panel,
     the call script and its tel: link). A URL, not router state: it survives a refresh and the back
     button, and a stale id says so instead of silently doing nothing.
   ⛔ A CALL goes to the workspace, never to the row's call button — that button LOGS an attempt
   (executeContact) and a link must never record a call nobody made. */
import { whatsAppLinkForLead } from './conversationState.ts';
import { WHATSAPP_NEXT_ACTIONS } from './nextActionView.ts';
export { whatsAppLinkForLead };

export type LeadLink = 'whatsapp' | 'lead';

/** The lead's workspace on Outreach. */
export const outreachLeadLink = (leadId: string): string => `/outreach?lead=${encodeURIComponent(leadId)}`;

/** @deprecated router-state launch — kept only so an old in-flight history entry still opens. */
export const leadLaunchState = (leadId: string) => ({ launch: { leadId, channel: 'open' as const } });

/** A router target for a link kind: [path, state]. */
export function leadTarget(link: LeadLink, leadId: string): [string, unknown] {
  return link === 'whatsapp' ? [whatsAppLinkForLead(leadId), undefined] : [outreachLeadLink(leadId), undefined];
}

/** A paid client's hub, optionally opened at one stage (ClientHub ?section=). */
export const clientHubLink = (leadId: string, section?: string | null): string =>
  `/paid-clients/${encodeURIComponent(leadId)}${section ? `?section=${encodeURIComponent(section)}` : ''}`;

/** Where a Needs-your-attention item is done (adminMetrics.ts AttentionItem.open). */
export function attentionPath(i: { open: string; leadId: string | null; section?: string; show?: string }): string {
  if (i.open === 'client' && i.leadId) return clientHubLink(i.leadId, i.section);
  if (i.open === 'inbox') return i.leadId ? whatsAppLinkForLead(i.leadId) : '/inbox';
  if (i.open === 'lead' && i.leadId) return outreachLeadLink(i.leadId);
  if (i.open === 'signups') return '/dashboard#signup-desk';
  return i.show ? `/outreach?show=${encodeURIComponent(i.show)}` : '/outreach';
}

/** Where a due follow-up is completed: its action type decides, not a fixed destination. */
export function nextActionLink(action: string | null | undefined): LeadLink {
  return WHATSAPP_NEXT_ACTIONS.has(String(action ?? '')) ? 'whatsapp' : 'lead';
}
