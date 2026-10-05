// protectionLimits — the abuse / API-cost thresholds, in ONE place (2026-09-29, docs/abuse-cost-protection.md).
//
// ⛔ THE LIVE VALUES ARE THE DATABASE ROW public.protection_settings (id 1), read by public.guard_action on
// every guarded request. This file is the DEFAULT the migration seeds and the shape the Admin screen and
// security-admin validate against. scripts/abuse-cost-protection.test.ts holds the migration's seed JSON
// byte-for-byte equal to DEFAULT_PROTECTION_LIMITS, so the two cannot drift.
//
// ⛔ NEVER WRITE ONE OF THESE NUMBERS IN PROSE OR A COMMENT ELSEWHERE — name the key. The numbers were set
// on 2026-09-29 from the live api_usage_log (the heaviest real working day, the heaviest real hour), so a
// productive salesperson never meets a hard limit. They are abuse limits, not targets.
//
// Edge-reachable: relative imports with an explicit .ts only (CLAUDE.md §3).

/** Per-action limits. Every window counts the actor's ALLOWED/WARNED guard rows for that action. */
export interface ActionLimit {
  /** Paid = the pause modes and the spend caps apply. Unpaid = suspension + burst limits only. */
  paid: boolean;
  per_min?: number;
  per_10min?: number;
  per_hour?: number;
  per_day?: number;
  /** Over this many in 24 h → WARNING (alert, keeps working). */
  warn_day?: number;
  /** Rows in ONE copy/export. Over it → refused. */
  max_rows?: number;
  /** Rows across 24 h (copy_numbers). */
  rows_per_day?: number;
  /** One copy/export larger than this → WARNING. */
  warn_rows?: number;
  /** false = the action is refused for the sales role outright (export_csv). */
  sales_allowed?: boolean;
}

export interface ProtectionLimits {
  user_hour_warn_usd: number;
  user_hour_hard_usd: number;
  user_day_warn_usd: number;
  user_day_hard_usd: number;
  team_hour_warn_usd: number;
  team_day_warn_usd: number;
  team_day_cap_usd: number;
  denied_alert_10min: number;
  apify_warn_pct: number;
  actions: Record<GuardAction, ActionLimit>;
}

/** Every action the guard knows. An action NOT in the live row is treated as PAID with no allowance
 *  beyond the spend caps (guard_action: unknown ⇒ paid) — absence never means "free". */
export const GUARD_ACTIONS = [
  'lead_search', 'place_details', 'enrich', 'site_scrape', 'hook_audit', 'hook_preview', 'ai_draft',
  'prospect_preview', 'niche_check', 'audit_manual', 'admin_ai', 'claim', 'lead_add', 'lead_lookup',
  'copy_numbers', 'export_csv', 'whatsapp_send', 'whatsapp_queue', 'sales_check', 'lead_import',
] as const;
export type GuardAction = typeof GUARD_ACTIONS[number];

export const DEFAULT_PROTECTION_LIMITS: ProtectionLimits = {
  user_hour_warn_usd: 6,
  user_hour_hard_usd: 15,
  user_day_warn_usd: 15,
  user_day_hard_usd: 35,
  team_hour_warn_usd: 12,
  team_day_warn_usd: 50,
  team_day_cap_usd: 100,
  denied_alert_10min: 10,
  apify_warn_pct: 90,
  actions: {
    lead_search: { paid: true, per_min: 10, per_hour: 60 },
    place_details: { paid: true, per_min: 40, per_hour: 500 },
    enrich: { paid: true, per_hour: 150 },
    site_scrape: { paid: false, per_hour: 300 },
    hook_audit: { paid: true, per_10min: 10, per_day: 80 },
    hook_preview: { paid: true, per_hour: 30 },
    ai_draft: { paid: true, per_hour: 30 },
    prospect_preview: { paid: true, per_hour: 20 },
    niche_check: { paid: true },
    audit_manual: { paid: true },
    admin_ai: { paid: true },
    claim: { paid: false, per_hour: 60, per_day: 200, warn_day: 100 },
    lead_add: { paid: false, per_hour: 200 },
    lead_lookup: { paid: false, per_hour: 120 },
    copy_numbers: { paid: false, per_hour: 10, max_rows: 200, rows_per_day: 1000, warn_rows: 100 },
    export_csv: { paid: false, sales_allowed: false },
    whatsapp_send: { paid: false },
    whatsapp_queue: { paid: false },
    /* "Check before calling" (2026-10-04, fn sales-prospect-check): one guard row per FRESH paid check a
       salesperson's batch starts (reused results are free and never counted). per_day IS the rep's daily
       allowance — src/lib/salesCheck.ts reads it from the live row and falls back to this value.
       Launch value (Paul, 2026-10-05): one full batch of SALES_CHECK_BATCH_MAX plus a second, partial
       one. Planned with the Apify monthly cap confirmed / raised to about $150 (fixes-07 §6); change it on
       the Security panel once real usage is seen. */
    sales_check: { paid: true, per_day: 30 },
    /* CSV import (2026-10-05, fn-less: public.import_leads, migration 20261010170000). One guard row per call — the
       check AND the import each count — with the call's row count as its units. Unpaid (no provider is called), so
       the prospecting pause never blocks it. max_rows equals import_leads' own per-call ceiling. */
    lead_import: { paid: false, per_hour: 30, max_rows: 500, rows_per_day: 3000 },
  },
};

