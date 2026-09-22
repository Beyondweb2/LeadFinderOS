import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeClientContext } from '../src/lib/clientContext';
import { EDITABLE_BASELINE_STATUS_FILTER, normalizePaidBaselineStatus, requireUpdatedRow } from '../src/lib/paidBaselineState';
import { buildAuditPreviewRequest, serviceAreaQuestionDirective } from '../src/lib/auditQuestionContext';

const root = resolve(import.meta.dirname, '..');
const hub = readFileSync(resolve(root, 'src/pages/ClientHub.tsx'), 'utf8');
const setup = readFileSync(resolve(root, 'src/pages/PaidBaselineSetup.tsx'), 'utf8');
const helper = readFileSync(resolve(root, 'src/lib/paidBaseline.ts'), 'utf8');
const edge = readFileSync(resolve(root, 'supabase/functions/paid-baseline/index.ts'), 'utf8');
const leadSelect = edge.match(/from\("outreach_leads"\)\s*\n\s*\.select\("([^"]+)"\)/)?.[1] ?? '';
const mockedMclContext = mergeClientContext({
  onboarding: { confirmed_location: 'Canterbury', services: null, services_list: null, areas_list: null, areas_wanted: null },
  lead: { search_keyword: 'Locksmiths', search_location: 'Canterbury', derived_town: 'Canterbury', website: 'https://mc-locksmiths.com/', services_included: null },
});
const multiAreaRequest = buildAuditPreviewRequest({
  business_name: 'MCLocksmiths centre', business_category: 'Locksmiths', website: 'https://mc-locksmiths.com/', primary_location: 'Canterbury',
  services: ['Emergency entry', 'Lock changes', 'emergency entry'], service_areas: ['Canterbury', 'Whitstable', 'Herne Bay', 'Faversham', 'Ashford', 'whitstable'], specialisms: [], country: 'UK',
}, { questionCount: 20, purpose: 'baseline', userId: 'user-1', leadId: 'lead-1' });
const blankServicesRequest = buildAuditPreviewRequest({
  business_name: 'MCLocksmiths centre', business_category: 'Locksmiths', website: '', primary_location: 'Canterbury', services: [], service_areas: [], specialisms: [], country: 'UK',
}, { questionCount: 20, purpose: 'baseline' });
let zeroRowRejected = false;
try { requireUpdatedRow(null, 'baseline_state_changed'); } catch (error) { zeroRowRejected = (error as Error).message === 'baseline_state_changed'; }

const checks: Array<[string, boolean]> = [
  ['both entry points use the shared paid-baseline helper', hub.includes('invokePaidBaseline') && setup.includes('invokePaidBaseline')],
  ['ClientHub uses the same action/lead_id request shape', helper.includes('{ action, lead_id: leadId, ...extra }')],
  ['generate does not force save_context first', !hub.includes("if (!data || !(await saveContext()))") && hub.includes("act('generate'")],
  ['optional blank services do not block generation', !hub.includes("if (!data || !(await saveContext()))")],
  /* 2026-09-22: body parsing lives in the shared invoker (src/lib/edgeInvoke.ts); the helper maps its code. */
  ['server error response is surfaced when available', readFileSync(resolve(root, 'src/lib/edgeInvokeCore.ts'), 'utf8').includes('clone().json()') && helper.includes('e.detail || (e.code && (FRIENDLY_ERRORS[e.code] ?? e.code))')],
  ['server validation codes become actionable operator text', helper.includes('FRIENDLY_ERRORS') && helper.includes('Add a location, service, and business category')],
  ['question-generation failures are safe and retryable', helper.includes('question_generation_failed') && helper.includes('Question generation failed. Please retry.')],
  ['lead load never queries the nonexistent areas_wanted column', !!leadSelect && !leadSelect.includes('areas_wanted')],
  ['mocked MCL paid client context loads without services or areas', mockedMclContext.primary_location === 'Canterbury' && mockedMclContext.business_category === 'Locksmiths' && mockedMclContext.website === 'https://mc-locksmiths.com/' && mockedMclContext.services.length === 0 && mockedMclContext.service_areas.length === 0],
  ['NULL baseline status resolves to needs_questions', normalizePaidBaselineStatus(null) === 'needs_questions'],
  ['editable baseline filter explicitly includes NULL', EDITABLE_BASELINE_STATUS_FILTER.includes('baseline_status.is.null') && edge.includes('.or(EDITABLE_BASELINE_STATUS_FILTER)')],
  ['conditional zero-row updates are rejected', zeroRowRejected && edge.includes('requireUpdatedRow(updated, "baseline_state_changed")')],
  ['load path does not invoke a provider', !edge.slice(0, edge.indexOf('if (action === "generate")')).includes('/functions/v1/create-ai-audit')],
  ['unexpected server failures return a safe actionable code', edge.includes('baseline_request_failed') && helper.includes("baseline_request_failed: 'Could not load or update baseline setup. Please retry.'")],
  ['paid baseline prefers run crawl with lead cache fallback', edge.includes('ai_audit_runs') && edge.includes('lead_crawl_checks') && edge.includes('selectClientCrawlContext')],
  ['normal audit and paid baseline share the preview request builder', edge.includes('buildAuditPreviewRequest') && hub.includes('areas_list: b.areas_list') && readFileSync(resolve(root, 'src/pages/AiAudit.tsx'), 'utf8').includes('buildAuditPreviewRequest')],
  ['multi-area generation request uses the supported service_areas field', JSON.stringify(multiAreaRequest).includes('"service_areas":["Canterbury","Whitstable","Herne Bay","Faversham","Ashford"]') && !/\bareas:\s*contextAreas/.test(edge)],
  ['multiple services are preserved and deduplicated', multiAreaRequest.specialisms === 'Emergency entry, Lock changes'],
  ['blank optional services do not block preview request construction', blankServicesRequest.specialisms === '' && blankServicesRequest.business_type === 'Locksmiths'],
  ['service-area prompt explicitly prevents town-swap duplication', serviceAreaQuestionDirective('Canterbury', multiAreaRequest.service_areas).includes('Do not repeat the same intent for every area')],
  ['blank services do not block context save', edge.includes('location_and_business_type_required') && !edge.includes('if (!location || !services || !businessType)')],
  /* 2026-09-22: save stays a button; approve → run is the shared controller (paidBaselineFlow.ts). */
  ['approve and run remain one ordered chain through the shared controller', hub.includes("act('save', 'save'") && hub.includes('approveAndStart(') && hub.includes('startApproved(')],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
if (failures) throw new Error(`${failures} failures`);
