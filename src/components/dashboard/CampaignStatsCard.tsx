import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { templateLabel, isLegacyTemplate } from '@/types/outreach';
import type { CampaignStats, TemplateStats } from '@/hooks/useCampaignStats';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE CAMPAIGN'S CARD — a top line you can read in a second, and a per-template table underneath.

   ⛔ REBUILT 2026-09-05 (Paul: "they've grown cluttered and mix metrics that aren't clear"). What
   changed and why, so none of it creeps back:

   · THE TOP LINE IS THE FUNNEL: Reached → Replied → Paid. "Pitch reply" was a big number and is
     now a row in the table, where it belongs — it is one template's reply rate, and standing
     third-of-three implied it ranked alongside "did anyone answer" and "did anyone pay". The
     campaign-level pitch figures still exist on CampaignStats; nothing was deleted from the hook.
   · THE PER-TEMPLATE TABLE IS THE POINT OF THE CARD NOW. Sent · read · replied · report opened,
     one row per message, so "how is each template performing" is answerable at a glance instead of
     inferred from three campaign-wide numbers.
   · THE SITE/AUDIT/SERVICE TYPE BADGE IS GONE. 'site' is the old barber-sites product; the badge
     read "Site" on five campaigns with almost no activity between them and said nothing useful
     about any Findable campaign. campaign_type is untouched in the DB and in the edit dialog.

   ⛔ NO FAKE ZEROS. Every cell distinguishes "measured zero" from "not applicable here" from "not
   tracked at all", because they are three different facts and printing 0 for the last two is how a
   dashboard starts lying:
     · a template carrying no report link shows "—" for opens, not 0%
     · website clicks show unknown for EVERY template, because no click tracking exists in either
       repo (verified 2026-09-05: no table, no redirect endpoint, no migration)
     · read % shows "—" when nothing was delivered, because read/0 is not 0%

   ⚠️ AND THE REPLY RATE CARRIES ITS CAVEAT ONLY WHERE IT HAS ONE. Measured over the whole book, 4%
   of credited replies follow 2+ different templates with no reply in between, so last touch decides
   them by rule. That is concentrated, not spread: contact_followup is 20 of 20 contested (a chase
   only exists because the opener got no answer) while initial_contact is 0 of 530. So the contested
   count is shown ON the rows that have one, rather than as a general disclaimer nobody reads.
   See src/lib/templateAttribution.ts for the measurements.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A headline figure. Three carry the card: what we did, who answered, who paid. */
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
      {sub && <p className="text-[10px] text-muted-foreground/60 tabular-nums">{sub}</p>}
    </div>
  );
}

const pct = (num: number, den: number): string => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');

/** A table cell: the rate big enough to scan, its raw counts underneath. */
function Cell({ rate, detail, title, muted = false }: {
  rate: string; detail?: string | null; title?: string; muted?: boolean;
}) {
  return (
    <td className="py-1 pl-2 text-right align-top tabular-nums" title={title}>
      <span className={muted ? 'text-muted-foreground/50' : 'font-semibold text-foreground/90'}>{rate}</span>
      {detail && <span className="block text-[10px] leading-tight text-muted-foreground/60">{detail}</span>}
    </td>
  );
}

function TemplateRow({ name, t }: { name: string; t: TemplateStats }) {
  const legacy = isLegacyTemplate(name);
  /* A template that has never carried a report link has no open rate to have. "—" says that; 0%
     would claim we sent reports through it and nobody opened them. */
  const carriesReport = t.reportLinksSent > 0;
  return (
    <tr className="border-t border-border/30">
      <th scope="row" className="max-w-0 py-1 pr-2 text-left font-medium">
        <span className="block truncate text-[11px] text-foreground/90" title={name}>
          {templateLabel(name)}
        </span>
        {legacy && (
          <span
            className="text-[9px] uppercase tracking-wide text-muted-foreground/50"
            title="The old barber-sites product, not Findable. Shown because these messages really were sent; it is not a template that can be sent now."
          >
            Legacy
          </span>
        )}
      </th>
      <Cell rate={String(t.leads)} detail={t.delivered > 0 ? `${t.delivered} delivered` : null}
        title="Distinct leads sent this template, counting only sends Meta accepted." />
      <Cell rate={pct(t.read, t.delivered)} muted={t.delivered === 0}
        title={t.delivered === 0
          ? 'Nothing delivered, so there is no read rate. Messages sent before per-message receipts shipped cannot carry one.'
          : `${t.read} of ${t.delivered} delivered were read.`} />
      <Cell
        rate={pct(t.replied, t.leads)}
        detail={t.repliedAmbiguous > 0
          ? `${t.replied} · ${t.repliedAmbiguous} contested`
          : (t.replied > 0 ? `${t.replied} replied` : null)}
        title={
          'Leads who replied after this message, credited to the newest send before their reply. '
          + (t.repliedAmbiguous > 0
            ? `${t.repliedAmbiguous} of these ${t.replied} followed another template with no reply in between, so which message earned them cannot be known — last touch gave them to this one. A chase is contested by definition: it only goes out because the opener got no answer.`
            : 'Every one of these followed this template alone, so the credit is unambiguous.')
        } />
      {carriesReport
        ? <Cell rate={pct(t.reportOpened, t.reportLinksSent)}
            detail={`${t.reportOpened} of ${t.reportLinksSent}`}
            title="Leads who opened the audit report AFTER this template sent them the link. Your own previews are excluded because they predate the send; unique leads, never total views." />
        : <Cell rate="—" muted title="This template carries no report link, so there is no open rate to measure. Not zero — nothing to count." />}
      <Cell rate="—" muted
        title="Website clicks are not tracked yet: there is no click-logging table or redirect endpoint, so nobody can say whether a link was followed. Shown as unknown rather than 0, which would read as 'nobody clicked'." />
    </tr>
  );
}

