import { useEffect } from 'react';

const REF_SOURCE_STORAGE_KEY = 'leadfinder_ref_source';

/**
 * Captures ref query parameter from URL for acquisition tracking.
 * Stores in localStorage for use during signup.
 * This is separate from affiliate tracking - it's for ads, WhatsApp, etc.
 */
export function RefSourceCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refSource = params.get('ref');
      
      if (refSource) {
        // Store the ref source for later use during signup
        localStorage.setItem(REF_SOURCE_STORAGE_KEY, refSource);
        
        // Clean up URL without reloading (preserves other params)
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
