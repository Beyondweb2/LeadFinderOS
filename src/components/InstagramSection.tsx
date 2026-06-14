import { Button } from '@/components/ui/button';
import { Instagram, ExternalLink, Trash2, Loader2, Sparkles, RotateCw, CheckCircle2, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEnrichLead } from '@/hooks/useEnrichLead';
import type { OutreachLead } from '@/types/outreach';

interface InstagramSectionProps {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  compact?: boolean;
}

/**
 * Per-lead Instagram enrichment via the enrich-lead edge function (stubbed
 * Apify). Mirrors EmailSection/FacebookSection. Auto-resolve only — there's no
 * free website path for Instagram, so it always uses the (capped, cached) lookup.
 */
export function InstagramSection({ lead, onUpdate, compact = false }: InstagramSectionProps) {
  const { toast } = useToast();
  const { enrich, enriching, limitReached } = useEnrichLead(lead, onUpdate);
  const isFinding = enriching === 'instagram';

  const hasInstagram = !!lead.instagram_url;
  const status = lead.instagram_status ?? null;

  const handleClear = async () => {
    await onUpdate(lead.id, {
      instagram_url: null,
      instagram_status: null,
      instagram_method: null,
      instagram_last_checked_at: null,
    } as Partial<OutreachLead>);
    toast({ title: 'Instagram removed' });
  };

  // ── Compact (card view) ──
  if (compact) {
    if (!hasInstagram) return null;
    return (
      <a
        href={lead.instagram_url!}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-pink-500 hover:text-pink-400 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="Open Instagram"
      >
        <Instagram className="h-3 w-3" />
        <span className="truncate max-w-[120px]">
          {lead.instagram_url!.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
        </span>
      </a>
    );
  }

  // ── Full (detail dialog) ──
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Instagram className="h-4 w-4 text-pink-500" />
        <h4 className="text-sm font-semibold">Instagram</h4>
      </div>

      {hasInstagram ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> Found
          </span>
          <a
            href={lead.instagram_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pink-500 hover:underline truncate max-w-[280px] flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {lead.instagram_url!.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleClear}>
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {limitReached ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <Ban className="h-3 w-3" /> Daily enrichment limit reached
            </span>
          ) : status === 'none' ? (
            <span className="text-xs text-muted-foreground">No Instagram found.</span>
          ) : status === 'error' ? (
            <span className="text-xs text-destructive">Lookup failed — try again.</span>
          ) : (
            <span className="text-xs text-muted-foreground">Not linked</span>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => enrich('instagram')}
              disabled={isFinding}
              title="Look up an Instagram profile for this business"
            >
              {isFinding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : status === 'error' || status === 'none' ? (
                <RotateCw className="h-3 w-3" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {isFinding ? 'Searching…' : status === 'error' || status === 'none' ? 'Try again' : 'Enrich (auto)'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
