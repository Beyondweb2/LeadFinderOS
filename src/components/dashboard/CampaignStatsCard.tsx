import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Eye, EyeOff, CheckCircle2, Sparkles, Reply, Pencil, Target, FileText, BadgePoundSterling } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import type { CampaignStats } from '@/hooks/useCampaignStats';
import type { CampaignType } from '@/hooks/useCampaigns';

const METHOD_PILL: { key: keyof CampaignStats['methods']; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'facebook_msg', label: 'Messenger' },
];

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
 * One campaign's monitoring card. Every figure comes from real tracked data.
 * The campaign's TYPE picks WHICH metrics show; the layout structure (counts row →
 * rates row → receipts → methods → templates) is IDENTICAL for every type so cards
 * read consistently side by side.
 *   audit   → Sent · Report opened · Replied · Paid | Reply rate · Conversion
 *   site    → Sent · Site opened · Claimed · Add-on | Reply rate · Conversion · Claimed/Sent
 *   service → Sent · Replied · Paid                 | Reply rate · Conversion
 * Conversion = Paid ÷ Sent for every type. The Unassigned bucket (no campaign row to
 * carry a type) renders the generic service layout.
 */
export function CampaignStatsCard({ stat, onEdit, hidden = false, onToggleHide }: {
  stat: CampaignStats;
  onEdit?: (s: CampaignStats) => void;
  /** True when this card is currently hidden (rendered via "Show hidden"). */
  hidden?: boolean;
  onToggleHide?: (s: CampaignStats) => void;
}) {
  const { campaign, funnel, methods, conversionPct, claimedPerSentPct, replyRatePct, leadCount } = stat;
  const name = campaign?.name ?? 'Unassigned';
  const method = campaign?.method ? CAMPAIGN_METHOD_LABELS[campaign.method] ?? campaign.method : null;
  // Unknown/null type → 'audit' (the column default); the Unassigned bucket → 'service'.
  const rawType = campaign?.campaign_type;
  const type: CampaignType = !campaign ? 'service' : (rawType === 'site' || rawType === 'service') ? rawType : 'audit';
  const methodTotal = METHOD_PILL.reduce((n, m) => n + methods[m.key], 0);
  // Per-template mini-funnels, most-reached first. Driven by the real per-send template
  // (whatsapp_messages.template_name) — every template that sent, incl. audit_reply.
  const templateFunnels = Object.entries(stat.byTemplate).sort((a, b) => b[1].leads - a[1].leads);

  // Type-specific tiles, same positions across cards (Sent always first, money last).
  const counts = type === 'site'
    ? [
        { icon: Send, value: funnel.sent, label: 'Sent', color: 'text-blue-500' },
        { icon: Eye, value: funnel.opened, label: 'Site opened', color: 'text-purple-500' },
        { icon: CheckCircle2, value: funnel.claimed, label: 'Claimed', color: 'text-green-500' },
        { icon: Sparkles, value: funnel.addon, label: 'Add-on', color: 'text-amber-500' },
      ]
    : type === 'audit'
      ? [
          { icon: Send, value: funnel.sent, label: 'Sent', color: 'text-blue-500' },
          { icon: FileText, value: funnel.reportOpened, label: 'Report opened', color: 'text-purple-500' },
          { icon: Reply, value: funnel.replied, label: 'Replied', color: 'text-cyan-500' },
          { icon: BadgePoundSterling, value: funnel.paid, label: 'Paid', color: 'text-green-600' },
        ]
      : [
          { icon: Send, value: funnel.sent, label: 'Sent', color: 'text-blue-500' },
          { icon: Reply, value: funnel.replied, label: 'Replied', color: 'text-cyan-500' },
          { icon: BadgePoundSterling, value: funnel.paid, label: 'Paid', color: 'text-green-600' },
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

        {/* Rates row */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-border/50 pt-2.5">
          <Rate value={replyRatePct} label="Reply rate" hint="Replied ÷ Sent" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-lg sm:text-xl font-bold tabular-nums">{conversionPct}%</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground" title="Paid ÷ Sent (paid = payment received or beyond)">Conversion</p>
          </div>
          {type === 'site' && <Rate value={claimedPerSentPct} label="Claimed/Sent" hint="Claimed ÷ Sent" />}
        </div>

        {/* WhatsApp delivery receipts — the message read-status ratchet (historical
            engagement). DISTINCT from "Report opened": this is the WhatsApp receipt
            (did the message land / get read), not a report view. */}
        <div className="border-t border-border/50 pt-2.5" title="WhatsApp read-status ratchet from whatsapp_delivery_status — the message receipt, not a report view">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Message receipts (WhatsApp)</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] font-medium">
              Delivered: <span className="ml-1 tabular-nums font-bold">{stat.receipts.delivered}</span>
            </Badge>
            <Badge variant="outline" className="text-[11px] font-medium">
              Read: <span className="ml-1 tabular-nums font-bold">{stat.receipts.read}</span>
            </Badge>
          </div>
        </div>

        {/* Contact-method breakdown (real pill values) */}
        <div className="border-t border-border/50 pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Contact method ({leadCount} {leadCount === 1 ? 'lead' : 'leads'})</p>
          {methodTotal === 0 ? (
            <p className="text-xs text-muted-foreground/60">No contact method set yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {METHOD_PILL.filter((m) => methods[m.key] > 0).map((m) => (
                <Badge key={m.key} variant="outline" className="text-[11px] font-medium">
                  {m.label}: <span className="ml-1 tabular-nums font-bold">{methods[m.key]}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Templates used — per-template mini-funnel from the REAL per-send tag
            (whatsapp_messages.template_name). Every template that actually sent gets a row,
            incl. the audit_reply pitch; "Reached" = distinct leads that template reached
            (a lead reached by both opener AND pitch appears in both rows). Freeform (no
            template) sends carry no row. Opened = that template's leads whose report was opened. */}
        <div className="border-t border-border/50 pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Templates used</p>
          {templateFunnels.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No templated sends yet</p>
          ) : (
            <div className="space-y-1.5">
              {templateFunnels.map(([key, f]) => {
                const replyRate = f.leads > 0 ? Math.round((f.replied / f.leads) * 100) : null;
                return (
                  <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-medium text-foreground/90 truncate">{TEMPLATE_LABEL[key] ?? key}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Reached <span className="font-bold text-foreground/90">{f.leads}</span>
                      {' · '}Opened <span className="font-bold text-foreground/90">{f.opened}</span>
                      {' · '}Replied <span className="font-bold text-foreground/90">{f.replied}</span>
                      {' · '}<span className="font-bold text-foreground/90">{replyRate === null ? '—' : `${replyRate}%`}</span> reply
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
