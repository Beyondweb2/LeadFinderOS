import { Pill } from '@/components/ui/pill';
import type { ContactMethod } from '@/types/outreach';

interface ContactMethodBadgeProps {
  method: ContactMethod | null | undefined;
  compact?: boolean;
}

const methodConfig: Record<string, { label: string; shortLabel: string; className: string }> = {
  call: {
    label: 'Call',
    shortLabel: 'Call',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WA',
    className: 'bg-green-500/20 text-green-400 border-green-500/40',
  },
  facebook_msg: {
    label: 'Messenger',
    shortLabel: 'FB',
    className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
  },
};

const defaultConfig = {
  label: 'Contact',
  shortLabel: 'Contact',
  className: 'bg-muted text-muted-foreground border-border/50',
};

export function ContactMethodBadge({ method, compact }: ContactMethodBadgeProps) {
  const config = method ? (methodConfig[method] ?? defaultConfig) : defaultConfig;

  if (compact) {
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-md border inline-flex items-center ${config.className}`}>
        {config.shortLabel}
      </span>
    );
  }

  return (
    <Pill variant={config.className}>
      {config.label}
    </Pill>
  );
}
