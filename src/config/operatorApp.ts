/**
 * The OPERATOR APP's production address — the one place it is written (2026-10-01).
 *
 * Every link that sends an operator or a salesperson INTO this app is built from it: the security
 * alert email, the team invite / new-link (set-password) links, SEOHead's canonical, and
 * scripts/verify-live.mjs. Same convention as FINDABLE_SITE_ORIGIN (findableSite.ts).
 *
 * ⛔ ONE COPY, EVERY RUNTIME. This file is imported by the SPA (@/config/operatorApp), by edge
 * functions (relative path, explicit .ts — no imports here, keep it that way) and by Node scripts
 * (Node strips the types). scripts/operator-app-url.test.ts fails if a second copy of the address
 * appears anywhere in active code, or if anything still names a pages.dev host as the app.
 *
 * ⚠️ ONE RUNTIME OVERRIDE. fn admin-users reads the Supabase secret TEAM_APP_URL first and falls
 * back to this. The secret is set to the same value; if the domain ever moves, change THIS, the
 * secret, and Supabase Auth's Site URL + Redirect URLs together.
 *
 * Legacy hosts, NOT the app: https://leadfinderos-next.pages.dev is the Cloudflare project's own
 * address — still serves the same build and stays in Supabase Auth's Redirect URLs during the
 * migration, for old sessions, bookmarks and already-sent invite links. leadfinderos.pages.dev is
 * a stale, disconnected project. Neither is ever used to BUILD a link.
 *
 * No trailing slash — callers add the path.
 */
export const OPERATOR_APP_URL = 'https://app.leadfinderos.com';

/** A link to one screen of the app. `path` starts with '/'. */
export const operatorAppUrl = (path: string): string => `${OPERATOR_APP_URL}${path}`;
