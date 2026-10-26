/* DESIGN MOCKUP ONLY (2026-10-26, branch design/admin-dashboard — never merged). FAKE "Demo" businesses; nothing here
   reads or writes data. Built from the real dashboard parts (PageHeader, SectionHeading, Panel, KpiCard, the attention-row
   markup) so it keeps today's look. Two concepts: ?c=a (today's page, cleaned) and ?c=b (Needs me first). */
import { useState } from 'react';
import { AlertTriangle, ArrowRight, Archive, BellRing, Clock, PoundSterling, RefreshCw, Send, Signal, UserPlus, Users, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageHeader, SectionHeading, Segmented, KpiCard, Panel, TONE, type Tone } from '@/components/salesDash/ui';

type Row = { biz: string; kind: string; tone: Tone; group: 'urgent' | 'today' | 'waiting'; why: string; since: string; action: string; template?: string; star?: boolean; flag?: string };

/* No replies or drafts here (Paul, 2026-10-26: too many a day; they live in the Inbox). */
const ROWS: Row[] = [
  { biz: 'Demo Driving School A', kind: 'Questionnaire', tone: 'red', group: 'urgent', why: 'Finished the questions, no agreement yet. Still blank: who owns the domain', since: '26h', action: 'Send domain help', template: 'domain_help', flag: 'Escalated · 24h' },
  { biz: 'Demo Plumbing B', kind: 'Payment failed', tone: 'red', group: 'urgent', why: 'Monthly payment failed 2 days ago', since: '2d', action: 'Send payment help', template: 'payment_help' },
  { biz: 'Demo Driving D', kind: 'Questionnaire', tone: 'amber', group: 'today', why: 'Answered everything. Agency contract "not sure"', since: '5h', action: 'Send agency access', template: 'agency_access' },
  { biz: 'Demo Electrical E', kind: 'Interested', tone: 'amber', group: 'today', why: 'Starred, waiting on us since Friday', since: '3d', action: 'Send agreement & next steps', template: 'agreement_next_steps', star: true },
  { biz: 'Demo Driving G', kind: 'Follow-up due', tone: 'blue', group: 'today', why: 'Next Action you set: call back today 14:00', since: 'due 14:00', action: 'Open lead' },
  { biz: 'Demo Accountants H', kind: 'New client', tone: 'green', group: 'today', why: 'Paid yesterday. Next onboarding step: logo and photos', since: '1d', action: 'Send what we need', template: 'what_we_need' },
  { biz: 'Demo Driving J', kind: 'Questionnaire', tone: 'grey', group: 'waiting', why: 'Final nudge sent 2 days ago, no answer', since: '4d', action: 'Mark outcome', flag: '48h passed' },
];
const GROUPS: { g: Row['group']; label: string; tone: Tone }[] = [
  { g: 'urgent', label: 'Urgent', tone: 'red' }, { g: 'today', label: 'Today', tone: 'amber' }, { g: 'waiting', label: 'Waiting on them', tone: 'grey' },
];
const FUNNEL: [string, number][] = [['Sent', 817], ['Delivered', 708], ['Real replies', 254], ['Interested', 14], ['Questionnaire started', 4], ['Reached payment', 2], ['Paid', 0]];

function NeedsRow({ r, onArchive }: { r: Row; onArchive: () => void }) {
  return (
    <li className="flex min-w-0 flex-col sm:flex-row sm:items-stretch">
      <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[r.tone].dot)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">{r.star && <span className="text-yellow-400">★ </span>}{r.biz}</span>
            <span className="text-[11px] text-muted-foreground">{r.kind} · {r.since}</span>
            {r.flag && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE.red.soft, TONE.red.text)}>{r.flag}</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{r.why}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 sm:border-t-0 sm:py-0">
        {r.template
          ? <Button size="sm" className="h-8 gap-1.5 rounded-full"><Send className="h-3.5 w-3.5" />{r.action}</Button>
          : <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full">{r.action}<ArrowRight className="h-3.5 w-3.5" /></Button>}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Snooze"><Clock className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Dismiss"><X className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Archive" onClick={onArchive}><Archive className="h-4 w-4" /></Button>
      </div>
    </li>
  );
}

function NeedsList() {
  const [gone, setGone] = useState<string | null>('Demo Driving K');
  return (
    <Panel title="What needs you" icon={AlertTriangle} tone="red"
      hint="Questionnaires, money, interested leads, follow-ups due and new clients, most urgent first. Replies stay in the Inbox. The send button uses your template through the normal sender: send hours, opt-outs, the 24-hour window and Meta rules all apply.">
      <div className="space-y-4">
        {GROUPS.map(({ g, label, tone }) => {
          const rows = ROWS.filter((r) => r.group === g);
          return (
            <div key={g}>
              <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', TONE[tone].text)}>{label} · {rows.length}</p>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
                {rows.map((r) => <NeedsRow key={r.biz} r={r} onArchive={() => setGone(r.biz)} />)}
              </ul>
            </div>
          );
        })}
      </div>
      {gone && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <span>Archived {gone}. Nothing is deleted.</span>
          <button type="button" className="font-semibold text-primary" onClick={() => setGone(null)}>Undo</button>
        </div>
      )}
    </Panel>
  );
}

