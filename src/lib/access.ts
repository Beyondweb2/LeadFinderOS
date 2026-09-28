/* THE PERMISSION MATRIX — the one place the SPA decides which screens a role may open, and what a
 * role may do on the screens both roles share.
 *
 * ⛔ THIS IS NOT THE SECURITY BOUNDARY. It decides what the app SHOWS and which routes it will
 * render. What a role can actually READ and DO is enforced by the database (RLS, the sales_leads
 * view, the claim/assign/add and lead_* functions) and by every edge function (supabase/functions/
 * _shared/access.ts). A salesperson who typed an admin URL, or called an admin function by hand, is
 * refused there — this file only keeps them from seeing a screen that would then show nothing but
 * errors.
 *
 * ⛔ POSITIVE MATCH. A route is open to sales only if it is listed here. A new admin page is
 * admin-only by default — forgetting to list it can never expose it. The same for a capability:
 * each LeadPermissions flag is true for sales only where it is written true below.
 *
 * ⛔ ONE WORKFLOW (Paul, 2026-09-27). Admin and Sales use the SAME Outreach and Inbox pages and the
 * SAME components; `leadPermissions` says which admin/system/delivery controls a salesperson does not
 * get. There is no second CRM: the old /sales and /sales/lead/:id routes only redirect into Outreach.
 *
 * docs/multi-user.md carries the same matrix in prose; scripts/access-matrix.test.ts keeps them
 * agreeing. A future sales_manager is one more AppRole and one more branch. */

import type { AppRole } from './roleRules';
export type { AppRole } from './roleRules';

/** Route PATTERNS a salesperson may open (react-router syntax, matched by the rule below). */
export const SALES_ROUTE_PATTERNS: readonly string[] = [
  /* The Sales Dashboard (2026-09-28): a salesperson's own numbers, scoped by the server
     (fn sales-performance), never by the page. */
  '/sales-dashboard',
  '/outreach',
  '/inbox',
  '/find-leads',
  '/coverage',
  /* Redirect-only: the retired My Leads pages. They render nothing but a redirect into Outreach, so
     an old bookmark lands on the same lead instead of breaking. */
  '/sales',
  '/sales/lead/:leadId',
];

