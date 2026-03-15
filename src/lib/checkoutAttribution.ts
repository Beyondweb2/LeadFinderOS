/**
 * Builds the attribution payload to include in every create-checkout call.
 * Reuses stored UTM data + affiliate/ref from localStorage.
 */
import { getStoredUtmData } from '@/lib/utmCapture';

export function getCheckoutAttribution(): Record<string, string | undefined> {
  const utmData = getStoredUtmData() || {};
  let affiliateCode: string | undefined;
  let refSource: string | undefined;
  try {
    affiliateCode = localStorage.getItem('leadfinder_affiliate_code') || undefined;
    refSource = localStorage.getItem('leadfinder_ref_source') || undefined;
  } catch {}
  return { ...utmData, affiliate_code: affiliateCode, ref_source: refSource };
}
