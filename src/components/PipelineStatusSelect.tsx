import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger } from '@/components/ui/select';
import { PipelineStatusBadge, pipelineStatusLabel } from './PipelineStatusBadge';
import { SalesStatePill } from './SalesStatePill';
import { PIPELINE_STATUS_OPTIONS, type PipelineStatus } from '@/types/outreach';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { maySetStatus } from '@/lib/access';
import { oneStatusOf, type SalesStateView } from '@/lib/leadState';

/**
 * Editable pipeline-status control — the coloured PipelineStatusBadge as a Select
 * trigger over PIPELINE_STATUS_OPTIONS. Extracted from OutreachTable's inline block
 * so the Outreach row and the Inbox conversation list use the EXACT same control.
 *
 * ⛔ ONE STATUS PILL (2026-10-01). Given the lead's sales stage (`stage`), the trigger draws the ONE pill
 * oneStatusOf chooses — the stage (Interested, Replied, Meeting booked, Client, Opted out…) when it
 * outranks routine sending, else the pipeline badge (New, Queued, Contacted, WhatsApp failed…). Nothing
 * else is drawn beside it. The menu still sets the STORED PIPELINE STATUS, and says so at its top, with
 * the current value — picking from the pill can never write the stage.
 *
 * Caller owns the onChange side-effects (optimistic clears, mark-interested, the
 * payment_received confirm, the write path) — this component is presentation only.
 * When `disabled`, renders a static pill (no dropdown) — e.g. an Unassigned Inbox
 * conversation with no linked lead.
 */
export function PipelineStatusSelect({
  value,
  onValueChange,
  disabled = false,
  triggerProps,
  triggerClassName,
  stage,
}: {
  value: PipelineStatus | string | null | undefined;
  onValueChange: (status: PipelineStatus) => void;
  disabled?: boolean;
  /** Extra attrs spread onto the trigger (e.g. walkthrough data-* hooks). */
  triggerProps?: Record<string, string>;
  /** Override the trigger styling. Default = the borderless inline pill used in the
   *  dense Outreach table; pass a chromed className (e.g. from the Inbox) to get a
   *  proper bordered select-trigger with a chevron around the coloured badge. */
  triggerClassName?: string;
  /** The lead's sales stage (leadState.salesStateOf). Absent → the pipeline badge, as before. */
  stage?: SalesStateView | null;
}) {
  /* The same list for both roles; a salesperson's options outside lead_set_stage's allowlist are
     shown disabled (the server refuses them anyway) — see src/lib/access.ts. */
  const perms = useLeadPermissions();
  if (disabled) return <OneStatusPill status={value} stage={stage} />;
  const pipe = pipelineStatusLabel(value);
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onValueChange(v as PipelineStatus)}>
      <SelectTrigger
        className={triggerClassName ?? "w-auto h-auto p-0 border-0 bg-transparent focus:ring-0"}
        onClick={(e) => e.stopPropagation()}
        title={titleOf(value, stage)}
        {...(triggerProps ?? {})}
      >
        <OneStatusPill status={value} stage={stage} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-[11px] font-normal text-muted-foreground">Pipeline status · now {pipe}</SelectLabel>
          {PIPELINE_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} disabled={!maySetStatus(perms, opt.value)}>{opt.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function titleOf(status: string | null | undefined, stage: SalesStateView | null | undefined): string {
  const pipe = pipelineStatusLabel(status);
  const one = oneStatusOf(stage, status);
  if (one.source === 'pipeline') return stage && stage.label !== pipe ? `Pipeline status: ${pipe} · Sales stage: ${stage.label}` : `Pipeline status: ${pipe}`;
  return `Sales stage: ${one.view.label}${one.view.detail ? ` · ${one.view.detail}` : ''} · Pipeline status: ${pipe}`;
}

/** The ONE pill, read-only (a row without edit rights, the phone card, a disabled Inbox row). */
export function OneStatusPill({ status, stage, compact }: { status: string | null | undefined; stage?: SalesStateView | null; compact?: boolean }) {
  const one = oneStatusOf(stage, status);
  return (
    <span className="inline-flex items-center gap-0.5" title={titleOf(status, stage)} data-testid="one-status" data-source={one.source}>
      {one.source === 'stage'
        ? <SalesStatePill view={one.view} size="xs" className="py-0.5" />
        : <PipelineStatusBadge status={(status as PipelineStatus) ?? undefined} compact={compact} />}
    </span>
  );
}
