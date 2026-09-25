/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHERE A CONVERSATION IS IN THE FUNNEL — the gate on "Research & draft reply" (Paul, 2026-09-25).

   The Findable funnel is:
     1. the cold opener ("are you taking on more jobs atm?");
     2. they reply → the AI audit runs and the COMPETITOR / AUDIT HOOK goes (audit_reply_warm,
        competitor_hook, audit_followup, …) — this step stays exactly as it is;
     3. they reply AGAIN ("How much?", "How does it work?") → only NOW is the warm-reply drafter the
        next step.
   So the drafter is offered only when an audit hook has actually gone out AND the prospect has
   written something after it. Before that, the Inbox's existing audit/hook buttons are the next step
   and this feature stays out of the way.

   ⛔ THE HOOK IS A PROPERTY, NOT A LIST OF NAMES. A hook is an outbound TEMPLATE whose registry entry
      says it is built on the audit (`WA_TEMPLATE_REQS[..].needsAudit === true`). A new audit
      template registered tomorrow is a hook the moment it is registered; a hand-kept list here would
      be the "guard keyed to today's instances" trap (CLAUDE.md §4).
   ⛔ "SENT" IS POSITIVE (`isRealSend`: sent / delivered / read). A failed or simulated hook never
      reached them, so it never opens the warm stage.
   ⚠️ A hook Paul TYPED by hand as free text cannot be told apart from any other typed message, so
      such a thread reads as HOOK NOT SENT. That is the safe direction: the drafter is withheld, the
      funnel's own buttons remain.

   Pure and edge-reachable (relative `.ts` imports only). The Inbox and warm-lead-reply both read it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { WA_TEMPLATE_REQS, canonicalTemplate } from './whatsappTemplates.ts';
import { isRealSend } from './realSend.ts';

export type WarmStage = 'no_reply' | 'hook_not_sent' | 'waiting_for_hook_reply' | 'warm';

export const WARM_STAGE_LABELS: Record<WarmStage, string> = {
  no_reply: 'NO REPLY YET',
  hook_not_sent: 'HOOK NOT SENT',
  waiting_for_hook_reply: 'WAITING FOR REPLY TO HOOK',
  warm: 'WARM CONVERSATION',
};

export interface StageMessage {
  direction: string;
  created_at: string;
  message_type?: string | null;
  template_name?: string | null;
  status?: string | null;
}

/** An audit/competitor hook that actually went out. */
export function isAuditHookSend(m: StageMessage): boolean {
  if (m.direction !== 'outbound' || !m.template_name || !isRealSend(m.status)) return false;
  return WA_TEMPLATE_REQS[canonicalTemplate(m.template_name)]?.needsAudit === true;
}

export interface WarmStageResult {
  stage: WarmStage;
  /** The newest hook that went out, or null. */
  hookAt: string | null;
  hookTemplate: string | null;
  /** Their first message after that hook, or null. */
  replyAfterHookAt: string | null;
}

/** Enumerates every arrival: no inbound at all, inbound but no hook, a hook with nothing after it,
 *  and a hook they answered. Only the last is `warm`. */
export function warmStage(messages: StageMessage[]): WarmStageResult {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const hasInbound = sorted.some((m) => m.direction === 'inbound');
  let hook: StageMessage | null = null;
  for (const m of sorted) if (isAuditHookSend(m)) hook = m;
  if (!hook) return { stage: hasInbound ? 'hook_not_sent' : 'no_reply', hookAt: null, hookTemplate: null, replyAfterHookAt: null };
  const after = sorted.find((m) => m.direction === 'inbound' && m.created_at > hook!.created_at) ?? null;
  return {
    stage: after ? 'warm' : 'waiting_for_hook_reply',
    hookAt: hook.created_at,
    hookTemplate: canonicalTemplate(hook.template_name),
    replyAfterHookAt: after?.created_at ?? null,
  };
}
