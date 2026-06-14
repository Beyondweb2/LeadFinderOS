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

function isJunk(email: string): boolean {
  if (!email || email.length > 100) return true;
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
  const mailtoRe = /mailto:([^"'?\s<>]+)/gi;
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

    console.log('Fetching website for email extraction:', url);

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadFinder/1.0)',
          'Accept': 'text/html',
        },
      });
    } catch (e) {
      clearTimeout(timeout);
      const msg = e instanceof Error && e.name === 'AbortError'
        ? 'Website took too long to respond (8s timeout)'
        : 'Could not reach website';
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Website returned ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read limited HTML (first 1MB)
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No response body' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const maxBytes = 1024 * 1024; // 1MB
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel();

    const decoder = new TextDecoder();
    const html = chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();

    // --- Cost/usage log: one row per successful external fetch (best-effort) ---
    // The fetch is what costs us, so log regardless of whether an email is found.
    try {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      );
      await serviceClient.from('api_usage_log').insert({
        user_id: userId,
        function_name: 'extract-email',
        api_type: 'website_scrape',
        calls_made: 1,
        cache_hit: false,
        estimated_cost_usd: 0,
        trigger_source: 'email_enrichment',
      });
    } catch (e) {
      console.error('extract-email usage logging failed (non-blocking):', e);
    }

    // --- Extract the single best email ---
    const email = extractEmails(html);

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, email: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email }),
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
