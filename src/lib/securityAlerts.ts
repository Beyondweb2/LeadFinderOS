// securityAlerts — the words for security events: the Admin screen's rows and Paul's alert email
// (2026-09-29). ONE function per purpose, shared by the SPA and fn security-admin (edge-reachable:
// relative imports with an explicit .ts only).
//
// ⛔ ADMIN-FACING ONLY. These sentences name spend and providers; a salesperson never receives them
// (their refusal is USAGE_PAUSED_DETAIL, src/lib/protectionLimits.ts).

import { operatorAppUrl } from '../config/operatorApp.ts';

/* The app's address comes from the one constant (src/config/operatorApp.ts), never typed here. */
export const SECURITY_SCREEN_URL = operatorAppUrl('/admin/api-usage');

export interface SecurityEventRow {
  kind: string;
  severity: string;
  action?: string | null;
  occurrences?: number | null;
  detail?: Record<string, unknown> | null;
  created_at?: string | null;
  last_at?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  name?: string | null;
}

const ACTION_WORDS: Record<string, string> = {
  lead_search: 'Find Leads searches',
  place_details: 'Google place lookups',
  enrich: 'enrichment / website checks',
  site_scrape: 'website email/Facebook scans',
  hook_audit: 'hook audits',
  hook_preview: 'hook audit question previews',
  ai_draft: 'AI reply drafts / voice-note scripts',
  prospect_preview: 'prospect previews',
  niche_check: 'Niche Checks',
  audit_manual: 'manual audits',
  admin_ai: 'admin AI tools',
  claim: 'lead claims',
  lead_add: 'lead adds',
  lead_lookup: 'Find Leads ownership lookups',
  copy_numbers: 'Copy Numbers',
  export_csv: 'CSV exports',
  whatsapp_send: 'WhatsApp sends',
  whatsapp_queue: 'queued openers',
};
export const actionWords = (a: string | null | undefined): string => (a && ACTION_WORDS[a]) || (a ?? 'an action');

const usd = (v: unknown): string | null => (typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : null);

