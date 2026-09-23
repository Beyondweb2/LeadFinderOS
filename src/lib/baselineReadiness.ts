/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BASELINE READINESS — what the paid baseline needs before it can be prepared, and what is missing.

   ⛔ THE SAME RULE THE SERVER APPLIES, NOT A SECOND ONE. "Required" here is exactly what paid-baseline
   refuses approval without: the onboarding ROW's confirmed location and services
   (missingQuestionnaireFields — the rule startPaidBaseline waits on) and a business category. Areas
   and the website are shown as attention items, never as blockers: the guarantee is judged in the
   home town, and a client with no website is a valid client.
   ⛔ EVERY MISSING ITEM HAS A FIX ON THE SAME PAGE — the manual onboarding form — so Paul is never
   stuck waiting for the customer.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { effectiveQuestionnaireServices } from './questionnaireComplete.ts';
import { onboardingStatus } from './manualOnboarding.ts';

export interface ReadinessItem { key: string; label: string; ok: boolean; required: boolean; detail: string }
export interface BaselineReadiness { items: ReadinessItem[]; ready: boolean; attention: ReadinessItem[] }

type Row = Record<string, unknown> | null | undefined;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const listOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : s(v).split(',').map((x) => x.trim()).filter(Boolean));

export function baselineReadiness(lead: Row, onboarding: Row): BaselineReadiness {
  const l = lead ?? {}, o = onboarding ?? null;
  const status = onboardingStatus(o);
  const services = effectiveQuestionnaireServices((o ?? {}) as never);
  const areas = listOf(o?.areas_list).length ? listOf(o?.areas_list) : listOf(o?.areas_wanted);
  const town = s(o?.confirmed_location);
  const site = s(o?.business_website) || s(l.website);
  const noSite = s(o?.website_route) === 'new_site';
  const category = s(l.category) || s(l.search_keyword);
  const items: ReadinessItem[] = [
    { key: 'business', label: 'Business', ok: !!s(l.business_name), required: true, detail: s(l.business_name) || 'No business name on the client record' },
    { key: 'category', label: 'Trade / category', ok: !!category, required: true, detail: category || 'No trade recorded — answer "What you do" in onboarding' },
    { key: 'website', label: 'Website', ok: !!site || noSite, required: false, detail: site || (noSite ? 'No current website — we build one' : 'No website recorded') },
    { key: 'onboarding', label: 'Onboarding', ok: status.state === 'complete' || status.state === 'completed_manually', required: true, detail: status.label },
    { key: 'primary_location', label: 'Primary location', ok: !!town, required: true, detail: town || 'Missing — the home town the guarantee is judged in' },
    { key: 'services', label: 'Services', ok: services.length > 0, required: true, detail: services.length ? services.join(', ') : 'Missing — the baseline measures these' },
    { key: 'service_areas', label: 'Service areas', ok: areas.length > 0, required: false, detail: areas.length ? areas.join(', ') : 'None listed — the baseline will measure the home town only' },
  ];
  return { items, ready: items.every((i) => !i.required || i.ok), attention: items.filter((i) => !i.ok) };
}
