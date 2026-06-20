// rehost-image — copy a placed pool image into the public barber-site-images bucket.
//
// The manual image board lets an operator drag a pooled photo (Maps/Facebook/
// Instagram) into a site slot. FB/IG CDN URLs are signed + expire, so on SAVE we
// download the chosen image and re-host our own copy here, then store the bucket
// URL on the site's content.
//
// AUTH: the upload runs through a USER-scoped client, so the bucket's existing RLS
// (admins anywhere / owners under their own "<siteId>/" folder) authorises it —
// no separate role check. The path's first folder is the site id to satisfy that
// owner policy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rehostToBucket } from "../_shared/enrichment/rehost.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);

    const body = await req.json().catch(() => ({}));
    const url: string = typeof body.url === "string" ? body.url : "";
    const siteId: string = typeof body.site_id === "string" ? body.site_id : "";
    // Sanitise slot → safe filename segment (hero / about / whyus / gallery).
    const slot: string = (typeof body.slot === "string" ? body.slot : "").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
    if (!url || !siteId || !slot) return json({ error: "url, site_id and slot are required" }, 400);
    if (!/^https?:\/\//i.test(url)) return json({ error: "url must be http(s)" }, 400);

    // User-scoped client → bucket RLS authorises (admin anywhere / owner own site).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // First folder MUST be the site id (owner RLS keys off it).
    const pathPrefix = `${siteId}/${slot}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const publicUrl = await rehostToBucket(url, { client: userClient, pathPrefix });
    if (!publicUrl) return json({ error: "Re-host failed (download or upload)" }, 502);
    return json({ url: publicUrl });
  } catch (e) {
    console.error("[rehost-image] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
