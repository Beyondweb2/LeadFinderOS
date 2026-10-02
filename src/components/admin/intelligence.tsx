import { Activity, Boxes, FileText, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE, type Tone } from '@/components/salesDash/ui';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import type { NicheLabel, TemplateFlag, UsageFlag } from '@/lib/adminIntelligence';
import {
  NICHE_MIN_MESSAGED, NICHE_WEAK_FACTOR, TEMPLATE_HIGH_FACTOR, TEMPLATE_MIN_LEADS, TEMPLATE_REJECTION_SHARE, TEMPLATE_WEAK_FACTOR,
  USAGE_COSTLY_MAX_USES, USAGE_COSTLY_USD, USAGE_DROP_MIN_PREVIOUS, USAGE_DROP_SHARE,
} from '@/lib/adminIntelligence';
import { Rate } from '@/components/admin/controlCentre';

/* ══ SALES INTELLIGENCE PANELS (release 3) ═════════════════════════════════════════════════════════
   Presentational. Every label prints its threshold; no ranking, no score. */

type O = AdminOverviewResponse;
const num = (n: number) => n.toLocaleString('en-GB');
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

const FLAG_META: Record<TemplateFlag, { label: string; tone: Tone }> = {
  high_reply: { label: 'High reply', tone: 'green' },
  weak_reply: { label: 'Weak reply', tone: 'amber' },
  no_replies: { label: 'No replies', tone: 'red' },
  high_rejection: { label: 'High rejection', tone: 'red' },
  tiny_sample: { label: 'Tiny sample', tone: 'grey' },
};
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TONE[tone].soft, TONE[tone].text)}>{label}</span>;
}

