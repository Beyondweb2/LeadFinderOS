import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';

interface InstantlyCampaign { id: string; name: string }

interface PushToInstantlyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected lead ids to push (only those WITH an email are actually sent;
   *  the edge function filters + reports skipped). */
  leadIds: string[];
  /** Called after a successful push so the table can refresh + clear selection. */
  onPushed?: () => void;
}

/**
 * Picks an Instantly campaign and pushes the selected leads into it via the
 * instantly-push edge function (which holds the API key). Fetches campaigns on open.
 */
export function PushToInstantlyDialog({ open, onOpenChange, leadIds, onPushed }: PushToInstantlyDialogProps) {
  const { toast } = useToast();
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [pushing, setPushing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-push', {
        body: { mode: 'list_campaigns' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Could not load campaigns');
      const list: InstantlyCampaign[] = Array.isArray(data.campaigns) ? data.campaigns : [];
      setCampaigns(list);
      if (list.length === 1) setCampaignId(list[0].id);
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load campaigns');
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  // Load campaigns each time the dialog opens; reset selection on close.
  useEffect(() => {
    if (open) {
      setCampaignId('');
      loadCampaigns();
    }
  }, [open, loadCampaigns]);

  const handlePush = async () => {
    if (!campaignId || pushing) return;
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-push', {
        body: { mode: 'push', campaign_id: campaignId, lead_ids: leadIds },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Push failed');
      /* ⛔ EVERY REASON IS NAMED, AND A ZERO PUSH IS NEVER REPORTED AS A SUCCESS.
         This summed only skippedAlreadyPushed + skippedNoEmail, so when the two newer reasons
         fired the total read 0, the description was dropped, and a push of five leads produced
         "Pushed 0 leads to Instantly" with no explanation — the same silent-failure shape as the
         buttons that did nothing before. Paul pushed 5, all 5 were skipped for having no completed
         audit, and the UI said nothing about it.
         ⚠️ Reasons are listed from the response rather than recomputed here: instantly-push owns
         the filter, and a second copy of the rules in the dialog would drift from it. */
      const pushed = data.pushed ?? 0;
      const reasons: string[] = [];
      const noAudit = data.skippedNoAudit ?? 0;
      const suppressed = data.skippedSuppressed ?? 0;
      const noEmail = data.skippedNoEmail ?? 0;
      const already = data.skippedAlreadyPushed ?? 0;
      if (noAudit) reasons.push(`${noAudit} skipped — no completed audit (no competitor names, so nothing to personalise)`);
      if (suppressed) reasons.push(`${suppressed} skipped — suppressed (said no on some channel)`);
      if (noEmail) reasons.push(`${noEmail} skipped — no email address`);
      if (already) reasons.push(`${already} skipped — already pushed`);
      const total = leadIds.length;

      toast({
        title: pushed > 0
          ? `Pushed ${pushed} of ${total} lead${total === 1 ? '' : 's'} to Instantly`
          : `Nothing pushed — all ${total} lead${total === 1 ? '' : 's'} skipped`,
        description: reasons.length ? reasons.join(' · ') : undefined,
        /* Nothing pushed is a result the operator must NOTICE, not a quiet dismissal. */
        variant: pushed === 0 ? 'destructive' : undefined,
      });
      /* Keep the dialog OPEN when nothing went, so the toast is not the only trace of a push that
         achieved nothing and the selection is still there to retry after auditing. */
      if (pushed > 0) onOpenChange(false);
      onPushed?.();
    } catch (e) {
      toast({ title: 'Could not push to Instantly', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  const noCampaigns = !loadingCampaigns && !loadError && campaigns.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push to Instantly</DialogTitle>
          <DialogDescription>
            Adds the selected leads (those with an email) to an Instantly campaign, sets them to
            “Email Sent”, and skips any already pushed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loadingCampaigns ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your Instantly campaigns…
            </div>
          ) : loadError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadCampaigns}>Retry</Button>
            </div>
          ) : noCampaigns ? (
            <p className="text-sm text-muted-foreground">
              No Instantly campaigns found — create one in Instantly first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Campaign</label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Pick a campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>Cancel</Button>
          <Button onClick={handlePush} disabled={!campaignId || pushing || noCampaigns}>
            {pushing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Push {leadIds.length} lead{leadIds.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
