import { getTemplateSendability } from '@/lib/whatsappTemplates';
import { isColdOutreachTemplate } from '@/lib/coldOutreach';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   BULK TEMPLATE SEND — who actually gets it, and who does not, decided BEFORE anything is sent.

   Paul, 2026-09-09: send one approved template to many Inbox conversations at once instead of
   opening each thread. Sends go out IMMEDIATELY, not through the daily queue — his call, and the
   reasoning holds: an Inbox conversation is a business that has already REPLIED, so the pacing and
   the cold-outreach cap that protect prospecting are not what is at risk here.

   ⛔ THIS MODULE DECIDES, THE COMPONENT ONLY RENDERS. Pure and testable, because the thing that
   must not go wrong is *which businesses are in the list*. scripts/inbox-bulk-send.test.ts drives
   it. The actual send still goes through send-whatsapp-message per lead, so every server-side
   guard — suppression, the phone-history seatbelt, the duplicate-pitch refusal, archived — applies
   exactly as it does to a single send. Nothing here replaces them; this is the honest preview.

   🔴 A COLD TEMPLATE CAN NEVER BE BULK-SENT, AND THAT IS THE ONE RULE WORTH THE WHOLE FILE.
   On 2026-09-02 sixteen `audit_result_hook` sends went to numbers already in conversation — nine
   had replied, four were marked not interested — because a guard was keyed to a template NAME that
   had changed underneath it. A button that fires one template at fifty businesses is that incident
   with a multiplier. So the check here is the PROPERTY, via the same isColdOutreachTemplate the
   server uses: anything not on the continuation list is refused for the whole batch, and unknown
   or blank counts as cold. A new template is covered the day it is invented, not the day someone
   remembers this file.

   ⚠️ SKIPS ARE ITEMISED WITH REASONS AND NEVER SILENTLY DROPPED — the house rule. A batch that
   quietly shrinks from 40 to 12 is how you send to the wrong twelve and never notice.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** The minimum a conversation must expose to be considered. Mirrors WaConversation's fields so the
 *  caller can pass one straight in, without this module importing the hook. */
export interface BulkCandidate {
  key: string;
  leadId: string | null;
  label: string;
  phone: string;
}

export interface BulkContext {
  /** Completed-audit report id per lead — presence means a report exists ({{4}} / {{3}}). */
  auditByLeadId: Record<string, { auditId: string }>;
}

export interface BulkSkip {
  key: string;
  label: string;
  reason: string;
}

export interface BulkPlan {
  /** Conversations that will be attempted, in the order given. */
  send: BulkCandidate[];
  /** Everything excluded, each with the reason it was excluded. */
  skipped: BulkSkip[];
  /** Set when the WHOLE batch is refused — the template itself is not bulk-sendable. */
  refusal?: string;
}

/**
 * Work out who a bulk send would actually reach.
 *
 * ⚠️ Returns a refusal rather than an empty list when the TEMPLATE is the problem. "0 will be sent"
 * and "this template must never be bulk-sent" are different answers, and a caller that shows the
 * first for the second teaches the operator to keep pressing.
 */
export function planBulkSend(
  candidates: readonly BulkCandidate[],
  template: string,
  ctx: BulkContext,
): BulkPlan {
  const name = String(template ?? '').trim();
  if (!name) return { send: [], skipped: [], refusal: 'Pick a template first.' };

  /* THE COLD GATE, ON THE BATCH. See the header: this is the 2026-09-02 incident's lesson applied
     before it can happen at scale. Deliberately a whole-batch refusal rather than a per-lead skip —
     a cold template is not "wrong for these particular leads", it is wrong for this control. */
  if (isColdOutreachTemplate(name)) {
    return {
      send: [],
      skipped: [],
      refusal:
        `"${name}" is a first-contact template, so it can't be bulk-sent from the Inbox. ` +
        `Everyone here has already been messaged — send openers from Outreach, where the ` +
        `pacing and daily cap apply.`,
    };
  }

  const send: BulkCandidate[] = [];
  const skipped: BulkSkip[] = [];
  const seenPhones = new Set<string>();

  for (const c of candidates) {
    /* A template resolves its variables from the lead record, so without one there is nothing to
       fill them from — the server refuses it too (template_needs_lead). */
    if (!c.leadId) {
      skipped.push({ key: c.key, label: c.label, reason: 'no linked lead' });
      continue;
    }
    /* ⛔ ONE MESSAGE PER PHONE NUMBER, NOT PER CONVERSATION ROW. Measured 2026-09-02: 101 numbers
       carry 234 unarchived lead rows, because one operator can hold two genuine Google listings.
       Two rows for the same number in one selection would send the same person the same template
       twice, seconds apart — and each send passes its own per-lead guard, so nothing downstream
       would catch it. */
    const phone = String(c.phone ?? '').trim();
    if (phone && seenPhones.has(phone)) {
      skipped.push({ key: c.key, label: c.label, reason: 'same phone number as another selected conversation' });
      continue;
    }

    const s = getTemplateSendability(name, { shareToken: null }, {
      reportSlug: ctx.auditByLeadId[c.leadId]?.auditId ?? null,
    });
    if (!s.ok) {
      skipped.push({ key: c.key, label: c.label, reason: s.reason ?? 'not available for this lead' });
      continue;
    }

    if (phone) seenPhones.add(phone);
    send.push(c);
  }

  return { send, skipped };
}

