/* Where a dashboard item, notification or command goes (Sales Experience, 2026-09-28).
   ONE shape for "open this lead's WhatsApp thread" and "open this lead", so every entry point lands
   on the same place: the Inbox deep link (?lead=) and Outreach's launch intent (the one the old
   /sales/lead/:id redirect uses). */
import { whatsAppLinkForLead } from './conversationState.ts';
export { whatsAppLinkForLead };

export type LeadLink = 'whatsapp' | 'lead';

/** Outreach opens this lead's workspace once its list holds it (LegacySalesLeadRedirect's intent). */
export const leadLaunchState = (leadId: string) => ({ launch: { leadId, channel: 'open' as const } });

/** A router target for a link kind: [path, state]. */
export function leadTarget(link: LeadLink, leadId: string): [string, unknown] {
  return link === 'whatsapp' ? [whatsAppLinkForLead(leadId), undefined] : ['/outreach', leadLaunchState(leadId)];
}
