import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// extract-email — Phase 1 email enrichment (website scrape).
//
// Structure mirrors extract-facebook EXACTLY: in-handler Bearer auth
// (verify_jwt = false in config.toml), the same SSRF guard, an 8s fetch timeout,
// a 1MB read cap and the same User-Agent. The only difference is what it pulls
// out of the HTML: emails (mailto: hrefs first, then a raw-text fallback),
// filtered for junk and ranked toward role inboxes (info@/hello@/contact@…).
//
// Input:  { websiteUrl: string }
// Output: { success: true, email } with the single best email, or
//         { success: false } when none is found.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Block internal/private IP ranges to prevent SSRF (identical to extract-facebook). */
function isPrivateHostname(hostname: string): boolean {
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'].includes(hostname)) {
    return true;
  }
  if (hostname.startsWith('169.254.') || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return true;
  }
  const match172 = hostname.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) {
    return true;
  }
  if (hostname.startsWith('fd') || hostname.startsWith('fe80')) {
    return true;
  }
  return false;
}

// ── Email cleaning + junk filtering ──────────────────────────────────────────
function cleanEmail(raw: string): string {
  let e = raw.trim().toLowerCase();
  try { e = decodeURIComponent(e); } catch { /* keep as-is */ }
  e = e.replace(/^mailto:/, '');
  // Cut anything after the address — a /path, ?query, #fragment or whitespace that
  // clings to mailto hrefs (e.g. "info@x.co.uk/msj" → "info@x.co.uk").
  e = e.split(/[/?#\s]/)[0];
  // strip trailing punctuation that often clings to text-extracted emails
  e = e.replace(/[.,;:)>\]}'"]+$/, '');
  return e;
}

// Asset filenames that look like emails (e.g. "logo@2x.png", "icon@sprite.svg")
const JUNK_DOMAIN_EXT = /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?|css|js|json|woff2?|ttf)$/i;
// Placeholder / system / platform noise
const JUNK_PATTERNS: RegExp[] = [
  /example\.(com|org|net)/i,
  /\btest@|@test\./i,
  /sentry|ingest\.sentry|sentry\.io/i,
  /wixpress\.com|\.wix(site)?\./i,
  /squarespace|wordpress|godaddy|weebly/i,
  /schema\.org|\.w3\.org|googleapis|gstatic|cloudflare/i,
  /yourdomain|your-?email|youremail|domain\.com|name@|email@example/i,
  /@2x|@3x/i,
  /sentry-next|wixstatic/i,
];
// no-reply style: real addresses, but never a usable contact
const SYSTEM_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|automated)/i;

// Strict, anchored shape: a clean local@domain.tld ONLY — rejects anything with a
// "/", path, query, spaces, or a missing/short TLD (bad emails bounce).
const STRICT_EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function isJunk(email: string): boolean {
  if (!email || email.length > 100) return true;
  if (!STRICT_EMAIL.test(email)) return true;   // not a clean valid email → reject
  if (email.includes('..')) return true;        // no consecutive dots
  const at = email.indexOf('@');
  if (at < 1) return true;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return true;
  if (local.length < 1 || local.length > 64) return true;
  if (JUNK_DOMAIN_EXT.test(domain)) return true;
  if (SYSTEM_LOCAL.test(local)) return true;
  for (const p of JUNK_PATTERNS) if (p.test(email)) return true;
  return false;
}

// Role inboxes preferred when several valid emails are present.
const PREFERRED = ['info', 'hello', 'contact', 'bookings', 'booking', 'enquiries', 'enquiry', 'reservations', 'appointments', 'hi', 'admin', 'office', 'team', 'sales'];

function pickBest(candidates: string[]): string | null {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const e of candidates) {
    if (!seen.has(e)) { seen.add(e); list.push(e); }
  }
  if (list.length === 0) return null;
  // Prefer a role inbox (mailto-sourced come first, so the earliest preferred wins).
  for (const e of list) {
    const local = e.slice(0, e.indexOf('@'));
    if (PREFERRED.some((p) => local === p || local.startsWith(p))) return e;
  }
  return list[0];
}

