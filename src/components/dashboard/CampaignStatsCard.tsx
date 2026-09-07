import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import { templateLabel, isLegacyTemplate } from '@/types/outreach';
import type { CampaignStats, TemplateStats } from '@/hooks/useCampaignStats';
import { AB_ARMS, ARM_LABELS, armRate } from '@/lib/armComparison';

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
    /* ⚠️ whitespace-nowrap ON THE CELL, and the table scrolls instead. Without it "none sent
       since" wrapped to three lines and dragged every row in the table to that height, which made a
       five-row table look like a wall. Horizontal scroll inside the card is the cheaper trade. */
    <td className="whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums" title={title}>
      <span className={muted ? 'text-muted-foreground/50' : 'font-semibold text-foreground/90'}>{rate}</span>
      {detail && <span className="block text-[10px] leading-tight text-muted-foreground/60">{detail}</span>}
    </td>
  );
}

function TemplateRow({ name, t, siteTrackingReady }: { name: string; t: TemplateStats; siteTrackingReady: boolean }) {
  const legacy = isLegacyTemplate(name);
  /* A template that has never carried a report link has no open rate to have. "—" says that; 0%
     would claim we sent reports through it and nobody opened them. */
  const carriesReport = t.reportLinksSent > 0;
  return (
    <tr className="border-t border-border/30">
      {/* ⚠️ min-w, NOT max-w-0. The first draft let the label column collapse, and at a normal card
          width "Audit reply" and "Audit result hook" BOTH truncated to "Audit re…" — the two
          templates this table exists to compare, rendered indistinguishable. The table scrolls
          horizontally inside the card, so the space costs nothing. */}
      <th scope="row" className="min-w-[132px] py-1 pr-2 text-left font-medium">
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
      {/* ── SITE VISITS ──────────────────────────────────────────────────────────────────────
          ⛔ THREE OUTCOMES, THREE DIFFERENT MARKS, BECAUSE THEY ARE THREE DIFFERENT FACTS:
            · tracking not available at all → "—" + "not tracked"
            · tracking live but this template has not been sent since it started → "—" + "not sent since"
            · tracking live and the template has been sent → a real rate, 0% included
          The middle one is the subtle one and the reason sentSinceTracking exists: audit_reply has
          577 lifetime sends, nearly all of them before any landing could be recorded, so dividing by
          the lifetime figure would print ~0% for a template nobody has measured. */}
      {!siteTrackingReady
        ? <Cell rate="—" muted detail="not tracked"
            title="Landing on the sign-up page is not being recorded yet — the lead_page_hits table has not been created. Shown as unknown rather than 0, which would read as 'nobody clicked'." />
        : t.sentSinceTracking === 0
          ? <Cell rate="—" muted detail="none sent since"
              title="This template has not been sent since visit tracking started, so there is nothing it could have been measured on. Its older sends predate the tracking and cannot be counted either way." />
          : <Cell rate={pct(t.siteVisits, t.sentSinceTracking)}
              detail={`${t.siteVisits} of ${t.sentSinceTracking}`}
              title="Leads who landed on the sign-up page after this message, out of those sent it since tracking began. Credited to the newest message before the visit; a visitor with no message before them earns no template any credit." />}
      {/* Sign-up is a SUBMISSION, and unlike visits it has always been recorded, so its denominator
          is the template's full send count and a 0% here is a real measured zero. */}
      <Cell rate={pct(t.signupStarted, t.leads)}
        detail={t.signupStarted > 0 ? `${t.signupStarted} started` : null}
        title="Leads who submitted the questionnaire after this message. A submission, not a page view — landing on the form is the Site column. Free-check form submissions are excluded: that is a different form, reached from the website rather than driven by this message." />
    </tr>
  );
}

/* ════ COLD vs WARM ═══════════════════════════════════════════════════════════════════════════
   ⛔ A SEPARATE BLOCK, LABELLED AS A DIFFERENT MEASURE, NOT EXTRA COLUMNS IN THE TABLE ABOVE. The
   table credits LAST TOUCH — which message was in front of them when they clicked. This credits
   the arm the LEAD was sent, so a follow-up going out in between cannot take a click off the
   template under test. Putting intent-to-treat numbers in a last-touch table would make two
   different measures look like one, and the first person to compare a row against this block would
   find they disagree with no way to know why.
   ⚠️ ONLY RENDERS ONCE AN ARM HAS A LEAD. Two rows of dashes on every campaign that has never sent
   either template is noise, and a 0% on an unsent arm reads as "warm does not work".
   ⚠️ THE VISIT DENOMINATOR IS DIFFERENT FROM THE OTHER TWO and the header says so: opens and
   sign-ups have always been recorded, a landing on the sign-up page only since the prefill hook
   shipped. One denominator would understate visits by every send that predates it. */
