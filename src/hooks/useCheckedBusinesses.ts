import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CheckedBusiness {
  business_name: string;
  google_maps_url: string | null;
}

export function useCheckedBusinesses() {
  const [checkedBusinesses, setCheckedBusinesses] = useState<CheckedBusiness[]>([]);
  const { user } = useAuth();

  const fetchCheckedBusinesses = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('checked_businesses')
      .select('business_name, google_maps_url');

    if (error) {
      console.error('Error fetching checked businesses:', error);
      return;
    }

    setCheckedBusinesses(data as CheckedBusiness[]);
  }, [user]);

  useEffect(() => {
    fetchCheckedBusinesses();
  }, [fetchCheckedBusinesses]);

  const markAsChecked = useCallback(async (businessName: string, googleMapsUrl?: string) => {
    if (!user) return;

    // Check if already marked
    const alreadyChecked = checkedBusinesses.some(
      (b) => b.business_name === businessName || (googleMapsUrl && b.google_maps_url === googleMapsUrl)
    );

    if (alreadyChecked) return;

    const { error } = await supabase
      .from('checked_businesses')
      .insert({
        user_id: user.id,
        business_name: businessName,
        google_maps_url: googleMapsUrl || null,
      });

    if (error) {
      console.error('Error marking business as checked:', error);
      return;
    }

    // Update local state
    setCheckedBusinesses((prev) => [...prev, { 
      business_name: businessName, 
      google_maps_url: googleMapsUrl || null 
    }]);
  }, [user, checkedBusinesses]);

  const isChecked = useCallback((businessName: string, googleMapsUrl?: string): boolean => {
    return checkedBusinesses.some(
      (b) => b.business_name === businessName || (googleMapsUrl && b.google_maps_url === googleMapsUrl)
    );
  }, [checkedBusinesses]);

  return {
    checkedBusinesses,
    markAsChecked,
    isChecked,
  };
}
