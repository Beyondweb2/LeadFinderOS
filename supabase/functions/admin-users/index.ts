import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitHeaders } from '../_shared/rate-limiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number, headers: Record<string, string>, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', ...(extra || {}) },
  });
}

serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Step 1: Read Authorization header ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[ADMIN-USERS] Missing Authorization header');
      return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // --- Step 2: Create user client with ANON key + auth header ---
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // --- Step 3: Verify token using getClaims ---
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('[ADMIN-USERS] Token verification failed:', claimsError?.message || 'no claims');
      // Fallback: try getUser() if getClaims not available
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        console.error('[ADMIN-USERS] getUser fallback also failed:', userError?.message);
        return jsonResponse({ error: 'Invalid token', details: userError?.message || claimsError?.message }, 401, corsHeaders);
      }
      // Use getUser result
      var adminUserId = userData.user.id;
      console.log('[ADMIN-USERS] Auth via getUser fallback, userId:', adminUserId);
    } else {
      var adminUserId = claimsData.claims.sub as string;
      console.log('[ADMIN-USERS] Auth via getClaims, userId:', adminUserId);
    }

    // --- Rate limit (10 req/min per admin) ---
    const rl = checkRateLimit(`admin-users:${adminUserId}`, 10, 60000);
    const rlHeaders = rateLimitHeaders(rl, 10);
    if (!rl.allowed) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders, rlHeaders);
    }

    // --- Step 4: Service role client (ONLY after token verified) ---
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // --- Verify admin role ---
    const { data: roleData, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .eq('role', 'admin')
      .maybeSingle();

    console.log('[ADMIN-USERS] Admin role check:', roleData ? 'PASSED' : 'FAILED', roleError?.message || '');

    if (!roleData) {
      return jsonResponse({ error: 'Not authorized - no admin role' }, 403, corsHeaders, rlHeaders);
    }

    // --- Parse body ---
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list_users';

    console.log(JSON.stringify({
      level: 'info',
      admin_user_id: adminUserId,
      action,
      timestamp: new Date().toISOString(),
    }));

    // ===================== LIST USERS =====================
    if (action === 'list_users') {
      const page = Math.max(1, parseInt(body.page) || 1);
      const perPage = Math.min(200, Math.max(1, parseInt(body.per_page) || 50));
      const emailFilter: string | undefined = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
      const activeDays: number | undefined = typeof body.active_days === 'number' ? body.active_days : undefined;

      const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (authError) {
        console.error('[ADMIN-USERS] listUsers error:', authError.message);
        return jsonResponse({ error: 'Failed to fetch users', details: authError.message }, 500, corsHeaders, rlHeaders);
      }

      let authUsers = authData?.users || [];
      console.log('[ADMIN-USERS] Auth users fetched:', authUsers.length);

      if (emailFilter) {
        authUsers = authUsers.filter(u => (u.email || '').toLowerCase().includes(emailFilter));
      }

      const userIds = authUsers.map(u => u.id);

      // Single source of truth: pull every lead (id, owner, status) once and
      // DERIVE Added / Messages (contacted) / Replies from status — never from a
      // drift-prone user_metrics counter (that was the bug). Also yields the
      // contacted-lead set used for the per-site "sent" signal.
      const leadsRes = userIds.length > 0
        ? await serviceClient.from('outreach_leads').select('id, user_id, status').in('user_id', userIds)
        : { data: [] };
      const leadOwner = new Map<string, string>();          // lead_id -> user_id
      const addedCountMap = new Map<string, number>();       // total leads (Added)
      const contactedCountMap = new Map<string, number>();   // status past New (Messages)
      const repliesCountMap = new Map<string, number>();     // replied/interested/completed
      const contactedLeadIds = new Set<string>();            // for site "sent"
      const REPLIED = new Set(['replied', 'interested', 'completed']);
      for (const l of ((leadsRes as any).data || [])) {
        leadOwner.set(l.id, l.user_id);
        addedCountMap.set(l.user_id, (addedCountMap.get(l.user_id) || 0) + 1);
        if (l.status && l.status !== 'not_contacted') {
          contactedCountMap.set(l.user_id, (contactedCountMap.get(l.user_id) || 0) + 1);
          contactedLeadIds.add(l.id);
        }
        if (REPLIED.has(l.status)) repliesCountMap.set(l.user_id, (repliesCountMap.get(l.user_id) || 0) + 1);
      }

      // Only activity timestamps + search count still come from user_metrics.
      const metricsRes = userIds.length > 0
        ? await serviceClient.from('user_metrics').select('user_id, search_count, last_active_at, last_search_at').in('user_id', userIds)
        : { data: [] };
      const metricsData = (metricsRes as any).data || [];
      const metricsMap = new Map(metricsData.map((m: any) => [m.user_id, m]));

      // Per-user site funnel (generated_sites attributed via lead_id -> owner).
      // "Sent" has no per-site timestamp, so it = sites whose lead was contacted
      // (the link goes out when you contact the lead). Opened/Claimed/Upsell are
      // the real automatic site-event columns.
      const leadIds = [...leadOwner.keys()];
      const sitesRes = leadIds.length > 0
        ? await serviceClient.from('generated_sites').select('lead_id, first_opened_at, claimed_at, addon_interest_at').in('lead_id', leadIds)
        : { data: [] };

      const siteAgg = new Map<string, { sent: number; opened: number; claimed: number; upsell: number }>();
      for (const s of ((sitesRes as any).data || [])) {
        const ownerId = leadOwner.get(s.lead_id);
        if (!ownerId) continue;
        const a = siteAgg.get(ownerId) || { sent: 0, opened: 0, claimed: 0, upsell: 0 };
        if (contactedLeadIds.has(s.lead_id)) a.sent++;
        if (s.first_opened_at) a.opened++;
        if (s.claimed_at) a.claimed++;
        if (s.addon_interest_at) a.upsell++;
        siteAgg.set(ownerId, a);
      }

      let users = authUsers.map(u => {
        const metrics = metricsMap.get(u.id) as any;
        const sites = siteAgg.get(u.id) || { sent: 0, opened: 0, claimed: 0, upsell: 0 };

        return {
          id: u.id,
          email: u.email || 'N/A',
          created_at: u.created_at,
          search_count: metrics?.search_count ?? 0,
          businesses_added_count: addedCountMap.get(u.id) ?? 0,
          messages_sent_count: contactedCountMap.get(u.id) ?? 0,
          replies_count: repliesCountMap.get(u.id) ?? 0,
          sites_sent_count: sites.sent,
          sites_opened_count: sites.opened,
          sites_claimed_count: sites.claimed,
          sites_upsell_count: sites.upsell,
          last_active_at: metrics?.last_active_at || null,
          last_search_at: metrics?.last_search_at || null,
        };
      });

      if (activeDays && activeDays > 0) {
        const cutoff = Date.now() - activeDays * 24 * 60 * 60 * 1000;
        users = users.filter(u => u.last_active_at && new Date(u.last_active_at).getTime() >= cutoff);
      }

      return jsonResponse({
        users,
        page,
        per_page: perPage,
        total: authData?.users?.length ?? 0,
      }, 200, corsHeaders, rlHeaders);
    }

    // ===================== USER EVENTS =====================
    if (action === 'user_events') {
      const targetUserId = body.user_id;
      if (!targetUserId || typeof targetUserId !== 'string') {
        return jsonResponse({ error: 'user_id required' }, 400, corsHeaders, rlHeaders);
      }

      const { data: events, error: eventsError } = await serviceClient
        .from('usage_events')
        .select('id, event_type, meta, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        return jsonResponse({ error: 'Failed to fetch events' }, 500, corsHeaders, rlHeaders);
      }

      return jsonResponse({ events: events || [] }, 200, corsHeaders, rlHeaders);
    }

    // ===================== DELETE USER =====================
    if (action === 'delete_user') {
      const targetUserId = body.user_id;
      if (!targetUserId || typeof targetUserId !== 'string') {
        return jsonResponse({ error: 'user_id required' }, 400, corsHeaders, rlHeaders);
      }

      if (targetUserId === adminUserId) {
        return jsonResponse({ error: 'Cannot delete your own account' }, 400, corsHeaders, rlHeaders);
      }

      console.log(JSON.stringify({
        level: 'warn',
        admin_user_id: adminUserId,
        action: 'delete_user',
        target_user_id: targetUserId,
        timestamp: new Date().toISOString(),
      }));

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(targetUserId);

      if (deleteError) {
        console.error('[ADMIN-USERS] Delete user error:', deleteError.message);
        return jsonResponse({ error: 'Failed to delete user', details: deleteError.message }, 500, corsHeaders, rlHeaders);
      }

      return jsonResponse({ success: true }, 200, corsHeaders, rlHeaders);
    }

    // ===================== BULK DELETE USERS =====================
    if (action === 'bulk_delete_users') {
      const userIds: string[] = body.user_ids;
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return jsonResponse({ error: 'user_ids array required' }, 400, corsHeaders, rlHeaders);
      }

      if (userIds.length > 50) {
        return jsonResponse({ error: 'Maximum 50 users per bulk delete' }, 400, corsHeaders, rlHeaders);
      }

      // Filter out admin's own ID
      const toDelete = userIds.filter(id => id !== adminUserId);

      console.log(JSON.stringify({
        level: 'warn',
        admin_user_id: adminUserId,
        action: 'bulk_delete_users',
        count: toDelete.length,
        timestamp: new Date().toISOString(),
      }));

      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const uid of toDelete) {
        const { error: deleteError } = await serviceClient.auth.admin.deleteUser(uid);
        if (deleteError) {
          console.error(`[ADMIN-USERS] Bulk delete error for ${uid}:`, deleteError.message);
          results.push({ id: uid, success: false, error: deleteError.message });
        } else {
          results.push({ id: uid, success: true });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      return jsonResponse({ success: true, deleted: successCount, failed: failCount, results }, 200, corsHeaders, rlHeaders);
    }

    return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders, rlHeaders);
  } catch (error) {
    console.error('[ADMIN-USERS] Unhandled error:', (error as Error).message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
