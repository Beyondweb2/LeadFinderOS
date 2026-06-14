import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, ExternalLink, Trash2, Loader2, Search, CheckCircle2, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

interface EmailSectionProps {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  compact?: boolean;
}

/**
 * Per-lead email enrichment (Phase 1: website scrape).
 *
 * "Find email" calls the extract-email edge function with the lead's stored
 * website and saves the best email it finds. It is enabled ONLY when the lead
 * has a website — for no-website leads there's nothing to scrape yet (the Apify
 * path for those comes in a later phase). Mirrors FacebookSection's shape.
 */
export function EmailSection({ lead, onUpdate, compact = false }: EmailSectionProps) {
  const [isFinding, setIsFinding] = useState(false);
  const { toast } = useToast();

  const hasEmail = !!lead.email;
  const hasWebsite = !!(lead.website && lead.website.trim());
  const status = lead.email_status ?? null;

  const handleFind = async () => {
    if (!hasWebsite || isFinding) return;
    setIsFinding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('extract-email', {
        body: { websiteUrl: lead.website },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) throw error;

      const now = new Date().toISOString();
      if (data?.success && data?.email) {
        await onUpdate(lead.id, {
          email: data.email,
          email_status: 'found',
          email_method: 'website_scrape',
          email_last_checked_at: now,
        } as Partial<OutreachLead>);
        toast({ title: 'Email found', description: data.email });
      } else {
        await onUpdate(lead.id, {
          email_status: 'none',
          email_last_checked_at: now,
        } as Partial<OutreachLead>);
        toast({ title: 'No email found on site' });
      }
    } catch (err) {
      await onUpdate(lead.id, {
        email_status: 'error',
        email_last_checked_at: new Date().toISOString(),
      } as Partial<OutreachLead>);
      toast({
        title: 'Email lookup failed',
        description: 'Something went wrong reaching the site. Try again.',
        variant: 'destructive',
      });
    } finally {
      setIsFinding(false);
    }
  };

  const handleClear = async () => {
    await onUpdate(lead.id, {
      email: null,
      email_status: null,
      email_method: null,
      email_last_checked_at: null,
    } as Partial<OutreachLead>);
    toast({ title: 'Email removed' });
  };

  // ── Compact (card view): just the email link when present ──
  if (compact) {
    if (!hasEmail) return null;
    return (
      <a
        href={`mailto:${lead.email}`}
        className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-blue-500 hover:text-blue-400 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="Email business"
      >
        <Mail className="h-3 w-3" />
        <span className="truncate max-w-[140px]">{lead.email}</span>
      </a>
    );
  }

  // ── Full (detail dialog) ──
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-blue-500" />
        <h4 className="text-sm font-semibold">Email</h4>
      </div>

      {hasEmail ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> {lead.email_method === 'website_scrape' ? 'Found' : 'Saved'}
          </span>
          <a
            href={`mailto:${lead.email}`}
            className="text-sm text-blue-500 hover:underline truncate max-w-[280px] flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {lead.email}
          </a>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleClear}>
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {status === 'none' && (
            <span className="text-xs text-muted-foreground">No email found on site.</span>
          )}
          {status === 'error' && (
            <span className="text-xs text-destructive">Lookup failed — try again.</span>
          )}
          {!status && <span className="text-xs text-muted-foreground">Not linked</span>}

          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleFind}
              disabled={!hasWebsite || isFinding}
              title={hasWebsite ? 'Scan the website for an email' : 'No website — email lookup needs a site (Apify path coming for no-website leads)'}
            >
              {isFinding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : status === 'error' || status === 'none' ? (
                <RotateCw className="h-3 w-3" />
              ) : (
                <Search className="h-3 w-3" />
              )}
              {isFinding ? 'Searching…' : status === 'error' || status === 'none' ? 'Try again' : 'Find email'}
            </Button>
          </div>

          {!hasWebsite && (
            <p className="text-[11px] text-muted-foreground/70">
              No website — email lookup needs a site (Apify path coming for no-website leads).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
