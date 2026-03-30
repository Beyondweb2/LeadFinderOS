import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Block internal/private IP ranges to prevent SSRF */
function isPrivateHostname(hostname: string): boolean {
  // Block obvious internal hostnames
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'].includes(hostname)) {
    return true;
  }
  // Block link-local and cloud metadata IPs
  if (hostname.startsWith('169.254.') || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return true;
  }
  // Block 172.16.0.0 - 172.31.255.255
  const match172 = hostname.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) {
    return true;
  }
  // Block fd00::/8 (private IPv6)
  if (hostname.startsWith('fd') || hostname.startsWith('fe80')) {
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication check ---
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

    // Block private/internal IPs (SSRF protection)
    if (isPrivateHostname(parsedUrl.hostname)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching website for Facebook extraction:', url);

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

    // Extract all href values containing facebook.com or fb.com
    const hrefRegex = /href\s*=\s*["']([^"']*(?:facebook\.com|fb\.com)[^"']*)["']/gi;
    const matches: string[] = [];
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    // Filter out non-page links
    const excludePatterns = [
      'sharer.php', '/share', '/dialog/', '/plugins/',
      'sharer/', 'login.php', 'connect/', '/ads/',
      'tr?id=', 'pixel',
    ];

    const validLinks = matches.filter(link => {
      const lower = link.toLowerCase();
      return !excludePatterns.some(p => lower.includes(p));
    });

    if (validLinks.length === 0) {
      return new Response(
        JSON.stringify({ success: false, facebookUrl: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Take the first valid link and normalize it
    let fbUrl = validLinks[0];
    try {
      const parsed = new URL(fbUrl.startsWith('http') ? fbUrl : `https://${fbUrl}`);
      // Remove query params
      parsed.search = '';
      parsed.hash = '';
      // Ensure https
      parsed.protocol = 'https:';
      fbUrl = parsed.toString().replace(/\/$/, '');
    } catch {
      fbUrl = validLinks[0];
    }

    return new Response(
      JSON.stringify({ success: true, facebookUrl: fbUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting Facebook:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
