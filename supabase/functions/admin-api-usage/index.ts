import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Invalid token' }, 401);

    const adminUserId = userData.user.id;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) return json({ error: 'Forbidden' }, 403);

    // Get today and month boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 1. Spend today
    const { data: todayData } = await adminClient
      .from('api_usage_log')
      .select('estimated_cost_usd, api_type, user_id, trigger_source, cache_hit, calls_made, created_at')
      .gte('created_at', todayStart);

    // 2. Spend this month  
    const { data: monthData } = await adminClient
      .from('api_usage_log')
      .select('estimated_cost_usd, api_type, user_id, trigger_source, cache_hit, calls_made, created_at')
      .gte('created_at', monthStart);

    const rows = monthData || [];
    const todayRows = todayData || [];

    // Aggregate spend today
    const spendToday = todayRows.reduce((s, r) => s + (Number(r.estimated_cost_usd) || 0), 0);
    const spendMonth = rows.reduce((s, r) => s + (Number(r.estimated_cost_usd) || 0), 0);

    // Cost by user (month)
    const costByUser: Record<string, number> = {};
    const searchesByUser: Record<string, number> = {};
    for (const r of rows) {
      const uid = r.user_id || 'unknown';
      costByUser[uid] = (costByUser[uid] || 0) + (Number(r.estimated_cost_usd) || 0);
      if (r.api_type === 'text_search') {
        searchesByUser[uid] = (searchesByUser[uid] || 0) + (r.calls_made || 1);
      }
    }

    // Cost by API type (month)
    const costByApiType: Record<string, { cost: number; calls: number }> = {};
    for (const r of rows) {
      const t = r.api_type || 'unknown';
      if (!costByApiType[t]) costByApiType[t] = { cost: 0, calls: 0 };
      costByApiType[t].cost += Number(r.estimated_cost_usd) || 0;
      costByApiType[t].calls += r.calls_made || 1;
    }

    // Place details by trigger_source
    const placeDetailsByTrigger: Record<string, number> = {};
    for (const r of rows) {
      if (r.api_type === 'place_details') {
        const src = r.trigger_source || 'unknown';
        placeDetailsByTrigger[src] = (placeDetailsByTrigger[src] || 0) + (r.calls_made || 1);
      }
    }

    // Cache hit rates
    const cacheStats: Record<string, { hits: number; total: number }> = {};
    for (const r of rows) {
      const t = r.api_type || 'unknown';
      if (!cacheStats[t]) cacheStats[t] = { hits: 0, total: 0 };
      cacheStats[t].total += r.calls_made || 1;
      if (r.cache_hit) cacheStats[t].hits += r.calls_made || 1;
    }

    // Cache table sizes
    const { count: searchCacheCount } = await adminClient.from('search_cache').select('*', { count: 'exact', head: true });
    const { count: phoneCacheCount } = await adminClient.from('phone_cache').select('*', { count: 'exact', head: true });
    const { count: geocodeCacheCount } = await adminClient.from('geocode_cache').select('*', { count: 'exact', head: true });

    // Get user emails for cost-by-user
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    let userEmails: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          userEmails[u.id] = u.email || u.id;
        }
      }
    }

    // Alerts
    const alerts: Array<{ type: string; message: string; severity: 'warning' | 'critical' }> = [];
    
    const DAILY_THRESHOLD = 5; // $5/day
    if (spendToday > DAILY_THRESHOLD) {
      alerts.push({ type: 'spend', message: `Daily spend $${spendToday.toFixed(2)} exceeds $${DAILY_THRESHOLD} threshold`, severity: 'critical' });
    } else if (spendToday > DAILY_THRESHOLD * 0.7) {
      alerts.push({ type: 'spend', message: `Daily spend $${spendToday.toFixed(2)} approaching $${DAILY_THRESHOLD} threshold`, severity: 'warning' });
    }

    // User anomaly: any user > $5 today
    const costByUserToday: Record<string, number> = {};
    for (const r of todayRows) {
      const uid = r.user_id || 'unknown';
      costByUserToday[uid] = (costByUserToday[uid] || 0) + (Number(r.estimated_cost_usd) || 0);
    }
    for (const [uid, cost] of Object.entries(costByUserToday)) {
      if (cost > 3) {
        alerts.push({ type: 'user', message: `User ${userEmails[uid] || uid} spent $${cost.toFixed(2)} today`, severity: 'critical' });
      }
    }

    // Place details spike: >50 calls today
    const pdToday = todayRows.filter(r => r.api_type === 'place_details' && !r.cache_hit).length;
    if (pdToday > 50) {
      alerts.push({ type: 'place_details', message: `${pdToday} Place Details calls today (excluding cache hits)`, severity: 'warning' });
    }

    // Searches by user today
    const searchesToday: Record<string, number> = {};
    for (const r of todayRows) {
      if (r.api_type === 'text_search') {
        const uid = r.user_id || 'unknown';
        searchesToday[uid] = (searchesToday[uid] || 0) + (r.calls_made || 1);
      }
    }

    // Format cost-by-user as sorted array
    const costByUserArr = Object.entries(costByUser)
      .map(([uid, cost]) => ({ 
        userId: uid, 
        email: userEmails[uid] || uid.slice(0, 8), 
        costMonth: cost, 
        costToday: costByUserToday[uid] || 0,
        searches: searchesByUser[uid] || 0,
        searchesToday: searchesToday[uid] || 0,
      }))
      .sort((a, b) => b.costMonth - a.costMonth);

    return json({
      spendToday,
      spendMonth,
      costByApiType,
      costByUser: costByUserArr,
      placeDetailsByTrigger,
      cacheStats,
      cacheSizes: {
        search_cache: searchCacheCount || 0,
        phone_cache: phoneCacheCount || 0,
        geocode_cache: geocodeCacheCount || 0,
      },
      alerts,
    });

  } catch (err) {
    console.error('[ADMIN-API-USAGE] Error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});
