import type { OutreachLead } from '@/types/outreach';
import { looksAutomated } from '@/lib/inboundClassify';

/* ============================================================
   NEXT ACTIONS, WORKED OUT LIVE

   The card used to read outreach_leads.next_action, a stored field written automatically on an
   inbound reply and cleared only by a human pressing a button. Nothing cleared it when the work was
   actually done, so on 2026-07-28 all nine tasks on the card were already-answered replies — one of
   them to a lead who had said no — while the two leads genuinely waiting for an answer were absent.
   A list that is wrong in both directions is worse than no list.

   These rules derive from lead state and message timestamps, so a task disappears the moment the
   thing it asks for is done. Nothing is stored, so nothing can go stale.

   Manual tasks are MERGED rather than replaced: an operator can still set a task on a lead by hand
   and clear it by hand. The one exception is documented on isRedundantAutoReply below.
   ============================================================ */

export type TaskKind = 'deliver' | 'chase' | 'quoted' | 'reply' | 'manual' | 'fix_trades';

/** 'open' = show the lead on Outreach; the rest open that channel's composer. */
export type JumpTarget = 'whatsapp' | 'call' | 'open';

/* Manual next_action values that mean "send them a message", so the row opens the composer at the
   template step rather than just showing the lead. Carried over verbatim from the old card so a
   task an operator set by hand still lands exactly where it used to. */
const MESSAGING_ACTIONS = new Set(['follow_up', 'send_follow_up', '2nd_follow_up', 'send_initial_text', 'send_voice_note']);

/** Derived tasks all want the conversation. Manual tasks keep the old action-based routing. */
function jumpFor(l: OutreachLead, useAction: boolean): JumpTarget {
  const cm = l.contact_method;
  if (useAction) {
    if (l.next_action === 'call') return 'call';
    if (l.next_action && MESSAGING_ACTIONS.has(l.next_action)) {
      /* 'sms' is a historic pill on 15 leads; there is no SMS composer any more, so it opens the lead. */
      return cm === 'whatsapp' || cm === 'call' ? cm : 'open';
    }
    return 'open';
  }
  return cm === 'whatsapp' ? 'whatsapp' : 'open';
}

export interface DashTask {
  /** Unique row key. Not the lead id: one lead can hold both a derived and a manual task. */
  key: string;
  kind: TaskKind;
  /** null for the aggregate row, which is about a set of leads rather than one. */
  leadId: string | null;
  business: string;
  /** Short right-hand label. */
  label: string;
  /** The plain-English line: names the business and says why it matters. */
  reason: string;
  /** Lower sorts first. Money before admin. */
  priority: number;
  /** Only manual tasks can be cleared — a derived task has nothing stored to clear. */
  clearable: boolean;
  campaignId: string | null;
  contactMethod: string | null;
  /** Where clicking the row goes. Decided here, where next_action is in scope. */
  jump: JumpTarget;
  /** Aggregate row only. */
  count?: number;
}

/** Per-lead message timestamps, the evidence that decides whether a reply is outstanding.
 *  lastInbound counts only inbound that is NOT an auto-responder — see the note on
 *  buildDashTasks' reply rule for why, and for what that filter does and doesn't catch. */
export interface LeadMessageTimes {
  lastInbound: number | null;
  lastOutbound: number | null;
}

/** Fold a lead's messages into the timestamps the rules need, dropping auto-responder inbound.
 *  Callers should use this rather than folding by hand, so the bot filter can't be forgotten:
 *  on 2026-07-28 the card said a barber was "awaiting a reply" when the only inbound was a
 *  booking bot's auto-ack. looksAutomated is the SAME check the auto-pitch rule uses.
 *
 *  It is a filter, not proof of humanity: the patterns are English-only, so non-English
 *  promotional spam still reads as a human reply. Measured against all 111 real inbound
 *  messages it removes 15. */
export function foldMessageTimes(
  rows: Array<{ lead_id: string; direction: string; created_at: string; body?: string | null }>,
): Map<string, LeadMessageTimes> {
  const out = new Map<string, LeadMessageTimes>();
  for (const m of rows) {
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const cur = out.get(m.lead_id) ?? { lastInbound: null, lastOutbound: null };
    if (m.direction === 'inbound') {
      if (looksAutomated(m.body ?? '')) continue; // a bot's auto-ack is not someone waiting on you
      cur.lastInbound = Math.max(cur.lastInbound ?? 0, t);
    } else {
      cur.lastOutbound = Math.max(cur.lastOutbound ?? 0, t);
    }
    out.set(m.lead_id, cur);
  }
  return out;
}

/** The one onboarding row that matters per lead: the newest, and whether it was paid. */
export interface LeadOnboarding {
  createdAt: number;
  paid: boolean;
}

export interface TaskInputs {
  leads: OutreachLead[];
  times: Map<string, LeadMessageTimes>;
  onboarding: Map<string, LeadOnboarding>;
  /** Leads that already have a paid 3-run baseline — i.e. setup has begun. */
  leadsWithBaseline: Set<string>;
  now?: number;
}

