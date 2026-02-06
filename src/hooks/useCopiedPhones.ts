import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useCopiedPhones() {
  const [copiedPhoneIds, setCopiedPhoneIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const hasFetched = useRef(false);

  // Fetch all copied phone records for this user
  const fetchCopiedPhones = useCallback(async () => {
    if (!user || hasFetched.current) return;
    
    setIsLoading(true);
    hasFetched.current = true;
    
    const { data, error } = await supabase
      .from('copied_phones')
      .select('lead_id');

    setIsLoading(false);

    if (error) {
      console.error('Error fetching copied phones:', error);
      return;
    }

    const ids = new Set(data?.map((d) => d.lead_id) || []);
    setCopiedPhoneIds(ids);
  }, [user]);

  useEffect(() => {
    if (user && !hasFetched.current) {
      fetchCopiedPhones();
    }
  }, [user, fetchCopiedPhones]);

  // Mark a single lead as copied
  const markAsCopied = useCallback(async (leadId: string) => {
    if (!user) return false;
    
    // Already marked
    if (copiedPhoneIds.has(leadId)) return true;

    const { error } = await supabase
      .from('copied_phones')
      .insert({
        user_id: user.id,
        lead_id: leadId,
      });

    if (error) {
      // Unique constraint violation means it's already there
      if (error.code === '23505') {
        setCopiedPhoneIds((prev) => new Set([...prev, leadId]));
        return true;
      }
      console.error('Error marking phone as copied:', error);
      return false;
    }

    setCopiedPhoneIds((prev) => new Set([...prev, leadId]));
    return true;
  }, [user, copiedPhoneIds]);

  // Mark multiple leads as copied
  const markMultipleAsCopied = useCallback(async (leadIds: string[]) => {
    if (!user || leadIds.length === 0) return;

    // Filter out already copied
    const newIds = leadIds.filter((id) => !copiedPhoneIds.has(id));
    if (newIds.length === 0) return;

    const rows = newIds.map((leadId) => ({
      user_id: user.id,
      lead_id: leadId,
    }));

    // Use upsert to handle duplicates gracefully
    const { error } = await supabase
      .from('copied_phones')
      .upsert(rows, { onConflict: 'user_id,lead_id', ignoreDuplicates: true });

    if (error) {
      console.error('Error marking phones as copied:', error);
      return;
    }

    setCopiedPhoneIds((prev) => new Set([...prev, ...newIds]));
  }, [user, copiedPhoneIds]);

  // Check if a lead's phone has been copied
  const isPhoneCopied = useCallback((leadId: string) => {
    return copiedPhoneIds.has(leadId);
  }, [copiedPhoneIds]);

  return {
    copiedPhoneIds,
    isLoading,
    markAsCopied,
    markMultipleAsCopied,
    isPhoneCopied,
    fetchCopiedPhones,
  };
}
