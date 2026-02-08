import { useEffect, useCallback } from 'react';

const AFFILIATE_STORAGE_KEY = 'leadfinder_affiliate_code';
const AFFILIATE_EXPIRY_KEY = 'leadfinder_affiliate_expiry';
const AFFILIATE_EXPIRY_DAYS = 30;

/**
 * Hook to capture and persist affiliate codes from URL parameters.
 * Stores in localStorage with 30-day expiry.
 */
export function useAffiliateTracking() {
  // Check for ref parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    
    if (refCode) {
      // Store the affiliate code with expiry
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + AFFILIATE_EXPIRY_DAYS);
      
      localStorage.setItem(AFFILIATE_STORAGE_KEY, refCode);
      localStorage.setItem(AFFILIATE_EXPIRY_KEY, expiryDate.toISOString());
      
      // Clean up URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  /**
   * Get the stored affiliate code if not expired
   */
  const getAffiliateCode = useCallback((): string | null => {
    const code = localStorage.getItem(AFFILIATE_STORAGE_KEY);
    const expiry = localStorage.getItem(AFFILIATE_EXPIRY_KEY);
    
    if (!code || !expiry) return null;
    
    const expiryDate = new Date(expiry);
    if (new Date() > expiryDate) {
      // Expired, clean up
      localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      localStorage.removeItem(AFFILIATE_EXPIRY_KEY);
      return null;
    }
    
    return code;
  }, []);

  /**
   * Clear the stored affiliate code (e.g., after successful attribution)
   */
  const clearAffiliateCode = useCallback(() => {
    localStorage.removeItem(AFFILIATE_STORAGE_KEY);
    localStorage.removeItem(AFFILIATE_EXPIRY_KEY);
  }, []);

  return {
    getAffiliateCode,
    clearAffiliateCode,
  };
}