/* Statuses where there is nothing to chase: they said no, opted out, or it is closed. */
/* ⛔ `refunded` IS DEAD FOR TASK PURPOSES — added 2026-08-29 with the status. A refunded customer
   is a settled, finished outcome: there is nothing to chase and nothing to fix, and surfacing them
   would be worse than noise on a card whose whole job is "what should I do next".
   ⛔ AND THE LOCAL isPaid BELOW IS DELIBERATELY *NOT* MADE REFUND-AWARE. It gates the CHASE tasks,
   so teaching it about refunds would flip a refunded lead to "not paid" and start asking Paul to
   chase someone he has just given the money back to — the exact opposite of the intent. Excluding
   them here is what makes that safe; the money predicate (src/lib/leadPayment.ts) is a different
   question and is refund-aware there. */
const DEAD = new Set(['not_interested', 'opted_out', 'closed', 'refunded']);
/* Statuses the card must never surface (see the "what should NOT be on it" list):
   - no_whatsapp / no_whatsapp_needs_sms: unreachable on WhatsApp (the second is the landline
     marker), and there is no other automated channel, so there is no action available at all;
   - queued: the drip sends these on a timer, so there is nothing for a human to do. */
const NOT_ACTIONABLE = new Set(['no_whatsapp', 'no_whatsapp_needs_sms', 'queued']);


/* How long a quoted lead may stay silent before it becomes a task. Three days: long enough that a
   quote sent Friday is not chased over the weekend, short enough that a warm lead cannot rot. */
const QUOTED_QUIET_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (t: number, now: number) => Math.floor((now - t) / DAY);

