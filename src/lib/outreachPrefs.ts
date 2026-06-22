// Outreach UI preferences — small, safe, per-user persistence.
//
// Matches the app's existing pattern (see usePersistLastRoute): write to BOTH
// localStorage and sessionStorage behind try/catch, keyed by user id, so it
// survives navigation + reload + re-login in the same browser, and silently
// no-ops in environments that block web storage (privacy mode / sandboxed
// artifacts). No DB call.

const CAMPAIGN_PREFIX = 'leadfinder_outreach_campaign';

function campaignKey(userId?: string | null): string {
  return userId ? `${CAMPAIGN_PREFIX}:${userId}` : CAMPAIGN_PREFIX;
}

/** The persisted Outreach campaign filter, or null ("All campaigns"). */
export function readCampaignFilter(userId?: string | null): string | null {
  try {
    const k = campaignKey(userId);
    return localStorage.getItem(k) || sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Persist the selected campaign filter. Pass null to clear (back to "All"). */
export function writeCampaignFilter(userId: string | null | undefined, value: string | null): void {
  try {
    const k = campaignKey(userId);
    if (value) {
      localStorage.setItem(k, value);
      sessionStorage.setItem(k, value);
    } else {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {
    // ignore quota / privacy-mode / blocked-storage issues
  }
}
