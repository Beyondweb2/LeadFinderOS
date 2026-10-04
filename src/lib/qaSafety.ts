/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QA SAFETY — the ONE rule for "may this WhatsApp reach a real phone?" and "may this simulated payment
   run?" (pre-sales certification, 2026-10-04, docs/pre-sales-certification/README.md).

   🔴 WHY. Before this, the only thing standing between a QA test and a real WhatsApp was the QA lead
   having no phone. Nothing in any sender knew what a test lead was: metric_exclusions kept test
   activity out of the NUMBERS, never out of Meta. And the Test salesperson adding a real business from
   Coverage copies that business's real mobile onto a lead it holds — one press of "queue" from a real
   send.

   ⛔ THREE OUTCOMES, AND THE SPLIT IS THE POINT:
     · SIMULATE — a QA FIXTURE (its lead id or phone is in metric_exclusions, or its number is in
       Ofcom's reserved drama range 07700 900000–900999). The sender takes its existing test-mode
       branch for this one send: nothing goes to Meta, the message is recorded as `simulated` with
       test_mode = true, and the lead moves on exactly as a real send would — so the workflow is
       genuinely exercised.
     · REFUSE — a lead HELD by a test account (assigned_to is an excluded user), or a send PRESSED by a
       test account, that is NOT a fixture. That is a real business on a real number. It is refused,
       not simulated: a simulated row on a real phone would count as message history and the cold-
       outreach rule (coldOutreach.ts) would then refuse a genuine opener to that business forever.
     · LIVE — everything else; the global WHATSAPP_TEST_MODE still applies on top.
   ⛔ EXPLICIT, never guessed from a name: a "ZZ QA" business name means nothing here. The rows live
   in metric_exclusions (the same table that keeps them out of the business numbers).
   ⛔ ONLY UK DRAMA NUMBERS: 7700900xxx after +44 / 0 / 0044. A bare ten digits is NOT matched — +91
   77009 00xxx is a real Indian mobile range and India leads exist.
   Pure and edge-safe (relative .ts imports only).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isExcludedUser, phoneKey, type Exclusions } from './metricExclusions.ts';

/** Ofcom's reserved drama range for UK mobiles: 07700 900000 – 07700 900999. Never allocated to a
 *  real subscriber, so a QA fixture can carry one and still be refused by every sender. */
export function isReservedTestNumber(raw: string | null | undefined): boolean {
  const d = String(raw ?? '').replace(/\D/g, '');
  let national: string | null = null;
  if (d.startsWith('0044')) national = d.slice(4);
  else if (d.startsWith('44')) national = d.slice(2);
  else if (d.startsWith('0') && !d.startsWith('00')) national = d.slice(1);
  return national !== null && /^7700900\d{3}$/.test(national);
}

export type QaSimulateReason = 'reserved_test_number' | 'qa_fixture_lead' | 'qa_fixture_phone';
export type QaRefuseReason = 'test_account_lead' | 'test_account_actor';
export type QaSendVerdict =
  | { kind: 'live' }
  | { kind: 'simulate'; reason: QaSimulateReason }
  | { kind: 'refuse'; reason: QaRefuseReason };

export interface QaSendTarget {
  leadId?: string | null;
  /** Every number this send could reach — the lead's stored phone AND the converted `to`. */
  phones?: ReadonlyArray<string | null | undefined>;
  /** outreach_leads.assigned_to_user_id */
  holderUserId?: string | null;
  /** Who pressed send. Null = automation (the queue), never a test account by identity. */
  actorUserId?: string | null;
}

