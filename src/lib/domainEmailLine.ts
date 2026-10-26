/* ═════════════════════════════════════════════════════════════════
   THE "Domain:" LINE OF THE ONBOARDING ALERT EMAIL (notify-onboarding-submit). Pure and edge-safe.
   🔴 2026-10-26 review: the email said "Answered — DOMAIN / AGENCY ISSUE" whenever the domain rule applied
   and was not ready, so a client who never answered the domain question read as "Answered" while the
   NEEDS YOU box said "Domain question not answered". The line now says exactly what happened: which
   domain questions are still blank, or that they answered.
   Kept out of domainAuthority.ts on purpose: that file is byte-identical in findable-site.
   ═════════════════════════════════════════════════════════════════ */
import type { DomainAuthorityVerdict, DomainRow } from './domainAuthority.ts';

const blank = (v: string | null | undefined): boolean => v == null || String(v).trim() === '';

/** The domain questions they left blank, in the order the form asks them (empty = all answered). */
export function unansweredDomainQuestions(row: DomainRow | null | undefined): string[] {
  const r = row ?? {};
  if (blank(r.domain_status)) return ['whether they have a domain'];
  if (r.domain_status !== 'existing') return [];
  const out: string[] = [];
  if (blank(r.domain_owned)) out.push('who owns the domain');
  if (blank(r.domain_access)) out.push('registrar / DNS access');
  if (blank(r.domain_third_party)) out.push('whether a third party controls it');
  return out;
}

/** The line itself; null = the row never reached the website questions (nothing is claimed). */
export function domainEmailLine(verdict: DomainAuthorityVerdict, row: DomainRow | null | undefined): string | null {
  if (!verdict.applies) return row?.domain_status ? 'Not needed — we would work on their own site' : null;
  const missing = unansweredDomainQuestions(row);
  if (missing.length > 0) return `NOT ANSWERED — still blank: ${missing.join(', ')} (see NEEDS YOU)`;
  return verdict.ready ? 'Answered — DOMAIN READY' : 'Answered — DOMAIN / AGENCY ISSUE (see NEEDS YOU)';
}
