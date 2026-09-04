import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import type { CampaignStats } from '@/hooks/useCampaignStats';
import type { CampaignType } from '@/hooks/useCampaigns';

// Pretty template names for the per-message rows. Falls back to the raw template key if it isn't in
// the allowlist (e.g. a renamed/legacy template).
const TEMPLATE_LABEL: Record<string, string> = Object.fromEntries(
  WHATSAPP_TEMPLATES.map((t) => [t.value, t.label]),
);

const TYPE_BADGE: Record<CampaignType, string> = { audit: 'Audit', site: 'Site', service: 'Service' };

/**
 * A headline figure. Three of these carry the card: what we actually did, who answered, and whether
 * the pitch worked. Everything else is detail underneath them.
 */
function Big({ value, label, sub, tone = 'default', title }: {
  value: string | number;
  label: string;
  sub?: string | null;
  tone?: 'default' | 'good' | 'muted';
  title?: string;
}) {
  const colour = tone === 'good' ? 'text-green-600 dark:text-green-500'
    : tone === 'muted' ? 'text-muted-foreground'
    : 'text-foreground';
  return (
    <div className="min-w-0" title={title}>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${colour}`}>{value}</div>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
      {/* Small print sits under its own number rather than competing as a tile of its own. */}
      {sub && <p className="text-[10px] text-muted-foreground/60 tabular-nums">{sub}</p>}
    </div>
  );
}

/**
 * One campaign's monitoring card.
 *
 * Every figure is derived from whatsapp_messages — see the header of useCampaignStats for what each
 * one replaced and why the old ones were wrong. Three numbers are big because they are the three
 * questions worth asking: did we reach anyone, did they answer, and did the pitch land. Lead count
 * and delivery receipts are small print under Reached, because they qualify it rather than rival it.
 *
 * Same figures for every campaign type. The type-specific sets went with the metrics they showed:
 * site-row Claimed/Sent divided site rows by leads, and Report opened could not tell the operator's
 * own opens from a prospect's.
 */
export function CampaignStatsCard({ stat, onEdit, hidden = false, onToggleHide }: {
  stat: CampaignStats;
  onEdit?: (s: CampaignStats) => void;
  /** True when this card is currently hidden (rendered via "Show hidden"). */
  hidden?: boolean;
  onToggleHide?: (s: CampaignStats) => void;
}) {
  const { campaign, replyRatePct, pitchReplyRatePct, leadCount } = stat;
  const [expanded, setExpanded] = useState(false);
  const name = campaign?.name ?? 'Unassigned';
  const method = campaign?.method ? CAMPAIGN_METHOD_LABELS[campaign.method] ?? campaign.method : null;
  // Unknown/null type → 'audit' (the column default); the Unassigned bucket → 'service'.
  const rawType = campaign?.campaign_type;
  const type: CampaignType = !campaign ? 'service' : (rawType === 'site' || rawType === 'service') ? rawType : 'audit';
  // Most-reached first.
  const templateRows = Object.entries(stat.byTemplate).sort((a, b) => b[1].leads - a[1].leads);

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
        {/* The three that matter, with their qualifiers as small print underneath. */}
        <div className="grid grid-cols-3 gap-2">
          <Big
            value={stat.reached}
            label="Reached"
            sub={`${leadCount} ${leadCount === 1 ? 'lead' : 'leads'}${stat.delivered > 0 ? ` · ${stat.delivered} delivered` : ''}`}
            title="Leads actually sent a templated message. The base for every rate on this card — not the old 'Sent', which counted leads that were merely queued or unreachable."
          />
          <Big
            value={stat.replied}
            label="Replied"
            sub={replyRatePct === null ? null : `${replyRatePct}%${stat.declined > 0 ? ` · ${stat.declined} said no` : ''}`}
            title="Leads who sent a real inbound message that is not an auto-responder. Declines count as replies — they did answer — and are shown separately."
          />
          <Big
            value={stat.pitchReplied}
            label="Pitch reply"
            sub={stat.pitched === 0 ? 'none pitched' : `${pitchReplyRatePct}% of ${stat.pitched}`}
            tone={stat.pitched > 0 && stat.pitchReplied > 0 ? 'good' : 'muted'}
            title="Of the leads sent the report pitch, how many wrote back AFTER it was sent. Attributed by timestamp against the newest pitch — this is whether the report and pitch actually work."
          />
        </div>

        {/* ── REPORT OPENED ──────────────────────────────────────────────────────────────────────
            ⚠️ IT IS BACK, AND ONLY BECAUSE THE REASON IT WENT IS NOW FIXED. This card's own header
            note still records why it was pulled: "Report opened could not tell the operator's own
            opens from a prospect's". True of the raw ai_audits.open_count, which the operator's
            previews increment through the same URL — and measurably wrong as a reason to have no
            metric at all. useCampaignStats now attributes each open against the moment the report
            link was sent, which separates the two for every row (measured live: 371 opens after the
            send, ONE before). The header note above is left as written, because it is the record of
            what was wrong, and this comment is the record of what changed.
            ⚠️ ONLY RENDERED ONCE A LINK HAS GONE OUT. A "0 · 0% of 0" row on a campaign that has
            never sent a report says nothing and reads as a broken tile — the same rule the
            conversion row below already follows.
            ⚠️ The unattributed count is shown, not hidden. Those are opens on leads we never sent a
            link to, so they are almost certainly the operator's own; dropping them silently would
            make the row look cleaner than the data is. */}
        {stat.reportLinksSent > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground"
            title={
              'Leads who opened the audit report we sent them. Counted only when the report was first opened AFTER the link went out, '
              + 'so your own previews are excluded — the report URL is the same one you open from the Inbox, so the raw counter cannot tell them apart. '
              + 'Unique leads, never total views: there is no per-open log, so repeat views cannot be attributed to anyone.'
            }
          >
            <span>
              Report opened{' '}
              <span className="font-bold tabular-nums text-foreground/90">{stat.reportOpened}</span>
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-bold tabular-nums text-foreground/90">{stat.reportOpenRatePct}%</span>
              {' '}of {stat.reportLinksSent} link{stat.reportLinksSent === 1 ? '' : 's'} sent
            </span>
            {stat.reportOpensUnattributed > 0 && (
              <span
                className="text-muted-foreground/50"
                title="Audits opened on leads we never sent a report link to — so almost certainly your own previews. Excluded from the count above."
              >
                (+{stat.reportOpensUnattributed} not attributable)
              </span>
            )}
          </div>
        )}

        {/* Money row — the end of the funnel in real numbers, not a percentage. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
          <span>Sign-up sent <span className="font-bold tabular-nums text-foreground/90">{stat.signupSent}</span></span>
          <span className="text-muted-foreground/40">·</span>
          <span>started <span className="font-bold tabular-nums text-foreground/90">{stat.started}</span></span>
          <span className="text-muted-foreground/40">·</span>
          <span>paid <span className="font-bold tabular-nums text-foreground/90">{stat.paid}</span></span>
          {stat.moneyIn > 0 && (
            <span className="ml-auto font-bold tabular-nums text-green-600 dark:text-green-500">£{stat.moneyIn.toFixed(2)} in</span>
          )}
        </div>
        {/* The niche verdict in two conversions: of those who ANSWERED, who bought; and end-to-end.
            Only rendered once somebody replied — a wall of 0% rows says less than its absence. */}
        {stat.replied > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground"
            title="Conversion, on honest denominators: replied→paid is of the leads who sent a real reply; reached→paid is of the leads actually sent a real message. Both count paid from amount_paid, never a status."
          >
            <span>replied→paid <span className="font-bold tabular-nums text-foreground/90">{stat.repliedToPaidPct}%</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span>reached→paid <span className="font-bold tabular-nums text-foreground/90">{stat.reachedToPaidPct}%</span></span>
          </div>
        )}

        {/* Per-message detail, collapsed. Reached and read receipts only — see the note below. */}
        {templateRows.length > 0 && (
          <div className="border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-1 text-left text-[10px] uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-muted-foreground"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              By message ({templateRows.length})
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-1">
                {templateRows.map(([key, f]) => (
                  <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="truncate text-[11px] font-medium text-foreground/90">{TEMPLATE_LABEL[key] ?? key}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      Reached <span className="font-bold text-foreground/90">{f.leads}</span>
                      {/* This template's OWN read receipt. Only messages sent after per-message
                          status shipped can carry one, so a template whose whole history predates it
                          shows "—" rather than a misleading 0%. */}
                      {' · '}
                      <span className="font-bold text-foreground/90">
                        {f.delivered === 0 ? '—' : `${Math.round((f.read / f.delivered) * 100)}%`}
                      </span> read
                    </span>
                  </div>
                ))}
                {/* Stated rather than silently absent, because its disappearance is the point. */}
                <p className="pt-1 text-[10px] leading-snug text-muted-foreground/50">
                  No per-message reply count: the old one meant “this lead replied at some point,
                  ever”, so every row claimed the same replies. Pitch reply above is the
                  send-attributed one.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
