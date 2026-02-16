const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
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

    console.log('Found Facebook URL:', fbUrl);

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
