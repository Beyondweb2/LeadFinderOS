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

      // Fetch ALL auth accounts (loop) so we can drop BARBERS and paginate the
      // remaining OPERATORS — otherwise barber pages would crowd out operators and
      // the total would be wrong. Cap at 50k as a runaway guard.
      const allAuthUsers: any[] = [];
      for (let p = 1; p <= 50; p++) {
        const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers({ page: p, perPage: 1000 });
        if (authError) {
          console.error('[ADMIN-USERS] listUsers error:', authError.message);
          return jsonResponse({ error: 'Failed to fetch users', details: authError.message }, 500, corsHeaders, rlHeaders);
        }
        const batch = authData?.users || [];
        allAuthUsers.push(...batch);
        if (batch.length < 1000) break;
      }
      console.log('[ADMIN-USERS] Total auth accounts:', allAuthUsers.length);

      // Single source of truth: every lead → DERIVE Added / Messages / Replies from
      // status (service role sees all; barbers simply have no rows). Also the
      // contacted-lead set for the per-site "sent" signal.
      const leadsRes = await serviceClient.from('outreach_leads').select('id, user_id, status');
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

      // Activity timestamps + search count from user_metrics (barbers have none).
      const metricsRes = await serviceClient.from('user_metrics').select('user_id, search_count, last_active_at, last_search_at');
      const metricsMap = new Map(((metricsRes as any).data || []).map((m: any) => [m.user_id, m]));

      // ALL generated_sites, used for TWO things:
      //   (a) the BARBER set — any account that OWNS a site (claim_generated_site set
      //       owner_id = that user) is a barber claimant, never an operator.
      //   (b) the per-OPERATOR site funnel — attributed via lead_id -> the lead's owner.
      const sitesRes = await serviceClient
        .from('generated_sites')
        .select('lead_id, owner_id, first_opened_at, claimed_at, addon_interest_at');
      const barberOwnerIds = new Set<string>();
      const siteAgg = new Map<string, { sent: number; opened: number; claimed: number; upsell: number }>();
      for (const s of ((sitesRes as any).data || [])) {
        if (s.owner_id) barberOwnerIds.add(s.owner_id);
        const ownerId = s.lead_id ? leadOwner.get(s.lead_id) : undefined;
        if (!ownerId) continue;
        const a = siteAgg.get(ownerId) || { sent: 0, opened: 0, claimed: 0, upsell: 0 };
        if (contactedLeadIds.has(s.lead_id)) a.sent++;
        if (s.first_opened_at) a.opened++;
        if (s.claimed_at) a.claimed++;
        if (s.addon_interest_at) a.upsell++;
        siteAgg.set(ownerId, a);
      }

      // ── Keep OPERATORS only. A barber = owns a generated site AND has no CRM
      // footprint (no leads added, no searches). An operator who once test-claimed a
      // site but uses the CRM is kept. ──
      let operators = allAuthUsers.filter(u => {
        if (!barberOwnerIds.has(u.id)) return true; // never owned a site → operator
        const hasFootprint =
          (addedCountMap.get(u.id) || 0) > 0 ||
          (((metricsMap.get(u.id) as any)?.search_count) || 0) > 0;
        return hasFootprint;
      });

      if (emailFilter) {
        operators = operators.filter(u => (u.email || '').toLowerCase().includes(emailFilter));
      }
      if (activeDays && activeDays > 0) {
        const cutoff = Date.now() - activeDays * 24 * 60 * 60 * 1000;
        operators = operators.filter(u => {
          const la = (metricsMap.get(u.id) as any)?.last_active_at;
          return la && new Date(la).getTime() >= cutoff;
        });
      }

      const total = operators.length; // operators only (after filters)
      const start = (page - 1) * perPage;
      const pageUsers = operators.slice(start, start + perPage);

      const users = pageUsers.map(u => {
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

      return jsonResponse({ users, page, per_page: perPage, total }, 200, corsHeaders, rlHeaders);
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
