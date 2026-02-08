import { useEffect } from 'react';

const AFFILIATE_STORAGE_KEY = 'leadfinder_affiliate_code';
const AFFILIATE_EXPIRY_KEY = 'leadfinder_affiliate_expiry';
const AFFILIATE_EXPIRY_DAYS = 30;

/**
 * Component that captures affiliate codes from URL on mount.
 * Place this on landing pages to capture ?ref= parameters.
 */
export function AffiliateCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    
    if (refCode) {
      // Store the affiliate code with 30-day expiry
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + AFFILIATE_EXPIRY_DAYS);
      
      localStorage.setItem(AFFILIATE_STORAGE_KEY, refCode);
      localStorage.setItem(AFFILIATE_EXPIRY_KEY, expiryDate.toISOString());
      
      // Clean up URL without reloading (preserves other params)
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return null;
}
