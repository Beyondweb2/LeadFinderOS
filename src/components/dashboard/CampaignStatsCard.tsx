import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Eye, CheckCircle2, Sparkles, Reply, Pencil, Target } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import type { CampaignStats } from '@/hooks/useCampaignStats';

const METHOD_PILL: { key: keyof CampaignStats['methods']; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'facebook_msg', label: 'Messenger' },
];

// Pretty template names for the "Automated templates used" pills. Falls back to the
// raw whatsapp_template key if it isn't in the allowlist (e.g. a renamed/legacy template).
const TEMPLATE_LABEL: Record<string, string> = Object.fromEntries(
  WHATSAPP_TEMPLATES.map((t) => [t.value, t.label]),
);

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

/** One campaign's monitoring card. Every figure comes from real tracked data. */
export function CampaignStatsCard({ stat, onEdit }: { stat: CampaignStats; onEdit?: (s: CampaignStats) => void }) {
  const { campaign, funnel, methods, conversionPct, claimedPerSentPct, replyRatePct, leadCount } = stat;
  const name = campaign?.name ?? 'Unassigned';
  const method = campaign?.method ? CAMPAIGN_METHOD_LABELS[campaign.method] ?? campaign.method : null;
  const methodTotal = METHOD_PILL.reduce((n, m) => n + methods[m.key], 0);
  // Templates used, most-used first. Only queue-sent leads populate this (see the hook).
  const templateEntries = Object.entries(stat.templates).sort((a, b) => b[1] - a[1]);

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
            {method && <Badge variant="secondary" className="text-[10px]">{method}</Badge>}
            {campaign && onEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(stat)} title="Edit campaign">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 space-y-3">
        {/* Funnel counts */}
        <div className="grid grid-cols-5 gap-1.5">
          <Count icon={Send} value={funnel.sent} label="Sent" color="text-blue-500" />
          <Count icon={Eye} value={funnel.opened} label="Opened" color="text-purple-500" />
          <Count icon={Reply} value={funnel.replied} label="Replied" color="text-cyan-500" />
          <Count icon={CheckCircle2} value={funnel.claimed} label="Claimed" color="text-green-500" />
          <Count icon={Sparkles} value={funnel.addon} label="Add-on" color="text-amber-500" />
        </div>

        {/* Rates */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-border/50 pt-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-lg sm:text-xl font-bold tabular-nums">{conversionPct === null ? '—' : `${conversionPct}%`}</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground" title="Claimed ÷ Opened — automatic, always accurate">Conversion</p>
          </div>
          <Rate value={replyRatePct} label="Reply rate" hint="Replied ÷ Sent — needs sites marked sent" />
          <Rate value={claimedPerSentPct} label="Claimed/Sent" hint="Claimed ÷ Sent — needs sites marked sent" />
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

        {/* Automated templates used — counts queue-sent leads only (old-method /
            personal leads have no template, so an empty list = no automated sends). */}
        <div className="border-t border-border/50 pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Automated templates used</p>
          {templateEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No automated sends yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {templateEntries.map(([key, count]) => (
                <Badge key={key} variant="outline" className="text-[11px] font-medium">
                  {TEMPLATE_LABEL[key] ?? key}: <span className="ml-1 tabular-nums font-bold">{count}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
