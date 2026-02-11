import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service role client for admin data
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Verify admin role
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list_users';

    if (action === 'list_users') {
      // Fetch all auth users (paginated, up to 1000)
      const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers({
        perPage: 1000,
      });

      if (authError) {
        console.error('Failed to list users:', authError);
        return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const authUsers = authData?.users || [];

      // Fetch all user_metrics
      const { data: metricsData } = await serviceClient
        .from('user_metrics')
        .select('*');

      // Fetch all subscriptions
      const { data: subsData } = await serviceClient
        .from('subscriptions')
        .select('user_id, status, current_period_end');

      // Fetch all user_trials for plan_status
      const { data: trialsData } = await serviceClient
        .from('user_trials')
        .select('user_id, plan_status, trial_end_date, searches_used, searches_today');

      // Build lookup maps
      const metricsMap = new Map((metricsData || []).map(m => [m.user_id, m]));
      const subsMap = new Map((subsData || []).map(s => [s.user_id, s]));
      const trialsMap = new Map((trialsData || []).map(t => [t.user_id, t]));

      const users = authUsers.map(u => {
        const metrics = metricsMap.get(u.id);
        const sub = subsMap.get(u.id);
        const trial = trialsMap.get(u.id);

        // Determine effective subscription status
        let subscription_status = 'none';
        if (sub) {
          subscription_status = sub.status;
        } else if (trial) {
          subscription_status = trial.plan_status; // 'trial' or 'expired'
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

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'user_events') {
      const targetUserId = body.user_id;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'user_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: events, error: eventsError } = await serviceClient
        .from('usage_events')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch events' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ events: events || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin users error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
