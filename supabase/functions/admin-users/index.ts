import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitHeaders } from '../_shared/rate-limiter.ts';

const ALLOWED_ORIGINS = [
  'https://leadfinderapp.lovable.app',
  'https://id-preview--da9919bb-3412-438c-91f0-7b1c8b8e5d96.lovable.app',
  'https://da9919bb-3412-438c-91f0-7b1c8b8e5d96.lovableproject.com',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(extra || {}) },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
      const statusFilterRaw: string | undefined = typeof body.status === 'string' ? body.status : undefined;
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

      const [metricsRes, subsRes, trialsRes] = await Promise.all([
        userIds.length > 0
          ? serviceClient.from('user_metrics').select('user_id, search_count, businesses_added_count, messages_sent_count, replies_count, last_active_at, last_search_at').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? serviceClient.from('subscriptions').select('user_id, status, current_period_end').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? serviceClient.from('user_trials').select('user_id, plan_status').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const metricsData = (metricsRes as any).data || [];
      const subsData = (subsRes as any).data || [];
      const trialsData = (trialsRes as any).data || [];
      console.log('[ADMIN-USERS] Joined data - metrics:', metricsData.length, 'subs:', subsData.length, 'trials:', trialsData.length);

      const metricsMap = new Map(metricsData.map((m: any) => [m.user_id, m]));
      const subsMap = new Map(subsData.map((s: any) => [s.user_id, s]));
      const trialsMap = new Map(trialsData.map((t: any) => [t.user_id, t]));

      let users = authUsers.map(u => {
        const metrics = metricsMap.get(u.id) as any;
        const sub = subsMap.get(u.id) as any;
        const trial = trialsMap.get(u.id) as any;

        let subscription_status = 'none';
        if (sub) {
          subscription_status = sub.status;
        } else if (trial) {
          subscription_status = trial.plan_status;
        }

        return {
          id: u.id,
          email: u.email || 'N/A',
          created_at: u.created_at,
          subscription_status,
          current_period_end: sub?.current_period_end || null,
          search_count: metrics?.search_count ?? 0,
          businesses_added_count: metrics?.businesses_added_count ?? 0,
          messages_sent_count: metrics?.messages_sent_count ?? 0,
          replies_count: metrics?.replies_count ?? 0,
          last_active_at: metrics?.last_active_at || null,
          last_search_at: metrics?.last_search_at || null,
        };
      });

      if (statusFilterRaw && statusFilterRaw !== 'all') {
        users = users.filter(u => {
          if (statusFilterRaw === 'trialing') return u.subscription_status === 'trial' || u.subscription_status === 'trialing';
          if (statusFilterRaw === 'active') return u.subscription_status === 'active';
          if (statusFilterRaw === 'canceled') return u.subscription_status === 'canceled' || u.subscription_status === 'expired';
          return true;
        });
      }

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

      // Prevent self-deletion
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

      // Delete from auth (cascades to related tables via FK)
      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(targetUserId);

      if (deleteError) {
        console.error('[ADMIN-USERS] Delete user error:', deleteError.message);
        return jsonResponse({ error: 'Failed to delete user', details: deleteError.message }, 500, corsHeaders, rlHeaders);
      }

      return jsonResponse({ success: true }, 200, corsHeaders, rlHeaders);
    }

    return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders, rlHeaders);
  } catch (error) {
    console.error('[ADMIN-USERS] Unhandled error:', (error as Error).message);
    return jsonResponse({ error: 'Internal server error' }, 500, getCorsHeaders(req));
  }
});
