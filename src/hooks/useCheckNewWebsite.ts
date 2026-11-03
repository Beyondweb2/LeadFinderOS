/* The popup's watch on a lead's website: blank → a real site starts the app's existing website check once
   (rule: src/lib/newWebsiteCheck.ts). Also called by the script's own "add the address" box, so the check starts however the
   website got onto the lead; one start per lead and address per browser session, and the server keeps its own one-at-a-time rule. */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { startFullLeadCrawl } from '@/components/LeadCrawlPanel';
import { websiteWasAdded } from '@/lib/newWebsiteCheck';

const STARTED = new Set<string>();

export async function checkNewWebsite(qc: QueryClient, leadId: string, website: string): Promise<void> {
  const key = leadId + '|' + website.trim().toLowerCase();
  if (STARTED.has(key)) return;
  STARTED.add(key);
  try {
    await startFullLeadCrawl(leadId, 'lead_detail');
  } catch {
    /* A refused or failed start is not an error here: the website section says "Checking…" then "Couldn't check the site", and Run again is one tap. */
  } finally {
    void qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });
    void qc.invalidateQueries({ queryKey: ['lead-crawls'] });
  }
}

export function useCheckNewWebsite(leadId: string, website: string | null | undefined): void {
  const qc = useQueryClient();
  const prev = useRef(website);
  useEffect(() => {
    const before = prev.current;
    prev.current = website;
    if (leadId && website && websiteWasAdded(before, website)) void checkNewWebsite(qc, leadId, website);
  }, [leadId, website, qc]);
}
