// ============= Full file contents =============

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    let adminUserId: string;
    if (claimsError || !claimsData?.claims) {
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
      }
      adminUserId = userData.user.id;
    } else {
      adminUserId = claimsData.claims.sub as string;
    }

    const rl = checkRateLimit(`admin-users:${adminUserId}`, 10, 60000);
    const rlHeaders = rateLimitHeaders(rl, 10);
    if (!rl.allowed) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders, rlHeaders);
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ error: 'Not authorized' }, 403, corsHeaders, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list_users';

    if (action === 'list_users') {
      const page = Math.max(1, parseInt(body.page) || 1);
      const perPage = Math.min(200, Math.max(1, parseInt(body.per_page) || 50));
      const emailFilter: string | undefined = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;

      const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (authError) {
        return jsonResponse({ error: 'Failed to fetch users' }, 500, corsHeaders, rlHeaders);
      }

      let authUsers = authData?.users || [];

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
          ? serviceClient.from('user_trials').select('user_id, free_search_count, searches_used').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const metricsMap = new Map((metricsRes as any).data?.map((m: any) => [m.user_id, m]) || []);
      const subsMap = new Map((subsRes as any).data?.map((s: any) => [s.user_id, s]) || []);
      const trialsMap = new Map((trialsRes as any).data?.map((t: any) => [t.user_id, t]) || []);

      const users = authUsers.map(u => {
        const metrics = metricsMap.get(u.id) as any;
        const sub = subsMap.get(u.id) as any;
        const trial = trialsMap.get(u.id) as any;

        let billing_status = sub ? sub.status : 'no_stripe';
        let access_mode = 'free';
        
        if (sub?.status === 'active' || sub?.status === 'past_due' || sub?.status === 'trialing') {
          access_mode = 'paid';
        }

        return {
          id: u.id,
          email: u.email || 'N/A',
          created_at: u.created_at,
          subscription_status: sub?.status || 'none',
          access_mode,
          billing_status,
          current_period_end: sub?.current_period_end || null,
          paid_at: sub?.status === 'active' ? sub.created_at : null,
          search_count: metrics?.search_count ?? 0,
          free_search_count: trial?.free_search_count ?? 0,
          businesses_added_count: metrics?.businesses_added_count ?? 0,
          messages_sent_count: metrics?.messages_sent_count ?? 0,
          replies_count: metrics?.replies_count ?? 0,
          last_active_at: metrics?.last_active_at || null,
          last_search_at: metrics?.last_search_at || null,
        };
      });

      return jsonResponse({
        users,
        page,
        per_page: perPage,
        total: authData?.users?.length ?? 0,
      }, 200, corsHeaders, rlHeaders);
    }

    if (action === 'delete_user') {
      const targetUserId = body.user_id;
      if (!targetUserId || typeof targetUserId !== 'string') {
        return jsonResponse({ error: 'user_id required' }, 400, corsHeaders, rlHeaders);
      }
      if (targetUserId === adminUserId) {
        return jsonResponse({ error: 'Cannot delete your own account' }, 400, corsHeaders, rlHeaders);
      }
      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(targetUserId);
      if (deleteError) {
        return jsonResponse({ error: 'Failed to delete user' }, 500, corsHeaders, rlHeaders);
      }
      return jsonResponse({ success: true }, 200, corsHeaders, rlHeaders);
    }

    return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders, rlHeaders);
  } catch (error) {
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