/** The live limits row with any action it does not know yet filled from the defaults (an action added
 *  by a later release, before its SQL has run). The Security panel reads and saves through this, so a
 *  save never fails validation on an action the row has not caught up with, and no existing value is
 *  ever replaced. */
export function withDefaultActions(limits: ProtectionLimits): ProtectionLimits {
  const actions = { ...DEFAULT_PROTECTION_LIMITS.actions, ...(limits?.actions ?? {}) } as ProtectionLimits['actions'];
  return { ...limits, actions };
}

/** The three global states. One control on the Admin screen, never three switches.
 *  running            — everything normal.
 *  prospecting_paused — every paid action a PERSON starts (both roles) and the drip's pre-send hook
 *                       audits pause; client measurement (baselines, re-measures, discovery, approved
 *                       measurement work) keeps running.
 *  all_stop           — the emergency stop: every paid action, the audit queue's new starts and SEO
 *                       scans included, until the admin releases it. */
export const PROTECTION_MODES = ['running', 'prospecting_paused', 'all_stop'] as const;
export type ProtectionMode = typeof PROTECTION_MODES[number];

export function isProtectionMode(v: unknown): v is ProtectionMode {
  return typeof v === 'string' && (PROTECTION_MODES as readonly string[]).includes(v);
}

/** What a salesperson sees for ANY guard refusal — never a cost, never which provider (Paul, 2026-09-29). */
export const USAGE_PAUSED_DETAIL = 'Usage temporarily paused — contact Paul';

/** The sentence for a refusal. The admin is told which control is holding them; a salesperson never is. */
export function guardRefusalDetail(reason: string | null | undefined, role: string | null | undefined): string {
  if (role !== 'admin') return USAGE_PAUSED_DETAIL;
  if (reason === 'all_stop') return 'The emergency stop is on — every paid action is paused. Release it on the API Usage page.';
  if (reason === 'paused') return 'Paid prospecting actions are paused. Resume them on the API Usage page.';
  return 'This action was refused by the usage guard. See the API Usage page.';
}

const LIMIT_NUMBER_KEYS = [
  'per_min', 'per_10min', 'per_hour', 'per_day', 'warn_day', 'max_rows', 'rows_per_day', 'warn_rows',
] as const;
const TOP_NUMBER_KEYS = [
  'user_hour_warn_usd', 'user_hour_hard_usd', 'user_day_warn_usd', 'user_day_hard_usd',
  'team_hour_warn_usd', 'team_day_warn_usd', 'team_day_cap_usd', 'denied_alert_10min', 'apify_warn_pct',
] as const;

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000;

/** Validate an edited limits object. POSITIVE shape match: every top-level number and every known action
 *  must be present with the right type; an unknown key is refused (a typo must not silently do nothing). */
export function validateLimits(input: unknown): { ok: true; limits: ProtectionLimits } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'not_an_object' };
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== 'actions' && !(TOP_NUMBER_KEYS as readonly string[]).includes(k)) return { ok: false, error: `unknown_key:${k}` };
  }
  for (const k of TOP_NUMBER_KEYS) if (!okNumber(o[k])) return { ok: false, error: `bad_number:${k}` };
  if (Number(o.user_hour_warn_usd) > Number(o.user_hour_hard_usd)) return { ok: false, error: 'hour_warn_above_hard' };
  if (Number(o.user_day_warn_usd) > Number(o.user_day_hard_usd)) return { ok: false, error: 'day_warn_above_hard' };
  if (Number(o.team_day_warn_usd) > Number(o.team_day_cap_usd)) return { ok: false, error: 'team_warn_above_cap' };
  const acts = o.actions;
  if (!acts || typeof acts !== 'object' || Array.isArray(acts)) return { ok: false, error: 'bad_actions' };
  const a = acts as Record<string, unknown>;
  for (const k of Object.keys(a)) if (!(GUARD_ACTIONS as readonly string[]).includes(k)) return { ok: false, error: `unknown_action:${k}` };
  for (const name of GUARD_ACTIONS) {
    const v = a[name];
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: `missing_action:${name}` };
    const e = v as Record<string, unknown>;
    if (typeof e.paid !== 'boolean') return { ok: false, error: `bad_paid:${name}` };
    for (const k of Object.keys(e)) {
      if (k === 'paid' || k === 'sales_allowed') continue;
      if (!(LIMIT_NUMBER_KEYS as readonly string[]).includes(k)) return { ok: false, error: `unknown_limit:${name}.${k}` };
      if (!okNumber(e[k])) return { ok: false, error: `bad_number:${name}.${k}` };
    }
    if ('sales_allowed' in e && typeof e.sales_allowed !== 'boolean') return { ok: false, error: `bad_sales_allowed:${name}` };
  }
  return { ok: true, limits: input as ProtectionLimits };
}
