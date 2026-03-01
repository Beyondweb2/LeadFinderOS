import { MessageSquare, X } from 'lucide-react';

interface WhatsAppStatusBadgeProps {
  status: string | null | undefined;
  compact?: boolean;
}

export function WhatsAppStatusBadge({ status, compact }: WhatsAppStatusBadgeProps) {
  if (!status || status === 'unknown') return null;

  if (status === 'yes') {
    return (
      <span className={`inline-flex items-center gap-0.5 text-green-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`} title="Has WhatsApp">
        <MessageSquare className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        <span className="font-medium">WA</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-destructive/70 ${compact ? 'text-[9px]' : 'text-[10px]'}`}
      title="Not on WhatsApp"
    >
      <MessageSquare className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      <X className={compact ? 'h-2 w-2 -ml-1' : 'h-2.5 w-2.5 -ml-1'} strokeWidth={3} />
    </span>
  );
}
