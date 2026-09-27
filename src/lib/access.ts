/* THE PERMISSION MATRIX — the one place the SPA decides which screens a role may open.
 *
 * ⛔ THIS IS NOT THE SECURITY BOUNDARY. It decides what the app SHOWS and which routes it will
 * render. What a role can actually READ and DO is enforced by the database (RLS, the sales_leads
 * view, the claim/assign/add functions) and by every edge function (supabase/functions/_shared/
 * access.ts). A salesperson who typed an admin URL, or called an admin function by hand, is refused
 * there — this file only keeps them from seeing a screen that would then show nothing but errors.
 *
 * ⛔ POSITIVE MATCH. A route is open to sales only if it is listed here. A new admin page is
 * admin-only by default — forgetting to list it can never expose it.
 *
 * docs/multi-user.md carries the same matrix in prose; scripts/access-matrix.test.ts keeps them
 * agreeing. A future sales_manager is one more AppRole and one more list. */

import type { AppRole } from './roleRules';
export type { AppRole } from './roleRules';

/** Route PATTERNS a salesperson may open (react-router syntax, matched by prefix-safe rules below). */
export const SALES_ROUTE_PATTERNS: readonly string[] = [
  '/sales',
  '/sales/lead/:leadId',
  '/find-leads',
  '/coverage',
  '/review-replies',
];

/** Where each role lands after sign-in, and where a refused route sends them. */
export function homeFor(role: AppRole | null): string {
  if (role === 'admin') return '/';
  if (role === 'sales') return '/sales';
  return '/auth';
}

function matches(pattern: string, path: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(':') ? a[i].length > 0 : seg === a[i]);
}

/** May this role open this path? admin: everything. sales: only the listed patterns. none: nothing. */
export function canOpenRoute(role: AppRole | null, path: string): boolean {
  if (role === 'admin') return true;
  if (role === 'sales') return SALES_ROUTE_PATTERNS.some((p) => matches(p, path));
  return false;
}

/** The feature matrix, for the Team page and the docs. `sales` values are what the server enforces. */
export const PERMISSION_MATRIX: ReadonlyArray<{ feature: string; admin: string; sales: string }> = [
  { feature: 'Sales home / My leads', admin: 'yes', sales: 'yes (own leads)' },
  { feature: 'Conversations + WhatsApp history', admin: 'all', sales: 'own leads only' },
  { feature: 'Approved templates / replies / voice notes', admin: 'yes', sales: 'own leads only' },
  { feature: 'Bulk outreach (approved opener)', admin: 'yes', sales: 'own leads only' },
  { feature: 'Hook audit ("AI visibility check")', admin: 'yes', sales: 'own leads only' },
  { feature: 'Full measurement / Discovery / Baseline / Remeasure', admin: 'yes', sales: 'no' },
  { feature: 'Coverage', admin: 'yes', sales: 'yes (counts)' },
  { feature: 'Find Leads', admin: 'yes', sales: 'yes' },
  { feature: 'Add a new business', admin: 'yes', sales: 'yes (never a duplicate)' },
  { feature: 'Claim an unassigned, never-contacted lead', admin: 'assigns instead', sales: 'yes' },
  { feature: 'Claim / add a contacted or owned lead', admin: 'reassigns', sales: 'no' },
  { feature: 'Assign / reassign / unassign', admin: 'yes', sales: 'no' },
  { feature: 'Internal notes, follow-ups, call outcomes, website control', admin: 'all leads', sales: 'own leads' },
  { feature: 'Stages', admin: 'all', sales: 'interested, price given, not interested, won (awaiting admin)' },
  { feature: 'Paid clients / Delivery / Website build / Welcome packs', admin: 'yes', sales: 'no' },
  { feature: 'Dashboard, revenue, billing, payment and Stripe data', admin: 'yes', sales: 'no' },
  { feature: 'Page generator / Page plan / Mockups / Playbook', admin: 'yes', sales: 'no' },
  { feature: 'Outreach table, AI Audit page, Templates, queue controls', admin: 'yes', sales: 'no' },
  { feature: 'Team, roles, invites, disable', admin: 'yes', sales: 'no' },
  { feature: 'API usage, system configuration, secrets', admin: 'yes', sales: 'no' },
];
