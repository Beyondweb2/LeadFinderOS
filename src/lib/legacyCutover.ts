/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LEGACY FINDABLE CHECKOUT CUTOVER — which pre-v3 payment paths are still PAYABLE, and the exact
   objects to invalidate before the agreement-first checkout goes live (Paul, 2026-10-05).

   ⛔ PAUL'S RULE: no payment may be taken for a new v3 sale without the v3 agreement acceptance. The
      checkout gate stops NEW sessions; this finds what was created BEFORE it and can still take money:
        · OPEN Stripe Checkout Sessions made by the old findable-checkout (metadata onboarding_id, no v3
          terms) — including the ones behind Quick Close links already sent to prospects;
        · ACTIVE Stripe PAYMENT LINKS for Findable (hand-made in the dashboard; the founder-era one was
          "kept for sending manually on WhatsApp") — no code ever created one, so only Stripe can list them;
        · Quick Close rows still storing a Stripe URL (payable only while their session is open).
   ⛔ TARGETS ONLY FINDABLE SALES PATHS. A session with no onboarding id (the barber hosting product,
      anything else) is never touched; a signed v3 session is never touched; a COMPLETE session is history
      and is never listed. A Payment Link that cannot be classified is REPORTED for Paul, never guessed.
   ⛔ PURE. The Stripe and database I/O is _shared/legacy-cutover.ts; the run is fn legacy-checkout-cutover
      (report by default; executing needs the exact plan hash of the report Paul reviewed).
   ⚠️ Edge-reachable — explicit .ts on every relative import.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { COMMERCIAL_TERMS_V3 } from './clientTimeline.ts';
import { FINDABLE_SETUP_PRICE_GBP } from './findableOffer.ts';

export interface StripeSessionLite {
  id: string; status?: string | null; created?: number | null; url?: string | null; payment_link?: string | null;
  amount_total?: number | null; metadata?: Record<string, string | undefined> | null;
}
export interface StripeLinkLineItem { description?: string | null; price?: { unit_amount?: number | null; currency?: string | null; product?: string | null } | null }
export interface StripePaymentLinkLite {
  id: string; active?: boolean | null; url?: string | null; metadata?: Record<string, string | undefined> | null; line_items: StripeLinkLineItem[];
}
export interface StoredQuickCloseLink { onboarding_id: string; lead_id: string | null; status: string | null; link_url: string | null; link_session_id: string | null; link_kind: string | null }

export type SessionClass = 'findable_legacy' | 'findable_v3_signed' | 'payment_link_session' | 'not_findable';
export type LinkClass = 'findable' | 'not_findable' | 'unclassified';

/** Every price Findable has ever sold its first payment at (pence): founder £19.99, £49.99, then £99. */
export const FINDABLE_HISTORIC_SETUP_PENCE: ReadonlySet<number> = new Set([1999, 4999, Math.round(FINDABLE_SETUP_PRICE_GBP * 100)]);
const FINDABLE_WORDS = /findable|ai visibility|visibility (check|sprint|cycle)|founder/i;
const OTHER_PRODUCT_WORDS = /barber|salon|website hosting only|domain only/i;

/** An OPEN session: made by the old Findable checkout (legacy, payable), a signed v3 one (leave), a
 *  Payment Link's own session (classified with its link), or not Findable at all (never touched). */
export function classifySession(s: StripeSessionLite): SessionClass {
  const m = s.metadata ?? {};
  if (m.onboarding_id) return m.commercial_terms === COMMERCIAL_TERMS_V3 ? 'findable_v3_signed' : 'findable_legacy';
  if (s.payment_link) return 'payment_link_session';
  return 'not_findable';
}

/** An ACTIVE Payment Link. Findable when its metadata or any line item says so, or any line item charges
 *  a historic Findable first-payment price in GBP; not Findable when a line item names another product and
 *  nothing says Findable; otherwise unclassified (Paul decides — never guessed either way). */
