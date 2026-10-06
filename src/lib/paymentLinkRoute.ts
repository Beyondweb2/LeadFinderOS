/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW A LINK MAY REACH THE CLIENT ON WHATSAPP (Paul, 2026-10-07) — the ONE decision, used for the
   Quick Close sign-up link (findable_signup_link) and the Paid Client onboarding link (findable_onboarding).

   In order:
     1. the APPROVED template (Meta's live status — whatsappLinkTemplates.templateSendState): one click, any time;
     2. a NORMAL WhatsApp message, ONLY when we have already messaged them AND they replied AND Meta's 24-hour
        window is open (Paul's rule — a link is never dropped into a conversation that isn't in that state);
     3. the template while its status could not be read (Meta decides on the send, and says so);
     4. otherwise NOTHING is sent: the screen says "Link ready — tell the customer where you're sending it" and
        offers copy / email. ⛔ Nothing is ever recorded as sent unless a sender said ok.

   Pure: the caller reads the conversation (fn quick-close / paid-client-hub, from whatsapp_messages) and the
   template's live status (_shared/template-status.ts). Edge-reachable: relative imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { serviceWindowState } from './serviceWindow.ts';
import type { TemplateSendState } from './whatsappLinkTemplates.ts';

export interface ConversationFacts {
  hasPhone: boolean;
  /** Our first non-failed outbound message to them (ISO), if any. */
  firstOutboundAt: string | null;
  /** Their latest inbound message (ISO), if any. */
  lastInboundAt: string | null;
  /** They opted out / the number is marked wrong — nothing at all goes by WhatsApp. */
  blocked?: boolean;
}

export type LinkRoute = 'whatsapp_reply' | 'whatsapp_template' | 'none';
export type LinkRouteReason = 'ok' | 'ok_unverified' | 'no_phone' | 'blocked' | 'not_messaged' | 'no_reply' | 'window_closed';

export interface LinkRouteDecision {
  route: LinkRoute;
  reason: LinkRouteReason;
  /** What the rep / Paul is told, one sentence (or two). */
  say: string;
}

export const LINK_ROUTE_SAY: Record<Exclude<LinkRouteReason, 'ok' | 'ok_unverified'>, string> = {
  no_phone: 'No phone number on file — tell the customer where you are sending the link, then email or copy it.',
  blocked: 'WhatsApp is off for this number (opted out or wrong number) — email or copy the link instead.',
  not_messaged: "We haven't messaged them on WhatsApp yet, so the link can't go in a normal WhatsApp message.",
  no_reply: "They haven't replied to our WhatsApp yet, so the link can't go in a normal WhatsApp message.",
  window_closed: 'Their last WhatsApp reply is more than 24 hours old, so a normal message is not allowed.',
};

/** Did they reply to US? (an inbound message after our first outbound). Unreadable times are never a yes. */
export function repliedAfterOurMessage(f: Pick<ConversationFacts, 'firstOutboundAt' | 'lastInboundAt'>): boolean {
  const out = Date.parse(String(f.firstOutboundAt ?? ''));
  const inb = Date.parse(String(f.lastInboundAt ?? ''));
  return Number.isFinite(out) && Number.isFinite(inb) && inb > out;
}

/** The ONE 24-hour window rule (serviceWindow.ts). */
export const windowOpenAt = (lastInboundAt: string | null, nowMs: number): boolean => serviceWindowState(lastInboundAt, nowMs).open;

/** May a NORMAL (free-text) WhatsApp carry the link? Paul's three conditions, all positive. */
export function replyRouteOpen(f: ConversationFacts, nowMs: number = Date.now()): boolean {
  return !!f.firstOutboundAt && repliedAfterOurMessage(f) && windowOpenAt(f.lastInboundAt, nowMs);
}

/** ⛔ Positive: every route to a WhatsApp send is a match on all its conditions; anything unknown is 'none'. */
export function decideLinkRoute(f: ConversationFacts, o: { template: TemplateSendState | null; nowMs?: number }): LinkRouteDecision {
  const now = o.nowMs ?? Date.now();
  if (!f.hasPhone) return { route: 'none', reason: 'no_phone', say: LINK_ROUTE_SAY.no_phone };
  if (f.blocked) return { route: 'none', reason: 'blocked', say: LINK_ROUTE_SAY.blocked };
  if (o.template?.sendable) return { route: 'whatsapp_template', reason: 'ok', say: o.template.say };
  if (replyRouteOpen(f, now)) return { route: 'whatsapp_reply', reason: 'ok', say: 'They replied to us on WhatsApp in the last 24 hours — the link can go in that conversation.' };
  if (o.template?.tryable) return { route: 'whatsapp_template', reason: 'ok_unverified', say: o.template.say };
  /* Why a normal message is not allowed — the first condition that fails, in Paul's order — and why the template can't help. */
  const why = !f.firstOutboundAt ? 'not_messaged' : !repliedAfterOurMessage(f) ? 'no_reply' : 'window_closed';
  return { route: 'none', reason: why, say: [o.template?.say, LINK_ROUTE_SAY[why]].filter(Boolean).join(' ') };
}

/** The fallback line every screen shows when nothing can be sent on WhatsApp. */
export const LINK_READY_FALLBACK = "Link ready — tell the customer where you're sending it.";
