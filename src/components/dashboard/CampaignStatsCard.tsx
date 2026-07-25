import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Eye, CheckCircle2, Sparkles, Reply, Pencil, Target, FileText } from 'lucide-react';
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
  // Per-template mini-funnels, most-reached first. Driven by the real per-send template
  // (whatsapp_messages.template_name) — every template that sent, incl. audit_reply.
  const templateFunnels = Object.entries(stat.byTemplate).sort((a, b) => b[1].leads - a[1].leads);

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
        {/* Funnel counts. "Site opened" = barber generated_sites opens (kept for barber
            campaigns); "Report opened" = real audit-report opens (ai_audits.first_opened_at). */}
        <div className="grid grid-cols-3 gap-1.5">
          <Count icon={Send} value={funnel.sent} label="Sent" color="text-blue-500" />
          <Count icon={FileText} value={funnel.reportOpened} label="Report opened" color="text-purple-500" />
          <Count icon={Reply} value={funnel.replied} label="Replied" color="text-cyan-500" />
          <Count icon={Eye} value={funnel.opened} label="Site opened" color="text-amber-500" />
          <Count icon={CheckCircle2} value={funnel.claimed} label="Claimed" color="text-green-500" />
          <Count icon={Sparkles} value={funnel.addon} label="Add-on" color="text-amber-500" />
        </div>

        {/* WhatsApp delivery receipts — the message read-status ratchet (historical
            engagement). DISTINCT from "Report opened" above: this is the WhatsApp receipt
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