function ArmComparisonBlock({ stat }: { stat: CampaignStats }) {
  const c = stat.armComparison;
  if (!c.hasData) return null;
  const cell = (num: number, den: number) => {
    const r = armRate(num, den);
    return r === null
      ? <span className="text-muted-foreground/50">—</span>
      : <><span className="font-semibold text-foreground/90">{r}%</span>
         <span className="block text-[10px] leading-tight text-muted-foreground/60">{num} of {den}</span></>;
  };
  return (
    <div className="border-t border-border/50 pt-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        Cold vs warm
        <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/50">
          credited to the template the lead was sent, not the last one
        </span>
      </p>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
              <th scope="col" className="min-w-[150px] pb-1 pr-2 text-left font-medium">Arm</th>
              <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Leads</th>
              <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Report</th>
              <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Site</th>
              <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Sign-up</th>
            </tr>
          </thead>
          <tbody>
            {AB_ARMS.map((arm) => {
              const t = c.arms[arm];
              return (
                <tr key={arm} className="border-t border-border/30">
                  <th scope="row" className="min-w-[150px] py-1 pr-2 text-left font-medium">
                    <span className="block truncate text-[11px] text-foreground/90">{ARM_LABELS[arm]}</span>
                  </th>
                  <td className="whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums">
                    <span className="font-semibold text-foreground/90">{t.leads}</span>
                    {t.leadsTracked !== t.leads && (
                      <span className="block text-[10px] leading-tight text-muted-foreground/60"
                        title="Leads whose arm send happened while site-visit tracking was running — the denominator for the Site column only.">
                        {t.leadsTracked} tracked
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums"
                    title="Opened the audit report at any point after this arm reached them.">
                    {cell(t.reportOpened, t.leads)}
                  </td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums"
                    title="Landed on the sign-up page after this arm reached them. Divided by the leads whose arm send is inside the tracking window, so the rate can never exceed 100%.">
                    {cell(t.siteVisits, t.leadsTracked)}
                  </td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums"
                    title="Submitted the questionnaire after this arm reached them. Free-check submissions are excluded.">
                    {cell(t.signups, t.leads)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {c.bothArms > 0 && (
          <p className="pt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-500"
            title="A lead sent both templates is in both populations, so it can answer neither question. Assigning it to the newer arm would flatter whichever template was introduced second — which is always the one being tested.">
            {c.bothArms} lead{c.bothArms === 1 ? ' was' : 's were'} sent BOTH templates and{' '}
            {c.bothArms === 1 ? 'is' : 'are'} excluded from both arms.
          </p>
        )}
      </div>
    </div>
  );
}

export function CampaignStatsCard({ stat, onEdit, hidden = false, onToggleHide, siteTrackingReady = false }: {
  stat: CampaignStats;
  /** False until a real read of lead_page_hits succeeds — see the Site column. */
  siteTrackingReady?: boolean;
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

        <ArmComparisonBlock stat={stat} />

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
                <table className="w-full min-w-[500px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
                      <th scope="col" className="pb-1 pr-2 text-left font-medium">Message</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Sent</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Read</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Replied</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium">Report</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium" title="Landed on the sign-up page after this message.">Site</th>
                      <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-medium" title="Submitted the questionnaire after this message.">Sign-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateRows.map(([key, t]) => <TemplateRow key={key} name={key} t={t} siteTrackingReady={siteTrackingReady} />)}
                  </tbody>
                </table>
                {/* ⚠️ SAID ONCE, PLAINLY, RATHER THAN AS A 0 IN EVERY ROW. The whole Clicks column is
                    unknown, so stating it once under the table is honest and quiet; a per-row "0"
                    would be a measurement nobody has taken. */}
                <p className="pt-1.5 text-[10px] leading-snug text-muted-foreground/50">
                  {siteTrackingReady
                    ? 'Site = landed on the sign-up page; Sign-up = submitted it. Both credited to the message sent most recently before it.'
                    : 'Site visits aren’t being recorded yet, so that column reads as unknown rather than zero.'}
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
