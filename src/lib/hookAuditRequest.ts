import { isAggregatorUrl } from './aggregators';
import { OUTREACH_HOOK_QUESTIONS } from './auditQuestionCounts';

/* THE "RUN A NEW AI CHECK" REQUEST — one body for every Inbox that offers it (2026-10-09). A NEW hook audit (3 questions × ChatGPT + Google AI),
   never a mutation of an old one, and ⛔ NEVER QUEUES A PITCH: no queue_pitch_on_complete, so nothing is parked in whatsapp_auto_replies and
   nothing is ever sent to the prospect. Used by the WhatsApp card's "Run new" and by the SMS Inbox header button. The audit never changes a
   sales status. A directory or social URL is not a website (isAggregatorUrl), same as the first-reply path. */
export interface HookAuditLead { id: string; business_name: string; country?: string | null; website?: string | null }

export function hookAuditRequestBody(lead: HookAuditLead, bizType: string, loc: string, businessName?: string | null) {
  const own = lead.website && !isAggregatorUrl(lead.website) ? lead.website : undefined;
  return {
    lead_id: lead.id,
    business_name: businessName || lead.business_name,
    business_type: bizType,
    location_text: loc,
    country: lead.country ?? null,
    website: own,
    has_website: !!own,
    question_count: OUTREACH_HOOK_QUESTIONS,
    hook_audit: true,
    fresh_audit: true,
  };
}