export function classifyPaymentLink(l: StripePaymentLinkLite): LinkClass {
  const meta = Object.values(l.metadata ?? {}).join(' ');
  if (FINDABLE_WORDS.test(meta)) return 'findable';
  for (const li of l.line_items) {
    if (FINDABLE_WORDS.test(li.description ?? '')) return 'findable';
    const amt = li.price?.unit_amount; const cur = (li.price?.currency ?? '').toLowerCase();
    if (cur === 'gbp' && typeof amt === 'number' && FINDABLE_HISTORIC_SETUP_PENCE.has(amt)) return 'findable';
  }
  if (l.line_items.some((li) => OTHER_PRODUCT_WORDS.test(li.description ?? ''))) return 'not_findable';
  return 'unclassified';
}

/** A Quick Close row storing a Stripe URL (made before the sign-up link). */
export function isStoredLegacyQuickClose(q: StoredQuickCloseLink): boolean {
  return q.status !== 'paid' && q.link_kind !== 'signup' && /^https:\/\/checkout\.stripe\.com\//.test(q.link_url ?? '');
}
const sessionFromUrl = (url: string | null) => /\/(cs_(?:live|test)_[A-Za-z0-9]+)/.exec(url ?? '')?.[1] ?? null;

export interface CutoverPlan {
  /** Open legacy Findable Checkout Sessions → EXPIRE. */
  expireSessions: Array<{ id: string; onboarding_id: string | null; lead_id: string | null; created: number | null; amount_total: number | null; quick_close: boolean }>;
  /** Active Findable Payment Links → DEACTIVATE. Their open sessions are expired too. `items` = what the link
   *  sells (description, pence, currency), so a person can confirm the classification before executing. */
  deactivateLinks: Array<{ id: string; url: string | null; why: string; items?: string[] }>;
  /** Active Payment Links nobody could classify → Paul must decide before READY. */
  unclassifiedLinks: Array<{ id: string; url: string | null; items: string[] }>;
  storedQuickClose: { total: number; payable: number; rows: Array<{ onboarding_id: string; lead_id: string | null; session: string | null; payable: boolean }> };
  /** Signed v3 sessions and non-Findable objects — listed by count only, never touched. */
  untouched: { v3SignedSessions: number; notFindableSessions: number; notFindableLinks: number };
  otherBypassPaths: number;
  ready: boolean;
}

export function buildCutoverPlan(input: { openSessions: StripeSessionLite[]; activeLinks: StripePaymentLinkLite[]; quickClose: StoredQuickCloseLink[] }): CutoverPlan {
  const linkClass = new Map(input.activeLinks.map((l) => [l.id, classifyPaymentLink(l)]));
  const expireSessions: CutoverPlan['expireSessions'] = [];
  let v3Signed = 0; let notFindable = 0; let unclassifiedLinkSessions = 0;
  const qcSessions = new Set(input.quickClose.filter(isStoredLegacyQuickClose).map((q) => q.link_session_id ?? sessionFromUrl(q.link_url)).filter(Boolean));
  for (const s of input.openSessions) {
    if ((s.status ?? 'open') !== 'open') continue; // complete / expired = history, never touched
    const c = classifySession(s);
    if (c === 'findable_v3_signed') { v3Signed++; continue; }
    if (c === 'not_findable') { notFindable++; continue; }
    if (c === 'payment_link_session') {
      const lc = linkClass.get(String(s.payment_link)) ?? 'unclassified';
      if (lc === 'not_findable') { notFindable++; continue; }
      if (lc === 'unclassified') { unclassifiedLinkSessions++; continue; }
    }
    expireSessions.push({ id: s.id, onboarding_id: s.metadata?.onboarding_id ?? null, lead_id: s.metadata?.lead_id ?? null, created: s.created ?? null, amount_total: s.amount_total ?? null, quick_close: qcSessions.has(s.id) });
  }
  const deactivateLinks: CutoverPlan['deactivateLinks'] = [];
  const unclassifiedLinks: CutoverPlan['unclassifiedLinks'] = [];
  let notFindableLinks = 0;
  for (const l of input.activeLinks) {
    if (l.active === false) continue;
    const c = linkClass.get(l.id)!;
    const items = l.line_items.map((li) => `${li.description ?? '?'} ${li.price?.unit_amount ?? '?'} ${li.price?.currency ?? ''}`.trim());
    /* Say WHICH evidence classified it (F + H integration, 2026-10-05): a name is strong; a price alone is weaker
       and a person confirms it from `items` before executing. Display only — the plan hash covers ids. */
    const byName = FINDABLE_WORDS.test(Object.values(l.metadata ?? {}).join(' ')) || l.line_items.some((li) => FINDABLE_WORDS.test(li.description ?? ''));
    if (c === 'findable') deactivateLinks.push({ id: l.id, url: l.url ?? null, why: `${byName ? 'names Findable' : 'charges a historic Findable first-payment price (price match only)'} — payable outside the signed sign-up`, items });
    else if (c === 'unclassified') unclassifiedLinks.push({ id: l.id, url: l.url ?? null, items });
    else notFindableLinks++;
  }
  const openLegacyIds = new Set(expireSessions.map((s) => s.id));
  const qcRows = input.quickClose.filter(isStoredLegacyQuickClose).map((q) => {
    const session = q.link_session_id ?? sessionFromUrl(q.link_url);
    return { onboarding_id: q.onboarding_id, lead_id: q.lead_id, session, payable: !!session && openLegacyIds.has(session) };
  });
  const otherBypassPaths = unclassifiedLinks.length + unclassifiedLinkSessions;
  return {
    expireSessions, deactivateLinks, unclassifiedLinks,
    storedQuickClose: { total: qcRows.length, payable: qcRows.filter((r) => r.payable).length, rows: qcRows },
    untouched: { v3SignedSessions: v3Signed, notFindableSessions: notFindable, notFindableLinks },
    otherBypassPaths,
    ready: expireSessions.length === 0 && deactivateLinks.length === 0 && otherBypassPaths === 0,
  };
}

