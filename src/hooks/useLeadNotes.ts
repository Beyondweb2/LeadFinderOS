import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LeadNote {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
  isMine: boolean;
}

interface BusinessKey {
  placeId: string | null;
  googleMapsUrl: string | null;
  businessName: string;
}

/**
 * Team-visible notes for a single business. Notes are BUSINESS-GLOBAL — keyed by
 * place_id (fallback google_maps_url), not by campaign — so they show on the
 * business in any campaign. Reads the team-readable lead_notes + profiles tables;
 * never touches the private outreach_leads.notes column.
 */
export function useLeadNotes(key: BusinessKey | null, enabled: boolean) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!enabled || (!key?.placeId && !key?.googleMapsUrl)) {
      setNotes([]);
      return;
    }
    setIsLoading(true);

    // Match by place_id and by google_maps_url (a note may have been stored
    // under either key). Two simple .eq queries avoid PostgREST .or() escaping
    // issues with URL values; merge + de-dupe by id.
    const queries: Promise<any>[] = [];
    if (key.placeId) {
      queries.push(
        supabase.from('lead_notes').select('id, user_id, body, created_at').eq('place_id', key.placeId)
      );
    }
    if (key.googleMapsUrl) {
      queries.push(
        supabase.from('lead_notes').select('id, user_id, body, created_at').eq('google_maps_url', key.googleMapsUrl)
      );
    }

    const results = await Promise.all(queries);
    const rowsById = new Map<string, any>();
    for (const r of results) {
      for (const row of r.data || []) rowsById.set(row.id, row);
    }
    const rows = [...rowsById.values()].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (rows.length === 0) {
      setNotes([]);
      setIsLoading(false);
      return;
    }

    const authorIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', authorIds);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    setNotes(
      rows.map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          id: r.id,
          userId: r.user_id,
          body: r.body,
          createdAt: r.created_at,
          authorName: p?.display_name ?? null,
          authorAvatar: p?.avatar_url ?? null,
          isMine: r.user_id === user?.id,
        };
      })
    );
    setIsLoading(false);
  }, [enabled, key?.placeId, key?.googleMapsUrl, user?.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || !user?.id || !key) return false;
      const { error } = await supabase.from('lead_notes').insert({
        user_id: user.id,
        place_id: key.placeId,
        google_maps_url: key.googleMapsUrl,
        business_name: key.businessName,
        body: text,
      });
      if (error) {
        console.error('[notes] add failed:', error.message);
        return false;
      }
      await fetchNotes();
      return true;
    },
    [user?.id, key, fetchNotes]
  );

  return { notes, isLoading, addNote };
}