export function qaSendVerdict(ex: Exclusions, t: QaSendTarget): QaSendVerdict {
  const phones = (t.phones ?? []).filter((p): p is string => !!p && String(p).trim() !== '');
  if (phones.some(isReservedTestNumber)) return { kind: 'simulate', reason: 'reserved_test_number' };
  if (t.leadId && ex.leads.has(t.leadId)) return { kind: 'simulate', reason: 'qa_fixture_lead' };
  if (phones.some((p) => { const k = phoneKey(p); return k.length >= 9 && ex.phones.has(k); })) return { kind: 'simulate', reason: 'qa_fixture_phone' };
  if (isExcludedUser(ex, t.holderUserId)) return { kind: 'refuse', reason: 'test_account_lead' };
  if (isExcludedUser(ex, t.actorUserId)) return { kind: 'refuse', reason: 'test_account_actor' };
  return { kind: 'live' };
}

/** The sentence a person sees when a send is refused. No jargon, says what to do. */
export const QA_REFUSAL_REASON =
  'Not sent: this is a test account or a lead held by one. Test accounts can never message a real business. If this is a real prospect, ask Paul to move the lead to a real salesperson.';

/* ── THE SIMULATED PAYMENT ─────────────────────────────────────────────────────────────────────
   stripe-webhook accepts an UNSIGNED checkout.session.completed only with the CRON_SECRET header and
   only when every fact below holds. Each refusal is one sentence naming the fact. The checks are what
   make the simulation unable to touch money or a real person:
     · livemode false, an evt_qa_ id, a pi_qa_ payment intent (or none) — it can never be mistaken for
       or collide with a real Stripe object, and payment_ledger's unique (kind, stripe_object_id)
       makes a replay of the same pi_qa_ id a no-op;
     · NO customer — the webhook's only Stripe calls (the delayed subscription, the billing portal)
       key on the customer id, so none is made;
     · the lead is a QA fixture (metric_exclusions lead row) whose phone is absent or reserved and
       whose email is absent or internal — every message the branch sends lands on Paul;
     · the onboarding row belongs to that lead. */
export interface QaPaymentFacts {
  leadFound: boolean;
  leadExcluded: boolean;
  leadPhone: string | null;
  leadEmail: string | null;
  payerEmailInternal: boolean;
  leadEmailInternal: boolean;
  onboardingLeadId: string | null;
  /** Every contact_email on the lead's onboarding rows is absent or internal (later emails read them). */
  onboardingEmailsInternal: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function qaPaymentEventShapeRefusal(event: any): string | null {
  if (!event || typeof event !== 'object') return 'body is not an event';
  if (event.livemode !== false) return 'livemode must be false';
  if (event.type !== 'checkout.session.completed') return 'only checkout.session.completed can be simulated';
  if (typeof event.id !== 'string' || !event.id.startsWith('evt_qa_')) return 'event id must start evt_qa_';
  const s = event.data?.object;
  if (!s || typeof s !== 'object') return 'no session object';
  if (s.customer != null && s.customer !== '') return 'a simulated session must have no customer (no Stripe calls)';
  if (s.payment_intent != null && !(typeof s.payment_intent === 'string' && s.payment_intent.startsWith('pi_qa_'))) return 'payment_intent must be absent or start pi_qa_';
  if (s.status !== 'complete') return 'session status must be complete';
  if (!s.metadata?.lead_id || !s.metadata?.onboarding_id) return 'metadata.lead_id and metadata.onboarding_id are required';
  return null;
}

export function qaPaymentFactsRefusal(leadId: string, f: QaPaymentFacts): string | null {
  if (!f.leadFound) return 'the lead does not exist — refused';
  if (!f.leadExcluded) return 'the lead is not a QA fixture (no metric_exclusions lead row) — refused';
  if (f.leadPhone && !isReservedTestNumber(f.leadPhone)) return 'the lead has a phone outside the reserved test range — refused';
  if (f.leadEmail && !f.leadEmailInternal) return 'the lead has a non-internal email — refused';
  if (!f.payerEmailInternal) return 'customer_details.email must be absent or internal — refused';
  if (!f.onboardingEmailsInternal) return 'an onboarding row for this lead has a non-internal contact email — refused';
  if (f.onboardingLeadId !== leadId) return 'the onboarding row does not belong to this lead — refused';
  return null;
}
