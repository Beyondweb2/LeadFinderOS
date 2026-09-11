/* ════════════════════════════════════════════════════════════════════════════════════════════════
   The picker's data layer. React Query throughout — the pattern the twelve hooks moved to on
   2026-09-10, and for the reason CLAUDE.md §6c gives: a hook that owns rows in useState refetches
   on every arrival, and Paul runs through these one business after another.

   ⚠️ EVERY MUTATION INVALIDATES EXPLICITLY. §6c's rule: "losing my place annoys me, a stale list
   makes me act on wrong data." Placing an image must not leave the grid showing the old state.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MockupRowLead } from '@/lib/mockupRaw';

export interface MockupListRow {
  id: string;
  lead_id: string;
  business: string;
  niche: string;
  created_at: string;
  /** ⛔ false = nobody has read their site. Different from `services: 0` (we read it, they list
   *  none). The UI must render these differently or the operator retries the wrong thing. */
  scraped: boolean;
  services: number | null;
  areas: number | null;
  pooled: boolean;
  pool_size: number;
  placed: number;
}

export interface PoolImage {
  url: string;
  /** Grid-sized copy. ⛔ The grid must load THIS, never `url` — the originals are 2-7.5MB. */
  thumb?: string;
  source: 'maps' | 'own_site' | 'stock';
  from?: string;
  alt?: string;
  quality?: number;
  fit?: Record<string, number>;
  flags?: string[];
  demoted?: string;
}

export interface PlacedSlot {
  kind: 'photo' | 'stock';
  path: string;
  source?: string;
  source_url?: string;
  stock_id?: string;
  alt?: string;
  caption?: string | null;
  placed_at: string;
}

export interface MockupContent {
  kind?: string;
  niche?: string;
  business?: { name?: string; town?: string | null; phone?: string | null; email?: string | null; address?: string | null; hours?: string | null };
  current_site_url?: string;
  scrape?: { at: string; services: Array<{ name: string; price?: string; description?: string }>; areas: string[]; source_urls?: string[]; cost_usd?: number | null } | null;
  images?: PoolImage[];
  pool?: PoolImage[];
  pool_at?: string;
  slot_names?: string[];
  slots?: Record<string, PlacedSlot>;
  services_confirmed?: Array<{ name: string; price?: string; description?: string }>;
}

export interface Mockup {
  id: string;
  lead_id: string;
  template: string;
  status: string;
  content: MockupContent;
  created_at: string;
  updated_at: string;
}

async function callMockup<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mockup', { body: payload });
  if (error) throw new Error(error.message);
  /* ⛔ A NON-ok BODY IS AN ERROR EVEN ON HTTP 200. The function returns 200 with ok:false for
     recoverable refusals (rehost_failed, stock_not_allowed_in_slot) so the UI can show the reason —
     but the caller must not treat it as success. */
  if (data && typeof data === 'object' && 'ok' in data && (data as { ok: unknown }).ok === false) {
    const d = data as { error?: string; detail?: string };
    throw new Error(d.detail || d.error || 'request failed');
  }
  return data as T;
}

/** The mockups-waiting list. Paul asked for this in the app rather than in SQL. */
export function useMockupList() {
  return useQuery({
    queryKey: ['mockups'],
    queryFn: () => callMockup<{ mockups: MockupListRow[] }>({ action: 'list' }).then((r) => r.mockups ?? []),
    staleTime: 30_000,
  });
}

export function useMockup(id: string | undefined) {
  return useQuery({
    queryKey: ['mockup', id],
    /* `lead` carries the facts the template needs that the mockup row does not store — the
       Google rating, the review count, the address the postcode comes from, and the reviews
       link. Joined at READ time so a rating that changes weekly is never frozen into the row. */
    queryFn: () => callMockup<{
      found: boolean;
      mockup: Mockup | null;
      slot_urls: Record<string, string>;
      lead: MockupRowLead | null;
      /** A signed URL for their CURRENT website's screenshot, or null if none has been taken. */
      current_site_url: string | null;
    }>({ action: 'get', id }),
    enabled: !!id,
  });
}

export function useMockupActions(id: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mockup', id] });
    qc.invalidateQueries({ queryKey: ['mockups'] });
  };

  /** Gather Maps + own-site and score to sort. Costs money, so the button says so. */
  const pool = useMutation({
    mutationFn: (templateHtml: string) =>
      callMockup<{ pool: PoolImage[]; slots: string[]; counts: Record<string, number>; cost_usd: { maps: number | null; vision: number | null }; errors: Record<string, string | null> }>(
        { action: 'pool', id, template_html: templateHtml },
      ),
    onSuccess: invalidate,
  });

  /** Assign one slot. `url` for a pool photo, `stock_id` for stock, `clear: true` to unset. */
  const place = useMutation({
    mutationFn: (args: { slot: string; url?: string; stock_id?: string; clear?: boolean }) =>
      callMockup<{ slot: string; placed?: PlacedSlot; display_url?: string; cleared?: boolean }>({ action: 'place', id, ...args }),
    onSuccess: invalidate,
  });

  const saveServices = useMutation({
    mutationFn: (services: Array<{ name: string; price?: string; description?: string }>) =>
      callMockup<{ services: Array<{ name: string }> }>({ action: 'services', id, services }),
    onSuccess: invalidate,
  });

  /** Photograph their CURRENT website, via Cloudflare Browser Rendering.
   *  ⚠️ `request_ms` is OUR measurement of the request, not a billed figure — Cloudflare's REST
   *  response carries no usage field, and a number copied from a pricing page has been wrong four
   *  times in this project. The authoritative figure is the Cloudflare dashboard. */
  const shoot = useMutation({
    mutationFn: () => callMockup<{ bytes: number; request_ms: number; path: string }>({ action: 'shot', id }),
    onSuccess: invalidate,
  });

  /** Re-read their website. Their site is the least reliable input, so a retry is a first-class action. */
  const refill = useMutation({
    mutationFn: () => callMockup<{ detail: string }>({ action: 'refill', id }),
    onSuccess: invalidate,
  });

  return { pool, place, saveServices, refill, shoot };
}