/** Group skips by reason for a confirm dialog — "12 skipped" is not an answer, "12: no linked
 *  lead" is. Ordered biggest first, because that is the one worth reading. */
export function groupSkips(skipped: readonly BulkSkip[]): { reason: string; count: number; labels: string[] }[] {
  const by = new Map<string, string[]>();
  for (const s of skipped) {
    const list = by.get(s.reason) ?? [];
    list.push(s.label);
    by.set(s.reason, list);
  }
  return [...by.entries()]
    .map(([reason, labels]) => ({ reason, count: labels.length, labels }))
    .sort((a, b) => b.count - a.count);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE PRE-SEND CHECK (Paul, 2026-09-27: "Sent 0, 19 failed — hook_engine_mismatch").

   planBulkSend above can only see what the browser knows. What it cannot see is what the SERVER
   will decide for each lead: audit_followup's approved words say "I asked chatgpt", and a lead
   whose best missed search is on Google AI is refused for it (templateEngineConflict,
   src/lib/rivalHook.ts) — correctly, because Google AI's competitors under "I asked chatgpt" would
   be a false statement to a stranger. Nineteen such leads were planned, confirmed and "sent", and
   every one came back refused.
   ⚠️ UPDATE, same day: Paul approved audit_followup for EITHER engine (TEMPLATE_ENGINE_CLAIM_WAIVED),
   so it no longer produces this refusal. The pre-check stays: it is how any server refusal is seen
   before Send.

   ⛔ SO THE CONFIRM ASKS THE SERVER FIRST, ONE LEAD AT A TIME, IN DRY-RUN MODE. send-whatsapp-message
   `mode: "dry_run"` is the same code path — every guard, the same hook pick (resolveAuditReplyVars:
   the report's hook gap, the Inbox card's best missed search) — and it returns before the Graph POST
   and before any row is written. There is no second copy of the selection or of the guard here.
   ⛔ A LEAD IS SENT ONLY WITH A PASSING CHECK. No check (not run yet, or the call failed) means NOT
   ready — fail closed. The real send still re-runs every guard.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface BulkCheck { ok: boolean; error?: string; reason?: string }

export interface BulkCheckedPlan {
  /** Passed the server's dry run: these, and only these, may be sent. */
  ready: BulkCandidate[];
  /** The server would refuse these, each with the reason in plain English. */
  refused: BulkSkip[];
  /** Not checked yet. Never sent. */
  pending: BulkCandidate[];
}

export function applyBulkChecks(send: readonly BulkCandidate[], checks: Readonly<Record<string, BulkCheck | undefined>>): BulkCheckedPlan {
  const ready: BulkCandidate[] = [];
  const refused: BulkSkip[] = [];
  const pending: BulkCandidate[] = [];
  for (const c of send) {
    const k = checks[c.key];
    if (!k) pending.push(c);
    else if (k.ok === true) ready.push(c);
    else refused.push({ key: c.key, label: c.label, reason: explainBulkRefusal(k.error, k.reason) });
  }
  return { ready, refused, pending };
}

/** A server refusal, in the words Paul acts on. Unknown refusals keep the server's own reason. */
export function explainBulkRefusal(error: string | null | undefined, reason: string | null | undefined): string {
  const r = String(reason ?? '');
  const e = String(error ?? '');
  if (r.startsWith('hook_engine_mismatch')) {
    return 'this template says "I asked chatgpt", but this lead\'s missed search is on Google AI. Use "Audit follow-up + call" or "Audit follow-up + fault" (they say "i asked AI").';
  }
  if (e === 'pitch_already_sent' || e === 'already_sent') return 'already had this template';
  if (e === 'phone_already_contacted') return 'this number has already been contacted';
  return r || e || 'the server would refuse this send';
}