/** The exact objects a plan would invalidate, as one stable string — hashed so EXECUTE can only run the
 *  plan Paul reviewed (anything new since the report → refuse and report again). */
export function planTargets(p: CutoverPlan): string {
  return JSON.stringify({ sessions: p.expireSessions.map((s) => s.id).sort(), links: p.deactivateLinks.map((l) => l.id).sort() });
}

/** The report, in the words the integration session reads out. */
export function cutoverReportText(p: CutoverPlan, planHash: string): string {
  const lines = [
    'LEGACY FINDABLE CHECKOUT CUTOVER',
    '',
    `Open legacy Checkout Sessions: ${p.expireSessions.length}`,
    `Active legacy Payment Links: ${p.deactivateLinks.length}`,
    `Stored legacy Quick Close links: ${p.storedQuickClose.total} (still payable: ${p.storedQuickClose.payable})`,
    `Other bypass paths: ${p.otherBypassPaths}`,
    '',
    ...p.expireSessions.map((s) => `  EXPIRE session ${s.id}${s.quick_close ? ' (Quick Close link already sent)' : ''} · lead ${s.lead_id ?? '-'} · sign-up ${s.onboarding_id ?? '-'}`),
    ...p.deactivateLinks.map((l) => `  DEACTIVATE Payment Link ${l.id} ${l.url ?? ''} — ${l.why}${l.items?.length ? `: ${l.items.join('; ')}` : ''}`),
    ...p.unclassifiedLinks.map((l) => `  REVIEW Payment Link ${l.id} ${l.url ?? ''} — could not tell if it is Findable: ${l.items.join('; ')}`),
    '',
    `Left alone: ${p.untouched.v3SignedSessions} signed v3 session(s), ${p.untouched.notFindableSessions} non-Findable session(s), ${p.untouched.notFindableLinks} non-Findable Payment Link(s). Completed payments are history and are never listed.`,
    `Plan hash: ${planHash}`,
    p.ready ? 'READY: no payable legacy Findable path remains.' : 'NOT READY: invalidate the objects above (execute with this plan hash), and decide any REVIEW items.',
  ];
  return lines.join('\n');
}

/** The phrase EXECUTE requires, besides the plan hash. */
export const CUTOVER_CONFIRM_PHRASE = 'INVALIDATE LEGACY FINDABLE CHECKOUT';
