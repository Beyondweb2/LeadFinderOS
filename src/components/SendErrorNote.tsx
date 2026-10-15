import { sendErrorCodeLabel, sendErrorLine, type SendChannel, type SendErrorParts } from '@/lib/sendErrorMeaning';
import { cn } from '@/lib/utils';

/* The provider's real error beside "Send failed" (2026-10-15): the raw code ALWAYS, then the one-line plain-English
   meaning (src/lib/sendErrorMeaning.ts), with Meta's own title and details on hover. Nothing when there is no error. */
export function SendErrorNote({ channel, parts, className }: { channel: SendChannel; parts: SendErrorParts | null | undefined; className?: string }) {
  const line = sendErrorLine(channel, parts);
  if (!line || !parts) return null;
  const hover = [parts.title, parts.details].filter(Boolean).join(' — ');
  return (
    <span className={cn('text-[11px]', className)} title={hover || undefined} data-send-error-code={parts.code ?? undefined}>
      {line}
    </span>
  );
}

/** "Send failed · Meta 131049" — the chip label with the raw code when there is one. */
export function sendFailedLabel(channel: SendChannel, parts: SendErrorParts | null | undefined): string {
  const code = sendErrorCodeLabel(channel, parts?.code ?? null);
  return code ? `Send failed · ${code}` : 'Send failed';
}
