import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitHeaders } from '../_shared/rate-limiter.ts';
import { recordDenial } from '../_shared/protection.ts';
import { OPERATOR_APP_URL } from '../../../src/config/operatorApp.ts';
import { validateOnboardingPatch, type OnboardingRecord } from '../../../src/lib/salespersonOnboarding.ts';

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
      // A signed-in non-admin calling the Team function directly — counted (2026-09-29).
      await recordDenial(serviceClient, adminUserId, 'admin-users');
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

    // ===================== LIST CLIENTS (claimed-site customers) =====================
    // The INVERSE of list_users' operator filter: a CLIENT owns a generated_sites row
    // (owner_id set by claim_generated_site) AND has NO CRM footprint (no added leads,
    // no searches) — so staff test-claims (barber-owner WITH footprint) are excluded,
    // exactly mirroring the operators rule above.
    if (action === 'list_clients') {
      // All auth accounts (same paginated loop as list_users) → email lookup.
      const allAuthUsers: any[] = [];
      for (let p = 1; p <= 50; p++) {
        const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers({ page: p, perPage: 1000 });
        if (authError) {
          console.error('[ADMIN-USERS] listUsers error (clients):', authError.message);
          return jsonResponse({ error: 'Failed to fetch users', details: authError.message }, 500, corsHeaders, rlHeaders);
        }
        const batch = authData?.users || [];
        allAuthUsers.push(...batch);
        if (batch.length < 1000) break;
      }
      const emailById = new Map<string, string>(allAuthUsers.map((u: any) => [u.id, u.email || 'N/A']));

      // Footprint signals: added leads (owner) + searches. A client has NONE.
      // Also lead_id → business_name so a claimed site shows the real business name.
      const leadsRes = await serviceClient.from('outreach_leads').select('id, user_id, business_name');
      const addedCountMap = new Map<string, number>();
      const businessNameByLead = new Map<string, string>();
      for (const l of ((leadsRes as any).data || [])) {
        addedCountMap.set(l.user_id, (addedCountMap.get(l.user_id) || 0) + 1);
        if (l.business_name) businessNameByLead.set(l.id, l.business_name);
      }
      const metricsRes = await serviceClient.from('user_metrics').select('user_id, search_count');
      const searchCountById = new Map<string, number>(
        ((metricsRes as any).data || []).map((m: any) => [m.user_id, m.search_count || 0]),
      );

      // Sites owned by a claimant. Group by owner, keeping the most-recently-claimed
      // site per owner (a barber normally owns one).
      const sitesRes = await serviceClient
        .from('generated_sites')
        .select('owner_id, lead_id, site_name, share_token, is_paid, claimed_at, addon_interest_at, content');
      const bestByOwner = new Map<string, any>();
      for (const s of ((sitesRes as any).data || [])) {
        const ownerId = s.owner_id as string | null;
        if (!ownerId) continue;
        const prev = bestByOwner.get(ownerId);
        if (!prev || new Date(s.claimed_at ?? 0).getTime() > new Date(prev.claimed_at ?? 0).getTime()) {
          bestByOwner.set(ownerId, s);
        }
      }

      const clients = [];
      for (const [ownerId, s] of bestByOwner) {
        const hasFootprint = (addedCountMap.get(ownerId) || 0) > 0 || (searchCountById.get(ownerId) || 0) > 0;
        if (hasFootprint) continue; // barber-owner who also uses the CRM = staff test-claim, not a client
        const content = (s.content && typeof s.content === 'object') ? s.content as { businessName?: string } : null;
        const businessName =
          (s.lead_id ? businessNameByLead.get(s.lead_id) : undefined) ||
          content?.businessName ||
          s.site_name ||
          '(unknown)';
        clients.push({
          user_id: ownerId,
          email: emailById.get(ownerId) || 'N/A',
          business_name: businessName,
          site_name: s.site_name ?? null,
          share_token: s.share_token ?? null,
          claimed_at: s.claimed_at ?? null,
          is_paid: !!s.is_paid,
          addon_interest_at: s.addon_interest_at ?? null,
        });
      }
      // Newest claims first (undated last).
      clients.sort((a, b) => new Date(b.claimed_at ?? 0).getTime() - new Date(a.claimed_at ?? 0).getTime());

      return jsonResponse({ clients, total: clients.length }, 200, corsHeaders, rlHeaders);
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
      /* ⛔ A TEAM MEMBER IS DISABLED, NEVER DELETED (2026-09-27): deleting would orphan their
         authorship on every note, claim and send. The Team screen's Disable is the route. */
      const { data: member } = await serviceClient.from('team_members').select('user_id').eq('user_id', targetUserId).maybeSingle();
      if (member) return jsonResponse({ error: 'This is a team member. Disable them on the Team page instead.' }, 409, corsHeaders, rlHeaders);

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

      // Filter out admin's own ID, and every team member (disabled, never deleted — see delete_user)
      const { data: members } = await serviceClient.from('team_members').select('user_id').in('user_id', userIds);
      const memberIds = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
      const toDelete = userIds.filter(id => id !== adminUserId && !memberIds.has(id));

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

    /* ═════════════════════ TEAM (multi-user, 2026-09-27) ═════════════════════
       ⛔ THE ROLE LIVES IN user_roles, WRITTEN ONLY HERE (service role, admin caller). Disabling removes
       the 'sales' row — every RLS policy and every edge function refuses on the next request, whatever
       token the browser still holds — AND bans the auth user so the session cannot be refreshed.
       Nothing is deleted: team_members keeps the person, lead_activity keeps their authorship, and
       their leads stay assigned until the admin moves them. Passwords are never seen: the invitee sets
       their own through a one-time link the admin sends them. */
    /* The secret overrides; the fallback is the ONE constant (src/config/operatorApp.ts), never a
       hostname typed here. A blank secret counts as unset. */
    const TEAM_APP_URL = (Deno.env.get('TEAM_APP_URL')?.trim() || OPERATOR_APP_URL).replace(/\/+$/, '');
    const SET_PASSWORD_URL = `${TEAM_APP_URL}/set-password`;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const uuidOk = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

    if (action === 'team_list') {
      const { data: members, error: mErr } = await serviceClient.from('team_members')
        .select('user_id, display_name, status, is_book_owner, invited_at, disabled_at, daily_send_limit, suspended_at')
        .order('invited_at', { ascending: true });
      if (mErr) return jsonResponse({ error: mErr.message }, 500, corsHeaders, rlHeaders);
      /* ⚡ Every member at once (2026-09-27, site-wide speed pass): each member's three reads already
         ran together, but the members ran one after another, so the list grew one round trip per
         person. Same reads, same order (Promise.all keeps it). */
      const out = await Promise.all((members ?? []).map(async (m) => {
        const [{ data: roles }, { data: authUser }, { count: assigned }] = await Promise.all([
          serviceClient.from('user_roles').select('role').eq('user_id', m.user_id),
          serviceClient.auth.admin.getUserById(m.user_id),
          serviceClient.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('assigned_to_user_id', m.user_id),
        ]);
        const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
        const u = authUser?.user;
        return {
          ...m,
          role: roleSet.has('admin') ? 'admin' : roleSet.has('sales') ? 'sales' : null,
          email: u?.email ?? null,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          has_signed_in: !!u?.last_sign_in_at,
          banned: !!u?.banned_until && new Date(u.banned_until).getTime() > Date.now(),
          assigned_leads: assigned ?? 0,
        };
      }));
      return jsonResponse({ ok: true, team: out }, 200, corsHeaders, rlHeaders);
    }

    if (action === 'team_invite') {
      const name = String(body.name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!name || name.length > 60) return jsonResponse({ ok: false, error: 'bad_name' }, 400, corsHeaders, rlHeaders);
      if (!EMAIL_RE.test(email)) return jsonResponse({ ok: false, error: 'bad_email' }, 400, corsHeaders, rlHeaders);
      const { data: link, error: linkErr } = await serviceClient.auth.admin.generateLink({
        type: 'invite', email, options: { redirectTo: SET_PASSWORD_URL, data: { display_name: name } },
      });
      if (linkErr || !link?.user?.id) {
        const msg = String(linkErr?.message ?? 'invite failed');
        const exists = /already|registered|exists/i.test(msg);
        return jsonResponse({ ok: false, error: exists ? 'already_exists' : 'invite_failed', detail: msg }, exists ? 409 : 500, corsHeaders, rlHeaders);
      }
      const uid = link.user.id;
      const { error: rErr } = await serviceClient.from('user_roles').insert({ user_id: uid, role: 'sales' });
      const { error: tErr } = await serviceClient.from('team_members').insert({ user_id: uid, display_name: name, invited_by: adminUserId });
      if (rErr || tErr) {
        /* The auth user exists but has no role, so it can sign in to nothing. Say so plainly. */
        return jsonResponse({ ok: false, error: 'role_write_failed', detail: String(rErr?.message ?? tErr?.message) }, 500, corsHeaders, rlHeaders);
      }
      console.log(JSON.stringify({ level: 'info', admin_user_id: adminUserId, action, invited: uid, timestamp: new Date().toISOString() }));
      return jsonResponse({ ok: true, user_id: uid, link: link.properties?.action_link ?? null }, 200, corsHeaders, rlHeaders);
    }

    if (action === 'team_new_link') {
      if (!uuidOk(body.user_id)) return jsonResponse({ ok: false, error: 'bad_user' }, 400, corsHeaders, rlHeaders);
      const { data: m } = await serviceClient.from('team_members').select('status').eq('user_id', body.user_id).maybeSingle();
      if (!m || m.status !== 'active') return jsonResponse({ ok: false, error: 'not_active' }, 409, corsHeaders, rlHeaders);
      const { data: au } = await serviceClient.auth.admin.getUserById(body.user_id);
      const email = au?.user?.email;
      if (!email) return jsonResponse({ ok: false, error: 'no_email' }, 409, corsHeaders, rlHeaders);
      const { data: link, error: linkErr } = await serviceClient.auth.admin.generateLink({
        type: 'magiclink', email, options: { redirectTo: SET_PASSWORD_URL },
      });
      if (linkErr) return jsonResponse({ ok: false, error: 'link_failed', detail: linkErr.message }, 500, corsHeaders, rlHeaders);
      return jsonResponse({ ok: true, link: link?.properties?.action_link ?? null }, 200, corsHeaders, rlHeaders);
    }

    if (action === 'team_disable' || action === 'team_reactivate') {
      const uid = body.user_id;
      if (!uuidOk(uid)) return jsonResponse({ ok: false, error: 'bad_user' }, 400, corsHeaders, rlHeaders);
      if (uid === adminUserId) return jsonResponse({ ok: false, error: 'cannot_change_self' }, 400, corsHeaders, rlHeaders);
      const { data: m } = await serviceClient.from('team_members').select('user_id, is_book_owner').eq('user_id', uid).maybeSingle();
      if (!m) return jsonResponse({ ok: false, error: 'not_a_member' }, 404, corsHeaders, rlHeaders);
      if (m.is_book_owner) return jsonResponse({ ok: false, error: 'cannot_change_book_owner' }, 400, corsHeaders, rlHeaders);
      const { data: isAdminRow } = await serviceClient.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
      if (isAdminRow) return jsonResponse({ ok: false, error: 'cannot_change_admin' }, 400, corsHeaders, rlHeaders);
      if (action === 'team_disable') {
        /* ⛔ DISABLE = THE ENGAGEMENT ENDS (2026-10-02, src/lib/commission.ts). disabled_at is the end instant:
           monthly payments from then on earn them no new commission; what they earned stays. So the end is
           written FIRST and checked — removing the role without it would leave them neither a salesperson
           nor an ended one, and their earned commission would read as £0 — and a second Disable keeps the
           FIRST end date (a later one would quietly widen what they earn). */
        const { data: cur } = await serviceClient.from('team_members').select('status, disabled_at').eq('user_id', uid).maybeSingle();
        if (!(cur?.status === 'disabled' && cur?.disabled_at)) {
          /* The engagement log first (append-only, the database sets the time): this is what commission
             judges every payment against, so if it cannot be written nothing else changes. */
          const { error: eErr } = await serviceClient.from('team_engagement_events').insert({ user_id: uid, kind: 'ended', actor_user_id: adminUserId });
          if (eErr) return jsonResponse({ ok: false, error: 'write_failed', detail: eErr.message }, 500, corsHeaders, rlHeaders);
          const { error: tErr } = await serviceClient.from('team_members').update({ status: 'disabled', disabled_at: new Date().toISOString(), disabled_by: adminUserId }).eq('user_id', uid);
          if (tErr) return jsonResponse({ ok: false, error: 'write_failed', detail: tErr.message }, 500, corsHeaders, rlHeaders);
        }
        const { error: dErr } = await serviceClient.from('user_roles').delete().eq('user_id', uid).eq('role', 'sales');
        if (dErr) return jsonResponse({ ok: false, error: 'role_remove_failed', detail: dErr.message }, 500, corsHeaders, rlHeaders);
        const { error: bErr } = await serviceClient.auth.admin.updateUserById(uid, { ban_duration: '876000h' });
        console.log(JSON.stringify({ level: 'info', admin_user_id: adminUserId, action, target: uid, ban_error: bErr?.message ?? null, timestamp: new Date().toISOString() }));
        return jsonResponse({ ok: true, banned: !bErr }, 200, corsHeaders, rlHeaders);
      }
      /* ⛔ RE-ENABLE NEVER REACHES BACK (2026-10-02): it APPENDS 'resumed' at now (the database sets the time);
         the 'ended' event stays, so a payment that landed while they were disabled stays non-commissionable
         for good. Written first and checked — a failed write stops here and changes nothing. Only a member who
         is disabled now gets the event (re-enabling an active member is a no-op for the history). */
      const { data: was } = await serviceClient.from('team_members').select('status').eq('user_id', uid).maybeSingle();
      if (was?.status === 'disabled') {
        const { error: rErr } = await serviceClient.from('team_engagement_events').insert({ user_id: uid, kind: 'resumed', actor_user_id: adminUserId });
        if (rErr) return jsonResponse({ ok: false, error: 'write_failed', detail: rErr.message }, 500, corsHeaders, rlHeaders);
      }
      const { error: iErr } = await serviceClient.from('user_roles').upsert({ user_id: uid, role: 'sales' }, { onConflict: 'user_id,role' });
      if (iErr) return jsonResponse({ ok: false, error: 'role_write_failed', detail: iErr.message }, 500, corsHeaders, rlHeaders);
      await serviceClient.from('team_members').update({ status: 'active', disabled_at: null, disabled_by: null }).eq('user_id', uid);
      const { error: ubErr } = await serviceClient.auth.admin.updateUserById(uid, { ban_duration: 'none' });
      console.log(JSON.stringify({ level: 'info', admin_user_id: adminUserId, action, target: uid, unban_error: ubErr?.message ?? null, timestamp: new Date().toISOString() }));
      return jsonResponse({ ok: true }, 200, corsHeaders, rlHeaders);
    }

    /* ⛔ SUSPEND SALES ACCESS (2026-09-29, docs/abuse-cost-protection.md) — the middle state between
       active and disabled. The ROLE ROW STAYS, so the salesperson still signs in and reads their own
       leads, notes, statuses and history; every protected action (paid API, searches, lookups, claims,
       adds, audits, AI drafts, Copy Numbers, WhatsApp sends and queueing) refuses on the server on the
       very next request — public.guard_action reads team_members.suspended_at every time, so a session
       that is already open stops working for them at once. Nothing is deleted or moved: the account,
       the leads, the attribution and the history all stay. Leads they had QUEUED are held by the drip
       (process-whatsapp-queue) and listed on the Admin screen for Paul to decide. */
    if (action === 'team_suspend' || action === 'team_unsuspend') {
      const uid = body.user_id;
      if (!uuidOk(uid)) return jsonResponse({ ok: false, error: 'bad_user' }, 400, corsHeaders, rlHeaders);
      if (uid === adminUserId) return jsonResponse({ ok: false, error: 'cannot_change_self' }, 400, corsHeaders, rlHeaders);
      const { data: m } = await serviceClient.from('team_members').select('user_id, is_book_owner, status').eq('user_id', uid).maybeSingle();
      if (!m) return jsonResponse({ ok: false, error: 'not_a_member' }, 404, corsHeaders, rlHeaders);
      if (m.is_book_owner) return jsonResponse({ ok: false, error: 'cannot_change_book_owner' }, 400, corsHeaders, rlHeaders);
      const { data: isAdminRow } = await serviceClient.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
      if (isAdminRow) return jsonResponse({ ok: false, error: 'cannot_change_admin' }, 400, corsHeaders, rlHeaders);
      const suspend = action === 'team_suspend';
      const { error: sErr } = await serviceClient.from('team_members')
        .update(suspend ? { suspended_at: new Date().toISOString(), suspended_by: adminUserId } : { suspended_at: null, suspended_by: null })
        .eq('user_id', uid);
      if (sErr) return jsonResponse({ ok: false, error: 'write_failed', detail: sErr.message }, 500, corsHeaders, rlHeaders);
      const { count: queued } = await serviceClient.from('outreach_leads').select('id', { count: 'exact', head: true })
        .eq('assigned_to_user_id', uid).eq('status', 'queued');
      const { error: eErr } = await serviceClient.from('security_events').insert({
        actor_user_id: adminUserId, actor_role: 'admin', kind: suspend ? 'suspended_by_admin' : 'reactivated_by_admin',
        severity: 'info', detail: { target_user_id: uid, queued_leads: queued ?? 0 },
      });
      if (eErr) console.error(JSON.stringify({ level: 'error', action, target: uid, event_error: eErr.message }));
      console.log(JSON.stringify({ level: 'info', admin_user_id: adminUserId, action, target: uid, queued_leads: queued ?? 0, timestamp: new Date().toISOString() }));
      return jsonResponse({ ok: true, suspended: suspend, queued_leads: queued ?? 0 }, 200, corsHeaders, rlHeaders);
    }

    /* Move EVERY lead from one member to another (or back to the pool). Same records, nothing sent,
       each move logged with who it came from. For when a salesperson leaves. */
    if (action === 'team_reassign_all') {
      const from = body.from_user_id;
      const to = body.to_user_id ?? null;
      if (!uuidOk(from) || (to !== null && !uuidOk(to))) return jsonResponse({ ok: false, error: 'bad_user' }, 400, corsHeaders, rlHeaders);
      if (to) {
        const [{ data: tm }, { data: tr }] = await Promise.all([
          serviceClient.from('team_members').select('status').eq('user_id', to).maybeSingle(),
          serviceClient.from('user_roles').select('role').eq('user_id', to).in('role', ['admin', 'sales']),
        ]);
        if (!tm || tm.status !== 'active' || !(tr ?? []).length) return jsonResponse({ ok: false, error: 'not_an_active_member' }, 409, corsHeaders, rlHeaders);
      }
      const { data: moved, error: mvErr } = await serviceClient.from('outreach_leads')
        .update({ assigned_to_user_id: to, assigned_at: to ? new Date().toISOString() : null })
        .eq('assigned_to_user_id', from).select('id');
      if (mvErr) return jsonResponse({ ok: false, error: 'reassign_failed', detail: mvErr.message }, 500, corsHeaders, rlHeaders);
      const rows = (moved ?? []).map((r: { id: string }) => ({
        lead_id: r.id, actor_user_id: adminUserId, kind: to ? 'lead_assigned' : 'lead_unassigned', data: { from, to, bulk: true },
      }));
      for (let i = 0; i < rows.length; i += 500) await serviceClient.from('lead_activity').insert(rows.slice(i, i + 500));
      return jsonResponse({ ok: true, moved: rows.length }, 200, corsHeaders, rlHeaders);
    }

    /* ═════════════════════ SALESPERSON ONBOARDING (2026-10-05, docs/salesperson-onboarding.md) ═════════════════════
       ⛔ ADMIN ONLY BY CONSTRUCTION: public.salesperson_onboarding has RLS on and NO policy, so these two
       actions (behind the admin check above) are the only way in. Every save is validated by the ONE rule
       file (src/lib/salespersonOnboarding.ts): unknown fields refused, versions must be known documents,
       text that looks like a bank, passport or birth-date detail refused. READY TO SELL is never stored —
       the Team page derives it from this record and the live login. Commission does not read any of it. */
    if (action === 'team_onboarding_list') {
      const { data, error } = await serviceClient.from('salesperson_onboarding').select('*');
      if (error) return jsonResponse({ ok: false, error: 'read_failed', detail: error.message }, 500, corsHeaders, rlHeaders);
      return jsonResponse({ ok: true, rows: data ?? [] }, 200, corsHeaders, rlHeaders);
    }

    if (action === 'team_onboarding_save') {
      const uid = body.user_id;
      if (!uuidOk(uid)) return jsonResponse({ ok: false, error: 'bad_user' }, 400, corsHeaders, rlHeaders);
      const { data: m } = await serviceClient.from('team_members').select('user_id, is_book_owner').eq('user_id', uid).maybeSingle();
      if (!m) return jsonResponse({ ok: false, error: 'not_a_member' }, 404, corsHeaders, rlHeaders);
      const { data: isAdminRow } = await serviceClient.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
      if (m.is_book_owner || isAdminRow) return jsonResponse({ ok: false, error: 'not_a_salesperson' }, 400, corsHeaders, rlHeaders);
      const { data: current, error: cErr } = await serviceClient.from('salesperson_onboarding').select('*').eq('user_id', uid).maybeSingle();
      if (cErr) return jsonResponse({ ok: false, error: 'read_failed', detail: cErr.message }, 500, corsHeaders, rlHeaders);
      const v = validateOnboardingPatch(body.patch, (current as OnboardingRecord | null) ?? null);
      if (!v.ok) return jsonResponse({ ok: false, error: v.error, field: v.field ?? null }, 400, corsHeaders, rlHeaders);
      const { data: saved, error: sErr } = await serviceClient.from('salesperson_onboarding')
        .upsert({ ...v.clean, user_id: uid, updated_by: adminUserId }, { onConflict: 'user_id' })
        .select('*').single();
      if (sErr) return jsonResponse({ ok: false, error: 'write_failed', detail: sErr.message }, 500, corsHeaders, rlHeaders);
      console.log(JSON.stringify({ level: 'info', admin_user_id: adminUserId, action, target: uid, fields: Object.keys(v.clean), timestamp: new Date().toISOString() }));
      return jsonResponse({ ok: true, row: saved }, 200, corsHeaders, rlHeaders);
    }

    return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders, rlHeaders);
  } catch (error) {
    console.error('[ADMIN-USERS] Unhandled error:', (error as Error).message);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