export function TemplatesPanel({ o }: { o: O }) {
  const t = o.templates;
  return (
    <Panel collapseKey="admin.cc.templates" title="WhatsApp templates" icon={FileText} tone="blue" defaultOpen={false}
      hint={`${o.period.label} · registered Meta templates, last-touch: a reply belongs to the newest template before it. "Contested" = two different templates went out with no reply between them.`}
      summary={t.meta.length ? `${t.meta.length} template${t.meta.length === 1 ? '' : 's'} sent · overall reply rate ${pct(t.overallReplyRate)}` : 'No templates sent in this period'}>
      {!t.meta.length ? <Empty>No templates sent in this period.</Empty> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {['Template', 'Leads sent', 'Delivered', 'Replied', 'Real interest', 'Interested', 'Meetings', 'Paid', 'Said no', 'Opted out', 'Flags'].map((h, i) => <th key={h} className={cn('py-2 font-semibold', i === 0 ? 'pr-3' : 'px-2', i > 0 && i < 10 && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>{t.meta.map((r) => (
              <tr key={r.template} className="border-b border-border/40 align-top">
                <td className="py-1.5 pr-3"><span className="font-mono text-xs">{r.template}</span><span className="block text-[10px] text-muted-foreground">{r.sends} send{r.sends === 1 ? '' : 's'}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.leadsSent)}</td>
                <td className="px-2 py-1.5 text-right text-xs"><Rate n={r.delivered} of={r.sends} /></td>
                <td className="px-2 py-1.5 text-right text-xs"><Rate n={r.replies} of={r.leadsSent} />{r.repliesContested > 0 && <span className="block text-[10px] text-muted-foreground">{r.repliesContested} contested</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" title="Replies the reply sorter filed as interested, price, call, booking or a question">{num(r.positive)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.interested)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.meetings)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.paid)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.notInterested)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.optOuts)}</td>
                <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{r.flags.map((f) => <Chip key={f} {...FLAG_META[f]} />)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Free-form messages (typed in the Inbox, or an AI draft sent) are not templates: {num(t.freeForm.sends)} sent to {num(t.freeForm.leadsSent)} lead{t.freeForm.leadsSent === 1 ? '' : 's'} in this period.
        {' '}Flags: tiny sample under {TEMPLATE_MIN_LEADS} leads; high reply ≥ {TEMPLATE_HIGH_FACTOR}× the overall rate; weak ≤ {TEMPLATE_WEAK_FACTOR}×; high rejection when {Math.round(TEMPLATE_REJECTION_SHARE * 100)}%+ of replies said no or asked to stop.
        {' '}Interested / meetings / paid are what FOLLOWED on the leads whose reply the template earned — not proof it caused them. Message cost: WhatsApp charges are not recorded anywhere yet.
      </p>
    </Panel>
  );
}

const NICHE_META: Record<NicheLabel, { label: string; tone: Tone } | null> = {
  promising: { label: 'Promising data', tone: 'green' },
  needs_more_data: { label: 'Needs more data', tone: 'grey' },
  weak_so_far: { label: 'Weak response so far', tone: 'amber' },
  in_line: { label: 'In line with the book', tone: 'blue' },
  no_label: null,
};

export function NichesPanel({ o }: { o: O }) {
  const rows = o.niches.filter((r) => r.leadsInBook > 0);
  const active = rows.filter((r) => r.messaged > 0);
  return (
    <Panel collapseKey="admin.cc.niches" title="Niches" icon={Layers} tone="green" defaultOpen={false}
      hint={`${o.period.label} · of the leads first messaged in this period, per trade. Labels only when the sample is big enough.`}
      summary={active.length ? `${active.length} niche${active.length === 1 ? '' : 's'} messaged · book reply rate ${pct(o.nicheBookReplyRate)}` : 'No niche messaged in this period'}>
      {!rows.length ? <Empty>No leads yet.</Empty> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {['Niche', 'In book', 'Added', 'Contactable', 'Messaged', 'Replied', 'Interested', 'Meetings', 'Paid', 'Reply · site / none on record', ''].map((h, i) => <th key={h + i} className={cn('py-2 font-semibold', i === 0 ? 'pr-3' : 'px-2', i > 0 && i < 10 && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((r) => {
              const meta = NICHE_META[r.verdict];
              return (
                <tr key={r.key} className={cn('border-b border-border/40', r.messaged === 0 && 'text-muted-foreground')}>
                  <td className="py-1.5 pr-3 font-medium">{r.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.leadsInBook)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.leadsAdded)}</td>
                  <td className="px-2 py-1.5 text-right text-xs"><Rate n={r.contactable} of={r.leadsInBook} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.messaged)}</td>
                  <td className="px-2 py-1.5 text-right text-xs"><Rate n={r.replied} of={r.messaged} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.interested)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.meetings)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.paid)}</td>
                  <td className="px-2 py-1.5 text-right text-xs">
                    {r.messaged ? <><Rate n={r.withSite.replied} of={r.withSite.messaged} /><span className="text-muted-foreground"> / </span><Rate n={r.noSiteOnRecord.replied} of={r.noSiteOnRecord.messaged} /></> : '—'}
                  </td>
                  <td className="px-2 py-1.5">{meta && <Chip {...meta} />}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Needs more data: under {NICHE_MIN_MESSAGED} leads messaged. Promising data: reply rate at or above the book's ({pct(o.nicheBookReplyRate)}) and at least one interested. Weak response so far: reply rate at or under {NICHE_WEAK_FACTOR}× the book's. In line with the book: enough data, neither.
        {' '}Contactable = has a phone and is not marked "no WhatsApp". "No website on record" means the field is blank — not proof they have none. Cost per niche is not attributable yet (searches are not tied to leads).
      </p>
    </Panel>
  );
}

const USAGE_FLAG: Record<UsageFlag, { label: string; tone: Tone }> = {
  unused: { label: 'Unused', tone: 'amber' },
  dropped: { label: 'Dropped sharply', tone: 'amber' },
  costly_low_use: { label: 'Costly for its use', tone: 'red' },
  new_tracking: { label: 'Tracking began 30 Sep', tone: 'grey' },
};

export function FeatureUsagePanel({ o }: { o: O }) {
  const rows = o.features;
  const used = rows?.filter((r) => r.uses > 0).length ?? 0;
  return (
    <Panel collapseKey="admin.cc.features" title="What LeadFinderOS is used for" icon={Boxes} tone="purple" defaultOpen={false}
      hint={`${o.period.label} · useful actions only (a script shown or copied, an audit run, a contact logged) — never clicks or time spent.`}
      summary={rows ? `${used} of ${rows.length} features used` : 'Usage unavailable'}>
      {!rows ? <Empty>Feature usage could not be read just now.</Empty> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {['Feature', 'Uses', 'Previous period', 'Who', 'Recorded cost', ''].map((h, i) => <th key={h + i} className={cn('py-2 font-semibold', i === 0 ? 'pr-3' : 'px-2', (i === 1 || i === 2 || i === 4) && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>{[...rows].sort((a, b) => b.uses - a.uses).map((r) => (
              <tr key={r.key} className={cn('border-b border-border/40', r.uses === 0 && 'text-muted-foreground')}>
                <td className="py-1.5 pr-3">{r.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(r.uses)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.previous === null ? '—' : num(r.previous)}</td>
                <td className="px-2 py-1.5 text-xs">{r.people.map((p) => `${p.name} ${p.uses}`).join(' · ') || '—'}</td>
                <td className="px-2 py-1.5 text-right text-xs tabular-nums">{r.costUsd === null ? '—' : `$${r.costUsd.toFixed(2)}`}</td>
                <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{r.flags.map((f) => <Chip key={f} {...USAGE_FLAG[f]} />)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Counted from what each feature records (audits run, contacts logged, links sent, socials a person found — the 30 Sep backfill excluded). Four features record nothing of their own, so since 30 Sep they log one useful action a day per lead: the call script shown, a LinkedIn or email script copied, Focus Mode opened.
        {' '}Dropped sharply = at or under {Math.round(USAGE_DROP_SHARE * 100)}% of the previous period (from {USAGE_DROP_MIN_PREVIOUS}+). Costly for its use = ${USAGE_COSTLY_USD}+ spent on {USAGE_COSTLY_MAX_USES} or fewer uses. Test accounts are shown apart, never in the totals.
      </p>
    </Panel>
  );
}

export function BottlenecksPanel({ o }: { o: O }) {
  const flagged = o.bottlenecks.filter((b) => b.status === 'flag');
  const order = { flag: 0, ok: 1, not_enough_data: 2 } as const;
  return (
    <Panel collapseKey="admin.cc.bottlenecks" title="Where it is getting stuck" icon={Activity} tone={flagged.length ? 'amber' : 'grey'} defaultOpen={false}
      hint={`${o.period.label} · fixed checks with the numbers they used. Not judged until there is enough data.`}
      summary={flagged.length ? `${flagged.length} flagged: ${flagged.map((b) => b.title.toLowerCase()).join(' · ')}` : 'Nothing flagged'}>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
        {[...o.bottlenecks].sort((a, b) => order[a.status] - order[b.status]).map((b) => (
          <li key={b.key} className="flex min-w-0 items-start gap-3 px-3 py-2.5">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', b.status === 'flag' ? TONE.amber.dot : b.status === 'ok' ? TONE.green.dot : TONE.grey.dot)} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{b.title} <span className="font-normal text-muted-foreground">· {b.status === 'flag' ? b.meaning : b.status === 'ok' ? 'fine' : 'not enough data yet'}</span></span>
              <span className="block text-xs text-muted-foreground">{b.evidence}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
