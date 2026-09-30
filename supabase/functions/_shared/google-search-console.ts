/* ════════════════════════════════════════════════════════════════════════════════════════════
   GOOGLE SEARCH CONSOLE — read-only client (2026-09-22, Phase 1).

   Service account only. There is no OAuth flow, no consent screen, no callback route and no
   refresh token, because there is nothing here that needs one: Search Console grants access to a
   service-account EMAIL added as a user on the property, so the only secret is a signing key that
   never leaves this module.

   ⛔ THE KEY LIVES IN ONE PLACE: the GOOGLE_SERVICE_ACCOUNT_JSON edge secret. It is never written
      to a table, never returned to the browser, never put in an error message and never logged —
      not even truncated. Every throw in this file names the FAILURE, never the value (CLAUDE.md
      §4: name the SHAPE of a bad secret, never its value).

   ⛔ ACCESS TOKENS ARE NOT PERSISTED. They last an hour, this process lives for seconds, and a
      stored token is a credential in a database that nothing needs.

   Scope: https://www.googleapis.com/auth/webmasters.readonly — readonly, and nothing else is
   requested. A readonly credential cannot alter a client's Search Console however wrong our code
   is.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export const SEARCH_CONSOLE_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3/sites";

/** Google's hard cap per Search Analytics request. */
const MAX_ROW_LIMIT = 25000;
/** How many pages of results we will walk before stopping. 5 × 25,000 rows is far past anything a
 *  single local business produces in a day; the cap exists so a surprise cannot loop forever
 *  inside an edge function's wall clock. */
const MAX_PAGES = 5;

export interface ServiceAccount { clientEmail: string; privateKey: string }

/** One Search Analytics row, already flattened out of Google's positional `keys` array. */
export interface SearchAnalyticsRow {
  date: string;
  page: string;
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Parse GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * Accepts the JSON file Google hands you, verbatim. Throws with a description of what is MISSING —
 * never with any part of what was found.
 */
export function parseServiceAccount(raw: string | undefined | null): ServiceAccount {
  if (!raw || !raw.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set on this function");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (paste the whole downloaded key file, including the outer braces)");
  }
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
  if (!clientEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON has no client_email");
  if (!privateKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON has no private_key");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON private_key is not a PKCS#8 PEM block (expected a BEGIN PRIVATE KEY header)");
  }
  return { clientEmail, privateKey };
}

/** base64url without padding — what JWS requires. */
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** PEM (PKCS#8) → the DER bytes Web Crypto imports. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

/**
 * Sign the service-account assertion and exchange it for an access token.
 *
 * Standard two-legged OAuth: we assert "I am this service account, I want this scope", signed with
 * the private key, and Google returns a one-hour bearer token. The assertion is valid for a single
 * hour and is discarded with the token.
 */
export async function getAccessToken(account: ServiceAccount, scope = SEARCH_CONSOLE_READONLY_SCOPE): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.clientEmail,
    scope,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = encodeJson(header) + "." + encodeJson(claims);

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(account.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    // ⛔ The caught error can quote key material. It is swallowed deliberately.
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON private_key could not be imported as an RS256 signing key");
  }

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = signingInput + "." + base64Url(new Uint8Array(signature));

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    // Google's token errors are short and contain no secret — they are the only thing that tells
    // you the clock is wrong or the key was revoked, so they are surfaced verbatim.
    throw new Error("Google token exchange failed (" + res.status + "): " + body.slice(0, 300));
  }
  let token = "";
  try {
    token = String((JSON.parse(body) as { access_token?: unknown }).access_token ?? "");
  } catch {
    throw new Error("Google token response was not JSON");
  }
  if (!token) throw new Error("Google token response contained no access_token");
  return token;
}

/** Google wants the property string percent-encoded into the path, sc-domain: colon and all. */
function propertyPath(property: string): string {
  return SEARCH_ANALYTICS_BASE + "/" + encodeURIComponent(property) + "/searchAnalytics/query";
}

interface QueryOptions {
  property: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  /** 'final' (default) returns only settled rows. We re-sync a rolling window so a day that was not
   *  yet final simply arrives on a later run, corrected by the upsert. */
  dataState?: "final" | "all";
}

/** One Search Analytics call, paged. Returns Google's raw rows. */
async function searchAnalytics(token: string, opts: QueryOptions): Promise<Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>> {
  const rows: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(propertyPath(opts.property), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions,
        rowLimit: MAX_ROW_LIMIT,
        startRow: page * MAX_ROW_LIMIT,
        dataState: opts.dataState ?? "final",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      // 403 here almost always means the service account is not a user on that property; the
      // message says so in Google's own words, which is what the operator needs to act.
      throw new Error("Search Console API " + res.status + " for property " + opts.property + ": " + text.slice(0, 400));
    }
    let batch: Array<{ keys?: string[] }> = [];
    try {
      batch = (JSON.parse(text) as { rows?: Array<{ keys?: string[] }> }).rows ?? [];
    } catch {
      throw new Error("Search Console returned a non-JSON body");
    }
    rows.push(...batch);
    if (batch.length < MAX_ROW_LIMIT) break;
  }
  return rows;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Per-day, per-page performance.
 *
 * Dimensions are ['date','page'] so every stored row carries its own day — the snapshot tables are
 * daily, and a period total is a SUM over days, never a second API call with a wider range.
 */
export async function fetchPageDaily(token: string, property: string, startDate: string, endDate: string): Promise<SearchAnalyticsRow[]> {
  const raw = await searchAnalytics(token, { property, startDate, endDate, dimensions: ["date", "page"] });
  const out: SearchAnalyticsRow[] = [];
  for (const row of raw) {
    const keys = row.keys ?? [];
    const date = typeof keys[0] === "string" ? keys[0] : "";
    const page = typeof keys[1] === "string" ? keys[1] : "";
    if (!date || !page) continue;
    out.push({ date, page, clicks: n(row.clicks), impressions: n(row.impressions), ctr: n(row.ctr), position: n(row.position) });
  }
  return out;
}

/** Per-day, per-page, per-query performance. Same shape, one more dimension. */
export async function fetchQueryDaily(token: string, property: string, startDate: string, endDate: string): Promise<SearchAnalyticsRow[]> {
  const raw = await searchAnalytics(token, { property, startDate, endDate, dimensions: ["date", "page", "query"] });
  const out: SearchAnalyticsRow[] = [];
  for (const row of raw) {
    const keys = row.keys ?? [];
    const date = typeof keys[0] === "string" ? keys[0] : "";
    const page = typeof keys[1] === "string" ? keys[1] : "";
    const query = typeof keys[2] === "string" ? keys[2] : "";
    if (!date || !page || !query) continue;
    out.push({ date, page, query, clicks: n(row.clicks), impressions: n(row.impressions), ctr: n(row.ctr), position: n(row.position) });
  }
  return out;
}

/** The properties this service account can actually read. Used by setup/diagnostics to prove the
 *  access grant landed before anyone blames the sync. */
export async function listProperties(token: string): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const res = await fetch(SEARCH_ANALYTICS_BASE, { headers: { Authorization: "Bearer " + token } });
  const text = await res.text();
  if (!res.ok) throw new Error("Search Console site list " + res.status + ": " + text.slice(0, 300));
  const parsed = JSON.parse(text) as { siteEntry?: Array<{ siteUrl?: unknown; permissionLevel?: unknown }> };
  return (parsed.siteEntry ?? []).map((s) => ({
    siteUrl: String(s.siteUrl ?? ""),
    permissionLevel: String(s.permissionLevel ?? ""),
  })).filter((s) => s.siteUrl);
}