/** One plain-English sentence for an event. Positive match on every kind; an unknown kind says so. */
export function describeSecurityEvent(e: SecurityEventRow): string {
  const d = e.detail ?? {};
  const act = actionWords(e.action);
  const n = Number(e.occurrences ?? 1);
  const times = n > 1 ? ` (${n} times today)` : '';
  switch (e.kind) {
    case 'spend_warning':
      return `Unusual spend: ${usd(d.spend_hour_usd) ?? '?'} in the last hour, ${usd(d.spend_day_usd) ?? '?'} in 24 h. Still working — nothing was restricted.`;
    case 'spend_cap':
      return `Spend limit reached (${usd(d.spend_hour_usd) ?? '?'} last hour, ${usd(d.spend_day_usd) ?? '?'} in 24 h). Paid actions are PAUSED for this account until the window passes or you unlock it${times}.`;
    case 'rate_limit':
      return `Too many ${act} too fast. That action is PAUSED for this account until the window passes${times}.`;
    case 'team_cap':
      return `The team's 24-hour spend (${usd(d.team_day_usd) ?? '?'}) is over the team cap, so this salesperson's paid actions were refused${times}. Client work continues.`;
    case 'volume_warning':
      return `High volume of ${act} today — past the warning line. Still working${times}.`;
    case 'large_copy':
      return `A large Copy Numbers (${Number(d.units ?? 0)} numbers in one go). Allowed and logged.`;
    case 'too_many_rows':
      return `Tried to copy ${Number(d.units ?? 0)} numbers in one go — over the per-copy limit, refused.`;
    case 'not_allowed':
      return `Tried ${act}, which this role is not allowed — refused on the server${times}. The app does not offer this, so it was a direct call.`;
    case 'suspended':
      return `A SUSPENDED account tried ${act} — refused${times}.`;
    case 'denied_burst':
      return `Repeated refusals: ${Number(d.denied_last_10min ?? 0)} refused requests in 10 minutes (last: ${act}). Worth checking.`;
    case 'team_spend_warning':
      return `Team spend is ${usd(d.team_24h_usd) ?? '?'} in the last 24 h — past the team warning line. Includes background and client work.`;
    case 'team_spend_cap':
      return `Team spend is ${usd(d.team_24h_usd) ?? '?'} in the last 24 h — over the team cap. Sales paid actions are paused automatically; client work continues. If a background job is running away, use the Emergency stop.`;
    case 'spend_spike':
      return `Spend spike: ${usd(d.team_last_hour_usd) ?? '?'} in the last hour across everything (background jobs included). If this is a runaway, use the Emergency stop.`;
    case 'apify_near_cap':
      return `Apify is at ${String(d.pct ?? '?')}% of its monthly cap ($${String(d.used_usd ?? '?')} of $${String(d.cap_usd ?? '?')}). At 100% every audit question and SEO scan stops, paying clients included.`;
    case 'webhook_unsigned':
      return 'WhatsApp webhook signatures are NOT being checked: WHATSAPP_APP_SECRET is not set. Anyone who finds the webhook address could post a fake inbound message.';
    case 'data_export':
      return `${act}: ${Number(d.rows ?? 0)} rows.`;
    case 'paused':
      return `Refused ${act} while paid prospecting actions were paused.`;
    case 'all_stop':
      return `Refused ${act} during the emergency stop.`;
    case 'suspended_by_admin':
      return `Account suspended${typeof d.queued_leads === 'number' && d.queued_leads > 0 ? ` — ${d.queued_leads} of their leads were already queued for an opener (left queued for your decision)` : ''}.`;
    case 'reactivated_by_admin':
      return 'Account reactivated.';
    case 'mode_changed':
      return `Paid-action control changed: ${String(d.from ?? '?')} → ${String(d.to ?? '?')}.`;
    case 'limits_changed':
      return 'Usage thresholds were changed.';
    case 'user_unlocked':
      return `Per-user limits lifted for ${String(d.hours ?? '?')} hour(s).`;
    case 'denied':
      return `Refused: ${act}.`;
    default:
      return `Security event "${e.kind}".`;
  }
}

/** Was something automatically restricted by this event? (The email says so explicitly.) */
export function eventRestricted(kind: string): boolean {
  return kind === 'spend_cap' || kind === 'rate_limit' || kind === 'team_cap' || kind === 'too_many_rows' || kind === 'team_spend_cap';
}

/** The alert email for a batch of pending events: one email per sweep, never one per event. */
export function alertEmail(events: SecurityEventRow[], nowIso: string): { subject: string; lines: string[] } {
  const critical = events.filter((e) => e.severity === 'critical' || e.severity === 'restricted').length;
  const subject = `LeadFinderOS security: ${events.length} alert${events.length === 1 ? '' : 's'}${critical ? ` (${critical} restricted/critical)` : ''}`;
  const lines: string[] = [`${events.length} new security alert${events.length === 1 ? '' : 's'} (${nowIso}).`, ''];
  for (const e of events) {
    const who = e.actor_name || e.actor_email ? `${e.actor_name ?? ''}${e.actor_email ? ` <${e.actor_email}>` : ''}`.trim() : 'System';
    lines.push(`• ${who}${e.actor_role ? ` (${e.actor_role})` : ''} — ${e.kind}`);
    lines.push(`  ${describeSecurityEvent(e)}`);
    lines.push(`  When: ${e.created_at ?? '?'}${e.last_at && e.last_at !== e.created_at ? ` (last ${e.last_at})` : ''}`);
    lines.push(`  Automatically restricted: ${eventRestricted(e.kind) ? 'yes' : 'no'}`);
    lines.push('');
  }
  lines.push(`Review, suspend or unlock: ${SECURITY_SCREEN_URL}`);
  return { subject, lines };
}
