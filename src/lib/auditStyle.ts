/* WHO GETS THE NEW PAST-AUDITS ROWS (Paul, 2026-11-15).
   The new rows (type badge, pooled result, Open report, Opened count, Show runs) count every answer of an audit, so they
   are used ONLY for: the two businesses Paul named, and every audit created from the new-rules cut-off onward. Every
   older audit keeps its original row with no extra counting. Pure. */
import { AUDIT_RULES_V2_FROM } from './auditVerdict.ts';

/** Named by Paul on 2026-11-15; matched on the normalised business name. */
const NEW_STYLE_BUSINESSES = ['moments wedding content', 'london domestic maintenance'];

export function isNewStyleAudit(a: { business_name: string; created_at: string }): boolean {
  const name = (a.business_name ?? '').trim().toLowerCase();
  if (NEW_STYLE_BUSINESSES.some((n) => name.startsWith(n))) return true;
  const t = Date.parse(a.created_at);
  return Number.isFinite(t) && t >= Date.parse(AUDIT_RULES_V2_FROM);
}
