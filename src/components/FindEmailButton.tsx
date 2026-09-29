import { useState } from 'react';
import { Loader2, MailSearch } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { leadRpc } from '@/lib/leadRpc';
import { invokeEdge } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import { isAggregatorUrl } from '@/lib/aggregators';
import { refusalText } from '@/lib/salesCrm';
import { cn } from '@/lib/utils';

/* FIND EMAIL — beside every email option when a lead has none (Paul, 2026-09-29: "a button that when
   pressed will find their email either from crawling or from anywhere else on our system already").
   Both roles, own leads only (the server checks). Two steps, cheapest first, and it says where it
   looked:
     1. lead_find_email — what LeadFinderOS ALREADY holds: this lead's website crawl, its questionnaire,
        the same business entered on another lead row. No network call. Saves the first it finds.
     2. otherwise, when the lead has a real website: the free website scrape (extract-email, the same
        function Outreach's bulk "Find emails" uses), saved through lead_set_email.
   ⛔ It only ever FILLS a blank email, never replaces one (both functions refuse to). After a save the
   one lead-changed notice refreshes Outreach, the Inbox and the popup. */

const SOURCE_WORDS: Record<string, string> = {
  website_crawl: 'their website crawl',
  onboarding: 'their questionnaire',
  same_business: 'another record of the same business',
  website_scrape: 'their website',
};

export function FindEmailButton({ leadId, website, className, label = 'Find email' }: { leadId: string; website?: string | null; className?: string; label?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const found = (email: string, source: string) => {
    toast({ title: `Email found: ${email}`, description: `From ${SOURCE_WORDS[source] ?? source}. Saved on the lead.` });
    notifyLeadChanged(leadId, undefined, { email });
    void qc.invalidateQueries({ queryKey: ['inbox'] });
  };
  const run = async () => {
    setBusy(true);
    try {
      const known = await leadRpc('lead_find_email', { _lead_id: leadId });
      if (!known.ok) { toast({ title: 'Could not look', description: refusalText(known.error), variant: 'destructive' }); return; }
      if (typeof known.email === 'string' && known.email) {
        if (known.saved) found(known.email, String(known.source));
        else { toast({ title: `Already on file: ${known.email}` }); notifyLeadChanged(leadId); }
        return;
      }
      const site = (website ?? '').trim();
      if (!site || isAggregatorUrl(site)) {
        toast({ title: 'No email found', description: 'Nothing in their crawl, questionnaire or any other record of this business — and there is no website of theirs to read.' });
        return;
      }
      const scraped = await invokeEdge<{ success?: boolean; email?: string | null; error?: string }>('extract-email', { websiteUrl: site });
      if (!scraped?.success || !scraped.email) {
        toast({ title: 'No email found', description: 'Nothing stored for this business, and none on the pages of their website we could read.' });
        return;
      }
      const saved = await leadRpc('lead_set_email', { _lead_id: leadId, _email: scraped.email });
      if (!saved.ok) { toast({ title: 'Found but not saved', description: `${scraped.email} — ${refusalText(saved.error)}`, variant: 'destructive' }); return; }
      if (saved.saved) found(scraped.email, 'website_scrape');
      else { toast({ title: 'This lead already has an email' }); notifyLeadChanged(leadId); }
    } catch (e) {
      toast({ title: 'Could not look for an email', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={() => void run()} disabled={busy} data-testid="find-email"
      title="Look for this business's email in our records, then on their website"
      className={cn('inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60', className)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailSearch className="h-3.5 w-3.5" />}{busy ? 'Looking…' : label}
    </button>
  );
}