function Funnel() {
  return (
    <Panel title="Funnel · last 14 days" icon={Users} tone="blue">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {FUNNEL.map(([k, v], i) => (
          <div key={k} className="rounded-xl border border-border/60 bg-muted/10 p-2.5">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className="text-xl font-extrabold tabular-nums">{v}</p>
            <p className="text-[10px] text-muted-foreground">{i ? `${Math.round((100 * v) / (FUNNEL[i - 1][1] || 1))}% of previous` : 'opener sent'}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Health() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard tone="red" icon={Signal} label="WhatsApp number rating" value="RED" sub="Tier 2K · checked 15 min ago" />
      <KpiCard tone="blue" icon={Send} label="Daily cap used" value="112 / 250" sub="Queue sends today" />
      <KpiCard tone="amber" icon={AlertTriangle} label="Failed today" value="6" sub="4% of sends" />
      <KpiCard tone="purple" icon={Users} label="Team this week" value="693" sub="Paul 690 · Ethan 1 · Stephan 2" />
    </div>
  );
}

function Glance() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard tone="green" icon={PoundSterling} label="Revenue this month" value="£0.00" sub="0 payments · Stripe ledger" />
      <KpiCard tone="blue" icon={UserPlus} label="New clients this month" value={0} sub="None yet this month" />
      <KpiCard tone="amber" icon={BellRing} label="Needs you" value={ROWS.length} sub="2 urgent" />
      <KpiCard tone="purple" icon={Wallet} label="Commission due" value="£0.00" sub="Paid on 1 Nov" />
    </div>
  );
}

function QuestionnaireLog() {
  const rows = [['Demo Driving School A', 'Fri 14:19', 'Domain', 'Open · escalated', 'amber'], ['Demo Driving J', 'Wed 09:02', 'Payment', 'Lost · went quiet', 'grey'], ['Demo Plumbing K', 'Tue 11:40', '—', 'Paid', 'green']] as const;
  return (
    <Panel title="Questionnaires this week" icon={UserPlus} tone="amber" hint="Every submission, where it stopped, and how it ended (paid, or lost with a reason).">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-3 font-medium">Business</th><th className="pr-3 font-medium">Submitted</th><th className="pr-3 font-medium">Stopped at</th><th className="font-medium">Outcome</th></tr></thead>
          <tbody className="divide-y divide-border/60">
            {rows.map(([b, s, at, out, tone]) => (
              <tr key={b}><td className="py-2 pr-3 font-medium">{b}</td><td className="pr-3">{s}</td><td className="pr-3">{at}</td>
                <td><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE[tone].soft, TONE[tone].text)}>{out}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const Header = ({ sub }: { sub: string }) => (
  <PageHeader eyebrow="Good morning, Paul" title="Admin dashboard" subtitle={sub}
    actions={<><span className="hidden text-xs text-muted-foreground sm:inline">Updated just now</span>
      <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full"><Archive className="h-4 w-4" /><span className="hidden sm:inline">Archived (3)</span></Button>
      <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Refresh</span></Button></>} />
);

/** A: today's page, junk removed. Same order: glance tiles → what needs you → numbers. */
function ConceptA() {
  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <Header sub="What needs you, and the few numbers that matter." />
      <Segmented label="Period" value="14d" options={[{ key: 'today', label: 'Today' }, { key: '7d', label: '7 days' }, { key: '14d', label: '14 days' }, { key: 'month', label: 'This month' }]} onChange={() => {}} />
      <div className="space-y-3"><SectionHeading title="Business at a glance" tone="green" /><Glance /></div>
      <div id="needs-you"><NeedsList /></div>
      <div className="space-y-3"><SectionHeading title="Key numbers" tone="blue" /><Funnel /><Health /></div>
      <QuestionnaireLog />
    </div>
  );
}

/** B: Needs me first, numbers in a narrow column beside it on desktop. */
function ConceptB() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <Header sub="Today first: what needs you. Numbers on the side." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6"><NeedsList /><QuestionnaireLog /></div>
        <div className="min-w-0 space-y-4">
          <Panel title="Funnel · 14 days" icon={Users} tone="blue">
            <ul className="space-y-1.5 text-sm">{FUNNEL.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2"><span className="w-36 shrink-0 text-xs text-muted-foreground">{k}</span>
                <span className={cn('h-2 rounded-full', TONE.blue.bar)} style={{ width: `${Math.max(4, (v / 817) * 120)}px` }} /><b className="tabular-nums">{v}</b></li>))}</ul>
          </Panel>
          <Panel title="Sending health" icon={Signal} tone="red">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-border/60 bg-muted/10 p-2.5"><p className="text-muted-foreground">Number rating</p><p className={cn('text-lg font-extrabold', TONE.red.text)}>RED</p><p className="text-muted-foreground">Tier 2K</p></div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-2.5"><p className="text-muted-foreground">Cap used</p><p className="text-lg font-extrabold">112 / 250</p></div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-2.5"><p className="text-muted-foreground">Failed today</p><p className="text-lg font-extrabold">6</p><p className="text-muted-foreground">4%</p></div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-2.5"><p className="text-muted-foreground">Team this week</p><p className="text-lg font-extrabold">693</p><p className="text-muted-foreground">Paul 690 · Ethan 1 · Stephan 2</p></div>
            </div>
          </Panel>
          <Panel title="Money this month" icon={PoundSterling} tone="green"><p className="text-2xl font-extrabold">£0.00</p><p className="text-xs text-muted-foreground">0 new clients · commission due £0.00</p></Panel>
        </div>
      </div>
    </div>
  );
}

export default function AdminHomeMock({ concept }: { concept: string }) {
  return <div className="min-h-screen bg-background p-4 text-foreground sm:p-6">{concept === 'b' ? <ConceptB /> : <ConceptA />}</div>;
}
