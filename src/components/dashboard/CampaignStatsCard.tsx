import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Eye, EyeOff, Reply, Pencil, FileText, BadgePoundSterling } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import type { CampaignStats } from '@/hooks/useCampaignStats';
import type { CampaignType } from '@/hooks/useCampaigns';

// Pretty template names for the "Templates used" rows. Falls back to the raw
// template key if it isn't in the allowlist (e.g. a renamed/legacy template).
const TEMPLATE_LABEL: Record<string, string> = Object.fromEntries(
  WHATSAPP_TEMPLATES.map((t) => [t.value, t.label]),
);

const TYPE_BADGE: Record<CampaignType, string> = { audit: 'Audit', site: 'Site', service: 'Service' };

function Count({ icon: Icon, value, label, color }: { icon: typeof Send; value: number; label: string; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-lg sm:text-xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Rate({ value, label, hint }: { value: number | null; label: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <span className="text-lg sm:text-xl font-bold tabular-nums">{value === null ? '—' : `${value}%`}</span>
      <p className="text-[10px] sm:text-xs text-muted-foreground" title={hint}>{label}</p>
    </div>
  );
}

/**
 * One campaign's monitoring card. Every figure is derived from whatsapp_messages — see the header of
 * useCampaignStats for what each one replaced and why the old ones were wrong.
 *
 * Same tiles for every campaign type now. The type-specific sets went with the metrics they showed:
 * site-row Claimed/Sent divided sites by leads (mixed units), Report opened could not tell the
 * operator's own opens from a prospect's, and Conversion divided by the inflated "Sent".
 */
export function CampaignStatsCard({ stat, onEdit, hidden = false, onToggleHide }: {
  stat: CampaignStats;
  onEdit?: (s: CampaignStats) => void;
  /** True when this card is currently hidden (rendered via "Show hidden"). */
  hidden?: boolean;
  onToggleHide?: (s: CampaignStats) => void;
}) {
  const { campaign, replyRatePct, pitchReplyRatePct, leadCount } = stat;
  const name = campaign?.name ?? 'Unassigned';
  const method = campaign?.method ? CAMPAIGN_METHOD_LABELS[campaign.method] ?? campaign.method : null;
  // Unknown/null type → 'audit' (the column default); the Unassigned bucket → 'service'.
  const rawType = campaign?.campaign_type;
  const type: CampaignType = !campaign ? 'service' : (rawType === 'site' || rawType === 'service') ? rawType : 'audit';
  // Per-template mini-funnels, most-reached first. Driven by the real per-send template
  // (whatsapp_messages.template_name) — every template that sent, incl. audit_reply.
  const templateFunnels = Object.entries(stat.byTemplate).sort((a, b) => b[1].leads - a[1].leads);

  // One tile set for every type: what we did, who answered, whether the pitch worked, money.
  const counts = [
    { icon: Send, value: stat.reached, label: 'Reached', color: 'text-blue-500' },
    { icon: Reply, value: stat.replied, label: 'Replied', color: 'text-cyan-500' },
    { icon: FileText, value: stat.pitchReplied, label: 'Pitch reply', color: 'text-purple-500' },
    { icon: BadgePoundSterling, value: stat.paid, label: 'Paid', color: 'text-green-600' },
  ];

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-transparent border-border/60">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{name}</CardTitle>
            {campaign?.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{campaign.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="secondary" className="text-[10px]">{TYPE_BADGE[type]}</Badge>
            {method && <Badge variant="secondary" className="text-[10px]">{method}</Badge>}
            {onToggleHide && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onToggleHide(stat)}
                title={hidden ? 'Show this campaign on the dashboard' : 'Hide this campaign from the dashboard (it still exists — reveal via "Show hidden")'}
              >
                {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
            )}
            {campaign && onEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(stat)} title="Edit campaign">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 space-y-3">
        {/* Counts row — type-specific tiles, identical grid across cards */}
        <div className="grid grid-cols-4 gap-1.5">
          {counts.map((c) => <Count key={c.label} icon={c.icon} value={c.value} label={c.label} color={c.color} />)}
        </div>

        {/* Rates row — both over what was actually DONE, never over the old inflated "Sent". */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-border/50 pt-2.5">
          <Rate value={replyRatePct} label="Reply rate" hint="Replied ÷ Reached — a reply is a real inbound message that is not an auto-responder" />
          <Rate value={pitchReplyRatePct} label="Pitch reply" hint="Of the leads pitched, how many wrote back AFTER the pitch was sent" />
          <div className="space-y-0.5">
            <span className="text-lg sm:text-xl font-bold tabular-nums">{stat.pitched}</span>
            <p className="text-[10px] sm:text-xs text-muted-foreground" title="Leads sent the report pitch (audit_reply)">Pitched</p>
          </div>
        </div>

        {/* WhatsApp delivery receipts — the message read-status ratchet (historical
            engagement). DISTINCT from "Report opened": this is the WhatsApp receipt
            (did the message land / get read), not a report view. */}
        <div className="border-t border-border/50 pt-2.5" title="Per-message WhatsApp receipts (whatsapp_messages.status, webhook-written) — distinct leads with a delivered/read message. Not a report view.">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Message receipts (WhatsApp)</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] font-medium">
              Delivered: <span className="ml-1 tabular-nums font-bold">{stat.delivered}</span>
            </Badge>
            <Badge variant="outline" className="text-[11px] font-medium">
              Read: <span className="ml-1 tabular-nums font-bold">{stat.read}</span>
            </Badge>
          </div>
        </div>

        {/* Money row — the end of the funnel, in real numbers rather than a percentage. */}
        <div className="border-t border-border/50 pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sign-up ({leadCount} {leadCount === 1 ? 'lead' : 'leads'})</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] font-medium">Link sent: <span className="ml-1 tabular-nums font-bold">{stat.signupSent}</span></Badge>
            <Badge variant="outline" className="text-[11px] font-medium">Started: <span className="ml-1 tabular-nums font-bold">{stat.started}</span></Badge>
            <Badge variant="outline" className="text-[11px] font-medium">Paid: <span className="ml-1 tabular-nums font-bold">{stat.paid}</span></Badge>
            {stat.moneyIn > 0 && (
              <Badge variant="outline" className="text-[11px] font-medium text-green-600">£{stat.moneyIn.toFixed(2)}</Badge>
            )}
          </div>
        </div>

        {/* Templates used — per-template mini-funnel from the REAL per-send tag
            (whatsapp_messages.template_name). Every template that actually sent gets a row,
            incl. the audit_reply pitch; "Reached" = distinct leads that template reached
            (a lead reached by both opener AND pitch appears in both rows). Freeform (no
            template) sends carry no row. Replied is deliberately absent: it used to mean "this lead
            replied at some point, ever", which made every row claim the same replies. */}
        <div className="border-t border-border/50 pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Templates used</p>
          {templateFunnels.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No templated sends yet</p>
          ) : (
            <div className="space-y-1.5">
              {templateFunnels.map(([key, f]) => {
                return (
                  <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-medium text-foreground/90 truncate">{TEMPLATE_LABEL[key] ?? key}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Reached <span className="font-bold text-foreground/90">{f.leads}</span>
                      {/* This template's OWN read receipt. Only messages sent after per-message
                          status shipped can carry one, so a template whose whole history predates
                          it shows "—" rather than a misleading 0%. */}
                      {' · '}<span className="font-bold text-foreground/90">{f.delivered === 0 ? '—' : `${Math.round((f.read / f.delivered) * 100)}%`}</span> read
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
