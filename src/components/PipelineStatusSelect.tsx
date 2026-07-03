import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PipelineStatusBadge } from './PipelineStatusBadge';
import { PIPELINE_STATUS_OPTIONS, type PipelineStatus } from '@/types/outreach';

/**
 * Editable pipeline-status control — the coloured PipelineStatusBadge as a Select
 * trigger over PIPELINE_STATUS_OPTIONS. Extracted from OutreachTable's inline block
 * so the Outreach row and the Inbox conversation list use the EXACT same control.
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
}) {
  if (disabled) return <PipelineStatusBadge status={(value as PipelineStatus) ?? undefined} />;
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onValueChange(v as PipelineStatus)}>
      <SelectTrigger
        className={triggerClassName ?? "w-auto h-auto p-0 border-0 bg-transparent focus:ring-0"}
        onClick={(e) => e.stopPropagation()}
        {...(triggerProps ?? {})}
      >
        <PipelineStatusBadge status={value as PipelineStatus} />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