/** "today", "yesterday", "3 days ago" — how a person says it. */
export function agoPhrase(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/* Money in the bank is the only test. The status half of this used to be OR'd in, so a £0 lead an
   operator dragged to in_delivery or completed counted as paid — the mirror of the bug on the
   revenue page, which counted status and ignored money. A manual/offline sale must therefore have
   amount_paid filled in to register; a status move alone no longer implies payment. */
const isPaid = (l: OutreachLead) => (l.amount_paid ?? 0) > 0;

/** A reply is outstanding when their newest message is newer than our newest. */
export function awaitingReply(t: LeadMessageTimes | undefined): boolean {
  if (!t || t.lastInbound === null) return false;
  return t.lastOutbound === null || t.lastOutbound < t.lastInbound;
}

/* THE ONE SUPPRESSION APPLIED TO A STORED TASK.
   'send_draft' ("Respond") WAS the value whatsapp-inbound wrote automatically on an inbound reply
   (and statusUpdatePatch on a hand-set 'replied') until 2026-09-13 — the only next_action nobody
   chose, and the one that piled up (625 overdue rows), because answering someone never cleared it.
   Neither writer sets it any more; the rule below stays for the rows that already carry it and
   for anyone who picks "Respond" by hand. Where the lead has inbound history, rule 3 above decides the same thing
   from evidence and decides it better, so the stored copy is pure duplication:
     - still awaiting a reply  -> the reply rule already shows the row; a second would say it twice
     - already answered        -> the task is done, which is the bug that put nine dead rows on the card
   The exception preserves deliberate work: with NO inbound message ever, the value cannot have been
   auto-written, so a human chose it and it stays. Every other next_action shows regardless. */
export function isRedundantAutoReply(l: OutreachLead, t: LeadMessageTimes | undefined): boolean {
  if (l.next_action !== 'send_draft') return false;
  if (!t || t.lastInbound === null) return false; // nobody ever wrote in -> hand-set, keep it
  return true;
}

/**
 * Build the card's list. Pure: same inputs, same output, no fetching, nothing stored.
 * Order is priority then age — the oldest neglected thing first within each kind.
 */
export function buildDashTasks(input: TaskInputs): DashTask[] {
  const { leads, times, onboarding, leadsWithBaseline } = input;
  const now = input.now ?? Date.now();
  const tasks: DashTask[] = [];

  const live = leads.filter((l) => !l.is_archived);

  for (const l of live) {
    const t = times.get(l.id);
    const paid = isPaid(l);

    /* 1 — DELIVER. Their money is in and setup has not started. This is the only task with an
       explicit promise attached: the confirmation screen says "within two working days". */
    if (paid && !leadsWithBaseline.has(l.id)) {
      tasks.push({
        key: `deliver:${l.id}`, kind: 'deliver', leadId: l.id, business: l.business_name,
        label: 'Deliver', priority: 1, clearable: false, jump: jumpFor(l, false),
        reason: `${l.business_name} has paid and setup hasn't started — you promised within two working days`,
        campaignId: l.campaign_id ?? null, contactMethod: l.contact_method ?? null,
      });
    }

    /* 2 — CHASE. Filled the questionnaire and did not pay: the warmest lead there is, because they
       did the work and stopped at the price. Held back for a day so someone mid-checkout is not
       chased while they are still deciding. */
    const ob = onboarding.get(l.id);
    if (ob && !ob.paid && !paid && !DEAD.has(l.status)) {
      const d = daysSince(ob.createdAt, now);
      if (d >= 1) {
        tasks.push({
          key: `chase:${l.id}`, kind: 'chase', leadId: l.id, business: l.business_name,
          label: 'Chase', priority: 2, clearable: false, jump: jumpFor(l, false),
          reason: `${l.business_name} filled the questionnaire ${agoPhrase(d)} and hasn't paid`,
          campaignId: l.campaign_id ?? null, contactMethod: l.contact_method ?? null,
        });
      }
    }

    /* 3 — QUOTED AND GONE QUIET. They have a price and stopped talking. Sits above a general reply
       because a quote is the last step before money, and below Chase because someone mid-checkout is
       closer still.

       Deliberately requires !awaitingReply: "gone quiet" means the ball is in THEIR court. If they
       wrote and we have not written back then WE went quiet, and rule 4 says so more accurately, so
       the two can never both fire on one lead.

       The clock is the last time we heard from them; failing that the last time we wrote; failing
       that when the row was last touched, which is when the status was set. That last fallback is
       noisy — any edit bumps updated_at — but it only ever DELAYS the task, never loses it, which is
       the safe direction for a rule whose whole job is catching leads that fall through. */
    if (l.status === 'price_given' && !DEAD.has(l.status) && !isPaid(l) && !awaitingReply(t)) {
      const heardFrom = t?.lastInbound ?? null;
      const clock = heardFrom ?? t?.lastOutbound ?? (l.updated_at ? new Date(l.updated_at).getTime() : null);
      const d = clock === null ? -1 : daysSince(clock, now);
      if (d >= QUOTED_QUIET_DAYS) {
        tasks.push({
          key: `quoted:${l.id}`, kind: 'quoted', leadId: l.id, business: l.business_name,
          label: 'Follow up', priority: 3, clearable: false, jump: jumpFor(l, false),
          reason: heardFrom === null
            ? `${l.business_name} was quoted ${d} days ago and hasn't replied at all`
            : `${l.business_name} was quoted and hasn't been in touch for ${d} days`,
          campaignId: l.campaign_id ?? null, contactMethod: l.contact_method ?? null,
        });
      }
    }

    /* 4 — REPLY. They wrote and we have not written back. Derived from message timestamps, so it
       clears itself the moment you answer. */
    if (awaitingReply(t) && !DEAD.has(l.status) && !NOT_ACTIONABLE.has(l.status)) {
      const d = daysSince(t!.lastInbound!, now);
      tasks.push({
        key: `reply:${l.id}`, kind: 'reply', leadId: l.id, business: l.business_name,
        label: 'Reply', priority: 4, clearable: false, jump: jumpFor(l, false),
        reason: `${l.business_name} replied ${agoPhrase(d)} and hasn't been answered`,
        campaignId: l.campaign_id ?? null, contactMethod: l.contact_method ?? null,
      });
    }

    /* 5 — MANUAL. Kept, because an operator setting a task by hand is a deliberate act. Suppressed
       only for the auto-written send_draft that the reply rule already decides from evidence. */
    if (l.next_action && l.next_action !== 'none' && !isRedundantAutoReply(l, t)) {
      tasks.push({
        key: `manual:${l.id}`, kind: 'manual', leadId: l.id, business: l.business_name,
        label: 'Your task', priority: 5, clearable: true, jump: jumpFor(l, true),
        reason: `${l.business_name} — task you set${l.next_action_date ? `, due ${l.next_action_date}` : ''}`,
        campaignId: l.campaign_id ?? null, contactMethod: l.contact_method ?? null,
      });
    }
  }

  /* 6 — FIX TRADES, as ONE line. Individually these would be 78 rows of admin burying the four
     rules above, which is how the old card became unreadable. A lead with no trade cannot be sold
     to: checkout refuses the payment, because no baseline could run to measure the guarantee. */
  const noTrade = live.filter(
    (l) => !((l.category || l.search_keyword || '').trim()) &&
      !DEAD.has(l.status) && !NOT_ACTIONABLE.has(l.status) && !isPaid(l),
  );
  if (noTrade.length > 0) {
    tasks.push({
      key: 'fix_trades', kind: 'fix_trades', leadId: null, business: '',
      label: 'Fix', priority: 6, clearable: false, jump: 'open', count: noTrade.length,
      /* No link: Outreach only accepts a single-lead launch intent, and "no trade stored" is not one
         of its filter dimensions, so a filtered view would mean new filter plumbing. Say so on the
         line rather than offering a click that goes nowhere useful. */
      reason: `${noTrade.length} ${noTrade.length === 1 ? 'lead has' : 'leads have'} no trade stored — they can't be sold to until it's set (no filtered list yet)`,
      campaignId: null, contactMethod: null,
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.business.localeCompare(b.business));
}
