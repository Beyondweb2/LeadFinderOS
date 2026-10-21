/* THE PITCH WAITS FOR ITS EVIDENCE (Paul, 2026-10-21; record docs/ai-handles-replies.md "Draft after the audit").
   The first-reply pitch names the competitors from the audit and the issues from the website check. A reply that arrives
   while either is still running used to get a pitch with neither. Now:
     · the pitch is written only when the audit AND the website check are FINAL —
         audit: done (a run complete / capped) or failed (every run failed / cancelled after the queue's own retries);
         crawl: a stored check (issues / clean / could not read the site), no website, only a profile, or a failed attempt;
     · before that the inbound's row WAITS (`ai_reply_drafts` kind 'skipped', status 'pending', reason WAITING_REASON —
       existing columns; 'skipped' draws no chip or panel) and the tick writes the draft as soon as both are final;
     · after EVIDENCE_WAIT_MS from their reply it stops waiting: Needs you, "Audit did not finish";
     · "Draft reply" / Regenerate of a pitch inside the wait say the audit is still running (AUDIT_RUNNING_DETAIL);
     · an open pitch draft that was written without its evidence is rewritten once the evidence is final.
   ⛔ Only the PITCH waits (`pitchNeedsEvidence`). Stop / angry / no / media / every Needs you flag are decided before this and
      never wait. Pure and edge-reachable: relative imports with .ts, no Deno, no DOM. */
import { PITCH_INTRO_LINE, type MovePlan } from './replyMove.ts';

/** How long a reply waits for its audit and website check before a person is asked to take it. */
export const EVIDENCE_WAIT_MS = 30 * 60_000;
/** The waiting row's reason (ai_reply_drafts.reason; kind 'skipped', status 'pending'). */
export const WAITING_REASON = 'waiting_for_audit';
export const WAITING_LABEL = 'Waiting for audit';
/** The Needs you flag when the wait runs out. */
export const AUDIT_NOT_FINISHED_REASON = 'audit_not_finished';
export const AUDIT_NOT_FINISHED_LABEL = 'Audit did not finish';
/** What Draft reply / Regenerate say inside the wait. */
export const AUDIT_RUNNING_ERROR = 'audit_running';
export const AUDIT_RUNNING_DETAIL = 'The audit and website check are still running. The draft is written as soon as they finish.';

export type AuditPhase = 'done' | 'failed' | 'running' | 'none';
export type CrawlPhase = 'final' | 'running';

/** The ordinary audits the drafter reads (loadAuditContext's own filter): the hook / free check, never a measurement. */
export const isDrafterAudit = (a: { audit_purpose?: string | null; is_measurement?: boolean | null }) =>
  a.is_measurement !== true && (a.audit_purpose == null || a.audit_purpose === 'audit' || a.audit_purpose === 'free_check');

const DONE_RUN = new Set(['complete', 'capped']);
const DEAD_RUN = new Set(['failed', 'cancelled']);

/** The lead's audit phase, newest first. ⛔ POSITIVE: 'done' only on a complete / capped run; 'failed' only when the newest
 *  audit's runs ALL ended failed / cancelled; an audit with no runs yet, or any other run status, is still running. */
export function auditPhaseOf(audits: Array<{ audit_purpose?: string | null; is_measurement?: boolean | null; runs?: Array<{ status?: string | null }> | null }>): AuditPhase {
  const mine = audits.filter(isDrafterAudit);
  if (!mine.length) return 'none';
  if (mine.some((a) => (a.runs ?? []).some((r) => DONE_RUN.has(String(r.status ?? ''))))) return 'done';
  const newest = mine[0].runs ?? [];
  if (newest.length && newest.every((r) => DEAD_RUN.has(String(r.status ?? '')))) return 'failed';
  return 'running';
}

/** The website check's phase, from the ONE website check's state (websiteCheckFor). 'not_checked' is final only when the
 *  last attempt failed (the stored row is kept, crawlWriteRule) — "couldn't check the site". */
export function crawlPhaseOf(siteState: string | null | undefined, lastAttemptFailed: boolean): CrawlPhase {
  if (siteState === 'issues' || siteState === 'clean' || siteState === 'unreadable' || siteState === 'no_website' || siteState === 'profile') return 'final';
  return lastAttemptFailed ? 'final' : 'running';
}

/** The plans built from the audit + the website check: the first-reply pitch (and its straight-answer / chased forms), and
 *  the first auto-reply's pitch. Nothing else waits. */
export const pitchNeedsEvidence = (plan: Pick<MovePlan, 'move' | 'fixedText'>): boolean =>
  plan.move === 'first_reply_pitch' || (plan.move === 'auto_reply' && !!plan.fixedText);

export type EvidenceVerdict =
  | { state: 'ready'; audit: AuditPhase; crawl: CrawlPhase }
  | { state: 'waiting' | 'timed_out'; audit: AuditPhase; crawl: CrawlPhase; waitingFor: Array<'audit' | 'crawl'> };

/** Ready only when both are final; else waiting until EVIDENCE_WAIT_MS after their reply, then timed out. */
export function evidenceVerdict(i: { audit: AuditPhase; crawl: CrawlPhase; inboundAtMs: number; nowMs: number }): EvidenceVerdict {
  const waitingFor: Array<'audit' | 'crawl'> = [];
  if (i.audit !== 'done' && i.audit !== 'failed') waitingFor.push('audit');
  if (i.crawl !== 'final') waitingFor.push('crawl');
  if (!waitingFor.length) return { state: 'ready', audit: i.audit, crawl: i.crawl };
  const waited = Number.isFinite(i.inboundAtMs) ? i.nowMs - i.inboundAtMs : Infinity;
  return { state: waited >= EVIDENCE_WAIT_MS ? 'timed_out' : 'waiting', audit: i.audit, crawl: i.crawl, waitingFor };
}

/** What a draft's `why` records about its evidence (written on every draft since this release). */
export interface WhyEvidence { ready: boolean; audit: AuditPhase; crawl: CrawlPhase }

/** The website notes selectFindings gives when nothing has been checked yet. */
const UNCHECKED_NOTE = /^(Nobody has checked this website yet|Checking the website)/;
/** A recorded draft that was the pitch: the move, or the first auto-reply's pitch (it ends on the pitch's own next step). */
export const whyIsPitch = (why: { move?: string | null; closer?: string | null }): boolean =>
  why.move === 'first_reply_pitch' || (why.move === 'auto_reply' && (why.closer === 'agency' || why.closer === 'site'));

/** Was this pitch draft written WITHOUT its evidence? Since this release: its recorded `evidence.ready`. Older rows: no audit
 *  result on it (no search or no counts) or a website that had not been checked. Only pitch drafts with text ever count. */
export function draftLackedEvidence(why: { move?: string | null; closer?: string | null; search?: string | null; named?: unknown; findingsNote?: string | null; evidence?: Partial<WhyEvidence> | null } | null | undefined, draftText?: string | null): boolean {
  if (!why || !whyIsPitch(why) || !String(draftText ?? '').trim()) return false;
  if (why.evidence && typeof why.evidence.ready === 'boolean') return !why.evidence.ready;
  /* The pitch's no-audit opening ("It's Paul from Findable…") in the text itself: no AI result was on it when it was written. */
  return !why.search || !why.named || UNCHECKED_NOTE.test(String(why.findingsNote ?? '')) || String(draftText).includes(PITCH_INTRO_LINE);
}