/** Where each role lands after sign-in, and where a refused route sends them. */
export function homeFor(role: AppRole | null): string {
  if (role === 'admin') return '/';
  if (role === 'sales') return '/outreach';
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

/** What a role may DO on the shared Outreach / Inbox / lead detail. Presentation only (see above). */
export interface LeadPermissions {
  /** Direct edits of the lead record itself: name, phone/email/website/address, contact-method tag,
   *  photo. (A salesperson's contact name, trade and town go through lead_set_details instead.) */
  editLeadRecord: boolean;
  /** Remove, reset, reset-to-fresh, archive-everything. */
  removeLeads: boolean;
  importLeads: boolean;
  /** Enrichment admin: enrich, find emails, phone lookups, fix town, bulk set trade. */
  enrichLeads: boolean;
  /** Bulk AI audits (the paid multi-lead audit job). A salesperson runs the one-lead Hook Audit. */
  bulkAudits: boolean;
  campaigns: boolean;
  product: boolean;
  /** The paste-any-URL crawl check and the crawl buttons on the list rows / Inbox header (admin). */
  crawlSite: boolean;
  /** The FULL crawl of a lead's own website from its workspace (2026-09-28): both roles. crawl-check
   *  lets a salesperson crawl only a lead they work, and only that lead's own website. */
  crawlOwnLead: boolean;
  /** Paid-client and delivery data: payment, questionnaire, delivery cockpit, playbook, welcome pack,
   *  onboarding link, SEO scan, Mark Paid. Sales never RECEIVES those fields either (sales_leads). */
  clientDelivery: boolean;
  /** Queue and automation settings: the queue panel, Send now, the first-reply rule, the follow-up
   *  lanes, removing a lead from the queue. */
  queueControls: boolean;
  /** Assign / reassign / unassign an owner (assign_lead is admin-only in the database). */
  assignOwner: boolean;
  /** The AI Audit page (full measurement, discovery, baselines). */
  auditAdmin: boolean;
  /** The unassigned, never-contacted pool with Claim (the admin assigns instead). */
  claimPool: boolean;
  /** The admin's free-text "Private" note on the row (outreach_leads.notes, not in the sales view). */
  privateNote: boolean;
  /** Statuses this role may SET. null = every status. */
  settableStatuses: readonly string[] | null;
}

/** The statuses a salesperson may set — the server's lead_set_stage allowlist plus the Interested
 *  star (lead_mark_interested). scripts/sales-shared-workflow.test.ts holds it to the migration. */
export const SALES_SETTABLE_PIPELINE = ['interested', 'price_given', 'not_interested', 'won_pending_onboarding'] as const;

export function leadPermissions(role: AppRole | null): LeadPermissions {
  const admin = role === 'admin';
  return {
    editLeadRecord: admin,
    removeLeads: admin,
    importLeads: admin,
    enrichLeads: admin,
    bulkAudits: admin,
    campaigns: admin,
    product: admin,
    crawlSite: admin,
    crawlOwnLead: admin || role === 'sales',
    clientDelivery: admin,
    queueControls: admin,
    assignOwner: admin,
    auditAdmin: admin,
    claimPool: role === 'sales',
    privateNote: admin,
    settableStatuses: admin ? null : role === 'sales' ? SALES_SETTABLE_PIPELINE : [],
  };
}

/** May this role set this status? (Presentation; lead_set_stage decides for sales.) */
export function maySetStatus(p: LeadPermissions, status: string): boolean {
  return p.settableStatuses === null || p.settableStatuses.includes(status);
}

/** The feature matrix, for the Team page and the docs. `sales` values are what the server enforces. */
export const PERMISSION_MATRIX: ReadonlyArray<{ feature: string; admin: string; sales: string }> = [
  { feature: 'Outreach (same page, same table)', admin: 'all leads', sales: 'own assigned leads' },
  { feature: 'Inbox (same page) — conversations, WhatsApp history, media', admin: 'all', sales: 'own leads only' },
  { feature: 'Approved templates / replies / voice notes / attachments', admin: 'yes', sales: 'own leads only' },
  { feature: 'Bulk initial outreach (the opener chosen for the batch)', admin: 'yes', sales: 'own never-contacted leads' },
  { feature: 'Hook audit ("AI visibility check")', admin: 'yes', sales: 'own leads only' },
  { feature: 'Full website crawl (lead workspace)', admin: 'any lead or any URL', sales: "own leads only, the lead's own website" },
  { feature: 'Services, service areas, address, website on a prospect', admin: 'all leads', sales: 'own leads' },
  { feature: 'Share the prospect report (copy, mark sent, see opened)', admin: 'all leads', sales: 'own leads' },
  { feature: 'Full measurement / Discovery / Baseline / Remeasure', admin: 'yes', sales: 'no' },
  { feature: 'Sales dashboard (campaigns, templates, calls, sign-up links, won)', admin: 'anyone or everyone', sales: 'own leads only, no money figures' },
  { feature: 'Coverage', admin: 'yes', sales: 'yes (counts)' },
  { feature: 'Find Leads', admin: 'yes', sales: 'yes' },
  { feature: 'Add a new business', admin: 'yes', sales: 'yes (never a duplicate)' },
  { feature: 'Claim an unassigned, never-contacted lead (Available to claim)', admin: 'assigns instead', sales: 'yes' },
  { feature: 'Claim / add a contacted or owned lead', admin: 'reassigns', sales: 'no' },
  { feature: 'Assign / reassign / unassign', admin: 'yes', sales: 'no' },
  { feature: 'Internal notes, follow-ups, call outcomes, website control, archive', admin: 'all leads', sales: 'own leads' },
  { feature: 'Stages', admin: 'all', sales: 'interested, price given, not interested, won (awaiting admin)' },
  { feature: 'Review replies', admin: 'yes', sales: 'no' },
  { feature: 'Paid clients / Delivery / Website build / Welcome packs', admin: 'yes', sales: 'no' },
  { feature: 'Dashboard, revenue, billing, payment and Stripe data', admin: 'yes', sales: 'no' },
  { feature: 'Page generator / Page plan / Mockups / Playbook', admin: 'yes', sales: 'no' },
  { feature: 'Remove, reset, import, enrichment, campaigns, AI Audit page, Templates, queue controls', admin: 'yes', sales: 'no' },
  { feature: 'Team, roles, invites, disable', admin: 'yes', sales: 'no' },
  { feature: 'API usage, system configuration, secrets', admin: 'yes', sales: 'no' },
];
