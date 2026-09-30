import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger } from '@/components/ui/select';
import { PipelineStatusBadge, pipelineStatusLabel } from './PipelineStatusBadge';
import { PIPELINE_STATUS_OPTIONS, type PipelineStatus } from '@/types/outreach';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { maySetStatus } from '@/lib/access';
import type { SalesStateView } from '@/lib/leadState';

/**
 * Editable pipeline-status control — the coloured PipelineStatusBadge as a Select
 * trigger over PIPELINE_STATUS_OPTIONS. Extracted from OutreachTable's inline block
 * so the Outreach row and the Inbox conversation list use the EXACT same control.
 *
 * ⛔ ONE STATUS PILL (Paul, 2026-10-01): the row shows THIS pill and nothing else — the solid pipeline
 * badge, in its own words and colours ("put the pills back to how they worked yesterday", "I like solid
 * colour pills"). Interested is the gold STAR on the row, never a pill. No second sales-state pill is
 * drawn beside it; the sales stage (`stage`) appears only in the tooltip. The menu sets the stored
 * pipeline status and nothing else.
 *
 * Caller owns the onChange side-effects (optimistic clears, mark-interested, the
 * payment_received confirm, the write path) — this component is presentation only.
 * When `disabled`, renders a static badge (no dropdown) — e.g. an Unassigned Inbox
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
  /** The lead's sales stage (leadState.salesStateOf) — tooltip only. */
  stage?: SalesStateView | null;
}) {
  /* The same list for both roles; a salesperson's options outside lead_set_stage's allowlist are
     shown disabled (the server refuses them anyway) — see src/lib/access.ts. */
  const perms = useLeadPermissions();
  if (disabled) return <OneStatusPill status={value} stage={stage} />;
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
          <SelectLabel className="text-[11px] font-normal text-muted-foreground">Pipeline status · now {pipelineStatusLabel(value)}</SelectLabel>
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
  return stage && stage.label !== pipe ? `${pipe} · sales stage: ${stage.label}${stage.detail ? ` (${stage.detail})` : ''}` : pipe;
}

/** The ONE pill, read-only (a row without edit rights, the phone card, a disabled Inbox row). */
export function OneStatusPill({ status, stage, compact }: { status: string | null | undefined; stage?: SalesStateView | null; compact?: boolean }) {
  return (
    <span className="inline-flex items-center" title={titleOf(status, stage)} data-testid="one-status">
      <PipelineStatusBadge status={(status as PipelineStatus) ?? undefined} compact={compact} />
    </span>
  );
}
