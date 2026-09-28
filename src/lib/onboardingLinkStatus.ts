/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIGN-UP (ONBOARDING) LINK: SENT and OPENED, one rule (2026-09-28, docs/sales-readiness.md).
   Read by the prospect panel (per lead) and by the Sales Dashboard fold, so the two agree.

   SENT  = an onboarding_link_events row with kind 'sent':
           · every real WhatsApp send whose text carries the lead's own link (a database trigger on
             whatsapp_messages — Inbox free text, templates and the queue alike), backfilled from
             history; or
           · a person saying they sent it another way (email / LinkedIn / SMS / in person / other).
           Copying the link is 'generated', never 'sent': a copy is not a delivery.
   OPENED = a load of findable.live's sign-up page for that lead — the page's own server call
           (findable-onboarding prefill) writes lead_page_hits page 'onboarding' — at or after the
           FIRST send, allowing OPEN_ATTRIBUTION_SLACK_MS for clock skew.
           · An operator preview (&preview=1, from the app) is page 'onboarding_preview': never an open.
           · A load BEFORE any recorded send is not an open of a link we sent (that is somebody
             testing, or a link that went out before tracking — shown as "not attributable").
           · An unknown or malformed lead id writes nothing (the prefill refuses it first).
           · openCount = page loads, not people: a reload is a second load. "Opened" is yes/no.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { OPEN_ATTRIBUTION_SLACK_MS } from './templateAttribution.ts';

export interface LinkEventRow { kind: string; channel: string; actor_user_id: string | null; created_at: string; template_name?: string | null }
export interface PageHitRow { page: string; created_at: string }

export const ONBOARDING_PAGE = 'onboarding';
export const ONBOARDING_PREVIEW_PAGE = 'onboarding_preview';

export interface OnboardingLinkStatus {
  generatedAt: string | null;
  sentCount: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  channels: string[];
  opened: boolean;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  /** Loads before any recorded send — shown, never counted. */
  unattributedLoads: number;
  previewLoads: number;
}

const ms = (iso: string) => Date.parse(iso);

export function onboardingLinkStatus(
  events: ReadonlyArray<LinkEventRow>,
  hits: ReadonlyArray<PageHitRow>,
  isMine: (actor: string | null) => boolean = () => true,
): OnboardingLinkStatus {
  const sends = events.filter((e) => e.kind === 'sent' && isMine(e.actor_user_id)).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const generated = events.filter((e) => e.kind === 'generated').sort((a, b) => ms(b.created_at) - ms(a.created_at));
  const firstSentMs = sends.length ? ms(sends[0].created_at) : null;
  const loads = hits.filter((h) => h.page === ONBOARDING_PAGE).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const counted = firstSentMs === null ? [] : loads.filter((h) => ms(h.created_at) >= firstSentMs - OPEN_ATTRIBUTION_SLACK_MS);
  return {
    generatedAt: generated[0]?.created_at ?? null,
    sentCount: sends.length,
    firstSentAt: sends[0]?.created_at ?? null,
    lastSentAt: sends[sends.length - 1]?.created_at ?? null,
    channels: [...new Set(sends.map((e) => e.channel))],
    opened: counted.length > 0,
    firstOpenedAt: counted[0]?.created_at ?? null,
    lastOpenedAt: counted[counted.length - 1]?.created_at ?? null,
    openCount: counted.length,
    unattributedLoads: loads.length - counted.length,
    previewLoads: hits.filter((h) => h.page === ONBOARDING_PREVIEW_PAGE).length,
  };
}

export const MANUAL_SEND_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'sms', label: 'Text message' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
] as const;

export const LINK_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'email', linkedin: 'LinkedIn', sms: 'text', in_person: 'in person', other: 'other', copy: 'copied',
};

/** The operator's own view of the link: the same URL with preview=1, so opening it never counts. */
export function previewUrl(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'preview=1';
}

/** A findable onboarding link inside message text, for the Inbox's link rewriter. */
export const ONBOARDING_LINK_RE = /https?:\/\/[^\s]*\/onboarding\/[^\s]*[?&]lead=[0-9a-f-]{36}[^\s]*/gi;
