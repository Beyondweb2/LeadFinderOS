import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const REF_SOURCE_STORAGE_KEY = 'leadfinder_ref_source';
const AFFILIATE_STORAGE_KEY = 'leadfinder_affiliate_code';
const AFFILIATE_EXPIRY_KEY = 'leadfinder_affiliate_expiry';
const AFFILIATE_EXPIRY_DAYS = 30;

/**
 * Unified capture for ?ref= URL parameter.
 * Stores in BOTH ref_source (acquisition) and affiliate_code (affiliate attribution).
 * Records a click via the admin-affiliates edge function.
 */
export function RefSourceCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refSource = params.get('ref');

      if (refSource) {
        // 1. Store as ref_source (acquisition tracking)
        localStorage.setItem(REF_SOURCE_STORAGE_KEY, refSource);

        // 2. Store as affiliate code with 30-day expiry
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + AFFILIATE_EXPIRY_DAYS);
        localStorage.setItem(AFFILIATE_STORAGE_KEY, refSource);
        localStorage.setItem(AFFILIATE_EXPIRY_KEY, expiryDate.toISOString());

        // 3. Record click (fire-and-forget, no auth needed)
        supabase.functions.invoke('admin-affiliates', {
          body: { action: 'record_click', code: refSource },
        }).catch(() => {/* silent */});

        // 4. Clean up URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('ref');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Silently fail - must not block the app
    }
  }, []);

  return null;
}