export function CampaignStatsCard({ stat, onEdit, hidden = false, onToggleHide }: {
  stat: CampaignStats;
  onEdit?: (s: CampaignStats) => void;
  /** True when this card is currently hidden (rendered via "Show hidden"). */
  hidden?: boolean;
  onToggleHide?: (s: CampaignStats) => void;
}) {
  const { campaign, replyRatePct, leadCount } = stat;
  const [expanded, setExpanded] = useState(true);
  const name = campaign?.name ?? 'Unassigned';
  const method = campaign?.method ? CAMPAIGN_METHOD_LABELS[campaign.method] ?? campaign.method : null;
  // Most-sent first: the message that did the most work is the one to read first.
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
            {/* ⛔ NO TYPE BADGE — see the header. The METHOD badge stays: it says how the campaign is
                worked, which is still true and still varies between campaigns. */}
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
        {/* THE FUNNEL, IN ORDER: who we reached, who answered, who paid. */}
        <div className="grid grid-cols-3 gap-2">
          <Big
            value={stat.reached}
            label="Reached"
            sub={`of ${leadCount} ${leadCount === 1 ? 'lead' : 'leads'}`}
            title="Leads actually sent a message Meta accepted. The base for every rate on this card — never the lead count, and never leads merely queued."
          />
          <Big
            value={stat.replied}
            label="Replied"
            sub={replyRatePct === null ? null : `${replyRatePct}%${stat.declined > 0 ? ` · ${stat.declined} said no` : ''}`}
            title="Leads who sent a real inbound message that is not an auto-responder. Declines count — they did answer — and are shown separately."
          />
          <Big
            value={stat.paid}
            label="Paid"
            sub={stat.moneyIn > 0 ? `£${stat.moneyIn.toFixed(2)} in` : null}
            tone={stat.paid > 0 ? 'good' : 'muted'}
            title="Leads with money actually taken (amount_paid), never a pipeline status. A customer moved on to delivery is still paid; a £0 lead dragged to 'payment received' is not."
          />
        </div>

        {/* The steps between a reply and the money — small, because they are stages rather than
            outcomes. Only once the sign-up link has gone out: before that this row is three zeros
            describing a stage nobody has reached. */}
        {stat.signupSent > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
            <span>Sign-up sent <span className="font-bold tabular-nums text-foreground/90">{stat.signupSent}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span title="Leads with an onboarding questionnaire row — they started signing up.">
              started <span className="font-bold tabular-nums text-foreground/90">{stat.started}</span>
            </span>
            {stat.replied > 0 && (
              <span className="ml-auto" title="Of the leads who sent a real reply, how many paid. The niche's conversion, on an honest denominator.">
                replied→paid <span className="font-bold tabular-nums text-foreground/90">{stat.repliedToPaidPct}%</span>
              </span>
            )}
          </div>
        )}

        {/* ── PER TEMPLATE ─────────────────────────────────────────────────────────────────────
            Open by default: this is the reason to look at the card, and a collapsed section holding
            the answer is a section nobody opens. Still collapsible, because a long-running campaign
            can carry a dozen templates. */}
        {templateRows.length > 0 && (
          <div className="border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-1 text-left text-[10px] uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-muted-foreground"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Per message ({templateRows.length})
            </button>
            {expanded && (
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[360px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
                      <th scope="col" className="pb-1 pr-2 text-left font-medium">Message</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium">Sent</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium">Read</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium">Replied</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium">Report</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium" title="Not tracked yet — no click logging exists.">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateRows.map(([key, t]) => <TemplateRow key={key} name={key} t={t} />)}
                  </tbody>
                </table>
                {/* ⚠️ SAID ONCE, PLAINLY, RATHER THAN AS A 0 IN EVERY ROW. The whole Clicks column is
                    unknown, so stating it once under the table is honest and quiet; a per-row "0"
                    would be a measurement nobody has taken. */}
                <p className="pt-1.5 text-[10px] leading-snug text-muted-foreground/50">
                  Clicks aren’t tracked yet — links carry no click logging, so a follow can’t be
                  counted either way.
                  {stat.reportOpensUnattributed > 0 && (
                    <> {stat.reportOpensUnattributed} report open
                      {stat.reportOpensUnattributed === 1 ? ' was' : 's were'} on leads never sent a
                      link, so almost certainly your own previews — excluded above.</>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
