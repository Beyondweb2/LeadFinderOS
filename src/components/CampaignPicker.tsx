import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { campaignDisplayName } from '@/lib/campaignRules';
import { useCampaigns } from '@/hooks/useCampaigns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CampaignEditDialog } from '@/components/campaigns/CampaignEditDialog';

const NEW_CAMPAIGN = '__new__';
const MANAGE_CAMPAIGNS = '__manage__';
const ALL_CAMPAIGNS = '__all__';
const NO_CAMPAIGN = '__none__';

interface CampaignPickerProps {
  /** Selected campaign id. null = "All" (filter mode) or "No campaign" (assign mode). */
  value: string | null;
  onChange: (campaignId: string | null) => void;
  /** filter mode adds an "All campaigns" option; assign mode adds a "No campaign" option. */
  mode: 'filter' | 'assign';
  className?: string;
  /** Hide the inline "New campaign…" / "Manage campaigns…" actions — for places
   *  that only filter and never create (e.g. the Inbox). */
  hideCreate?: boolean;
  /** Fixed trigger text shown INSTEAD of the selected value — for action-style use
   *  (e.g. bulk "Move to campaign (3)") where each pick fires onChange but the
   *  control isn't meant to display a persistent selection. Omit for normal use. */
  triggerLabel?: string;
}

/**
 * Thin campaign dropdown shared by Outreach (filter) and Find Leads (assign).
 * Includes an inline "New campaign…" action that opens the shared create dialog.
 */
export function CampaignPicker({ value, onChange, mode, className, hideCreate = false, triggerLabel }: CampaignPickerProps) {
  const { campaigns, refetch } = useCampaigns();
  const { user } = useAuth();
  const { role } = useSubscription();
  const isAdmin = role === 'admin';
  /* The admin sees whose campaign it is in brackets (display only; the stored name is unchanged). The names come
     from team_members, which only the admin may read in full; a salesperson's list is only their own anyway. */
  const owners = useQuery({
    queryKey: ['team-member-names'], enabled: isAdmin, staleTime: 300_000,
    queryFn: async () => {
      // team_members is not in the generated types; read untyped, as the Team page does.
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => Promise<{ data: { user_id: string; display_name: string | null }[] | null; error: { message: string } | null }> } }).from('team_members').select('user_id, display_name');
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((t: { user_id: string; display_name: string | null }) => [t.user_id, t.display_name]));
    },
  });
  const label = useMemo(() => (c: { name: string; created_by: string }) =>
    campaignDisplayName({ name: c.name, is_mine: c.created_by === user?.id, owner_name: owners.data?.get(c.created_by) ?? null }, isAdmin), [isAdmin, user?.id, owners.data]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const sentinel = mode === 'filter' ? ALL_CAMPAIGNS : NO_CAMPAIGN;
  const selectValue = value ?? sentinel;

  const handleSelect = (v: string) => {
    if (v === NEW_CAMPAIGN) {
      setDialogOpen(true);
      return;
    }
    /* Manage = the Manage campaigns page: both roles, each seeing only what the server returns them. */
    if (v === MANAGE_CAMPAIGNS) {
      navigate('/campaigns');
      return;
    }
    if (v === ALL_CAMPAIGNS || v === NO_CAMPAIGN) {
      onChange(null);
      return;
    }
    onChange(v);
  };

  /* New = the one campaign form (name, niche, Call / WhatsApp, optional area — campaign_new). Both roles. */
  /* The create action has already refreshed the shared list (useCampaignActions awaits it). */
  const handleCreated = (created: { id: string }) => {
    {
      // Auto-select the new campaign. The create action already refreshed the shared list,
      // so defer the selection by a tick: this lets the new <SelectItem> mount and
      // register in Radix's item collection BEFORE it becomes the value. Selecting
      // it in the same commit it's added leaves the trigger blank until the user
      // re-opens and picks it manually (Radix resolves the label from the collection,
      // which only registers after the commit).
      setTimeout(() => onChange(created.id), 0);
    }
  };

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={handleSelect}
        // Refetch on open so the list is always current — a campaign created in
        // another picker/page/tab (useCampaigns has no shared store) shows up
        // immediately, without a page reload.
        onOpenChange={(open) => { if (open) refetch(); }}
      >
        <SelectTrigger className={className ?? 'h-9 w-[200px]'}>
          {triggerLabel ? <span className="truncate">{triggerLabel}</span> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={sentinel}>
            {mode === 'filter' ? 'All campaigns' : 'No campaign'}
          </SelectItem>
          {campaigns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {label(c)}
            </SelectItem>
          ))}
          {!hideCreate && (
            <SelectItem value={NEW_CAMPAIGN}>
              <span className="flex items-center gap-1.5 text-primary">
                <Plus className="h-3.5 w-3.5" />
                New campaign…
              </span>
            </SelectItem>
          )}
          {!hideCreate && campaigns.length > 0 && (
            <SelectItem value={MANAGE_CAMPAIGNS}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Manage campaigns…
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <CampaignEditDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={handleCreated} />
    </>
  );
}