function extractEmails(html: string): string | null {
  // 1) mailto: hrefs — most reliable signal of a real contact email.
  const mailto: string[] = [];
  const mailtoRe = /mailto:([^"'?\s<>/]+)/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mailtoRe.exec(html)) !== null) {
    const e = cleanEmail(mm[1]);
    if (!isJunk(e)) mailto.push(e);
  }

  // 2) Raw emails anywhere in the page text — fallback.
  const text: string[] = [];
  const textRe = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  let tm: RegExpExecArray | null;
  while ((tm = textRe.exec(html)) !== null) {
    const e = cleanEmail(tm[0]);
    if (!isJunk(e)) text.push(e);
  }

  return pickBest([...mailto, ...text]);
}

/** Fetch a page's HTML (≤1MB, 8s timeout) with the SSRF guard. Returns null on any
 *  failure (bad URL / private host / non-2xx / timeout) so callers can try the next
 *  candidate page. */
async function fetchHtml(rawUrl: string): Promise<string | null> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (isPrivateHostname(parsed.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadFinder/1.0)', 'Accept': 'text/html' },
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const maxBytes = 1024 * 1024;
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel();
    const decoder = new TextDecoder();
    return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication check (same pattern as extract-facebook) ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub as string;

    const { websiteUrl } = await req.json();

    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'websiteUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize URL
    let url = websiteUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block non-HTTP protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only HTTP/HTTPS URLs are allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block private/internal IPs (SSRF protection) — unchanged guard
    if (isPrivateHostname(parsedUrl.hostname)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Email extraction for:', url);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    const cacheKey = `${domain}:email_find`;

    // Cache: reuse a prior email-find for this domain (30-day) — don't re-crawl.
    try {
      const { data: cached } = await serviceClient
        .from('enrichment_cache')
        .select('result, expires_at')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (cached && (!cached.expires_at || new Date(cached.expires_at as string) > new Date())) {
        const cachedEmail = (cached.result as { email?: string | null })?.email ?? null;
        return new Response(
          JSON.stringify({ success: !!cachedEmail, email: cachedEmail, cached: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      console.error('extract-email cache read failed (non-blocking):', e);
    }

    // Multi-page crawl: homepage + common contact/about paths. Stop at first hit.
    // (Footer emails are already on the homepage.) All free HTTP fetches.
    const origin = parsedUrl.origin;
    const candidates = Array.from(new Set([
      url,
      `${origin}/contact`,
      `${origin}/contact-us`,
      `${origin}/about`,
      `${origin}/about-us`,
    ]));

    let email: string | null = null;
    let pagesFetched = 0;
    for (const candidate of candidates) {
      const html = await fetchHtml(candidate);
      if (html === null) continue; // unreachable page → try the next
      pagesFetched++;
      email = extractEmails(html);
      if (email) break;
    }

    // If NOTHING was reachable this run (cold DNS/TLS, transient block), retry the
    // homepage once — sites often fail the first hit. Bounded: one extra fetch, only
    // when the whole run reached zero pages. (A still-unreachable site stays
    // uncached below, so a later re-run retries it again.)
    if (pagesFetched === 0) {
      const retryHtml = await fetchHtml(url);
      if (retryHtml !== null) {
        pagesFetched++;
        email = extractEmails(retryHtml);
      }
    }

    // Usage log (best-effort) — still $0 (plain HTTP).
    try {
      await serviceClient.from('api_usage_log').insert({
        user_id: userId,
        function_name: 'extract-email',
        api_type: 'website_scrape',
        calls_made: pagesFetched,
        cache_hit: false,
        estimated_cost_usd: 0,
        trigger_source: 'email_enrichment',
      });
    } catch (e) {
      console.error('extract-email usage logging failed (non-blocking):', e);
    }

    // Cache the result by domain — but only if we actually reached a page (don't
    // cache a false "none" for a site that was just temporarily unreachable).
    if (pagesFetched > 0) {
      try {
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await serviceClient.from('enrichment_cache').upsert(
          { cache_key: cacheKey, enrichment_type: 'email_find', result: { email }, expires_at: expires },
          { onConflict: 'cache_key' }
        );
      } catch (e) {
        console.error('extract-email cache write failed (non-blocking):', e);
      }
    }

    return new Response(
      JSON.stringify({ success: !!email, email, reachable: pagesFetched > 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting email:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
