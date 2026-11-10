import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { readCampaignFilter, subscribeCampaignFilter, writeCampaignFilter } from '@/lib/outreachPrefs';

/** The one selected campaign, shared by Find Leads, Outreach and Inbox. null = none / all campaigns. */
export function useSharedCampaign(): [string | null, (id: string | null) => void] {
  const { user } = useAuth();
  const uid = user?.id;
  const value = useSyncExternalStore(
    subscribeCampaignFilter,
    () => readCampaignFilter(uid),
    () => null,
  );
  const set = useCallback((id: string | null) => writeCampaignFilter(uid, id), [uid]);
  return [value, set];
}
