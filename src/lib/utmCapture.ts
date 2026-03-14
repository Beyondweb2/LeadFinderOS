/**
 * UTM & Meta Ads parameter capture utility.
 * Stores fbclid, utm_source, utm_campaign, utm_adset, utm_ad in localStorage
 * with a 30-day expiry. Derives traffic_source from the captured data.
 */

const UTM_STORAGE_KEY = 'leadfinder_utm_data';
const UTM_EXPIRY_KEY = 'leadfinder_utm_expiry';
const UTM_EXPIRY_DAYS = 30;

const UTM_PARAMS = ['utm_source', 'utm_campaign', 'utm_adset', 'utm_ad', 'fbclid', 'utm_medium', 'utm_content', 'utm_term'] as const;

export interface UtmData {
  utm_source?: string;
  utm_campaign?: string;
  utm_adset?: string;
  utm_ad?: string;
  fbclid?: string;
  traffic_source?: string;
}

/**
 * Capture UTM/fbclid params from the current URL and store in localStorage.
 * Only overwrites if at least one relevant param is present.
 * Cleans captured params from the URL without reload.
 */
export function captureUtmParams(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    let hasAny = false;

    for (const key of UTM_PARAMS) {
      const val = params.get(key);
      if (val) {
        captured[key] = val;
        hasAny = true;
      }
    }

    if (!hasAny) return;

    // Map standard UTM params to our storage keys (fallback if direct keys not set)
    // utm_content → utm_ad, utm_term → utm_adset
    if (!captured.utm_ad && captured.utm_content) {
      captured.utm_ad = captured.utm_content;
    }
    if (!captured.utm_adset && captured.utm_term) {
      captured.utm_adset = captured.utm_term;
    }

    // Derive traffic_source
    if (captured.fbclid || captured.utm_source === 'meta' || captured.utm_source === 'facebook' || captured.utm_source === 'instagram') {
      captured.traffic_source = 'meta_ads';
    } else if (captured.utm_source) {
      captured.traffic_source = `paid_${captured.utm_source}`;
    }

    // Store with 30-day expiry
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + UTM_EXPIRY_DAYS);
    localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(captured));
    localStorage.setItem(UTM_EXPIRY_KEY, expiry.toISOString());

    // Clean URL params without reload
    const url = new URL(window.location.href);
    let cleaned = false;
    for (const key of UTM_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        cleaned = true;
      }
    }
    if (cleaned) {
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // Silent — must not block the app
  }
}

/**
 * Retrieve stored UTM data. Checks the early-capture key (traffic_attribution)
 * first, then falls back to the legacy key (leadfinder_utm_data).
 */
export function getStoredUtmData(): UtmData | null {
  try {
    // 1. Try the early-capture key set by the inline <script> in index.html
    const earlyRaw = localStorage.getItem('traffic_attribution');
    if (earlyRaw) {
      const parsed = JSON.parse(earlyRaw) as UtmData;
      // Only return if it has at least one meaningful value
      if (parsed.utm_source || parsed.fbclid || parsed.traffic_source) {
        return parsed;
      }
    }

    // 2. Fall back to the legacy key
    const raw = localStorage.getItem(UTM_STORAGE_KEY);
    const expiry = localStorage.getItem(UTM_EXPIRY_KEY);
    if (!raw || !expiry) return null;

    if (new Date() > new Date(expiry)) {
      localStorage.removeItem(UTM_STORAGE_KEY);
      localStorage.removeItem(UTM_EXPIRY_KEY);
      return null;
    }

    return JSON.parse(raw) as UtmData;
  } catch {
    return null;
  }
}

/**
 * Get and clear stored UTM data (one-time read for persisting to DB).
 */
export function getAndClearUtmData(): UtmData | null {
  const data = getStoredUtmData();
  if (data) {
    localStorage.removeItem(UTM_STORAGE_KEY);
    localStorage.removeItem(UTM_EXPIRY_KEY);
  }
  return data;
}
