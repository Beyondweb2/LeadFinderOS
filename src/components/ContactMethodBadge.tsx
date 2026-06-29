import { Badge } from '@/components/ui/badge';
import type { ContactMethod } from '@/types/outreach';

interface ContactMethodBadgeProps {
  method: ContactMethod | null | undefined;
  compact?: boolean;
}

const methodConfig: Record<string, { label: string; shortLabel: string; className: string }> = {
  call: {
    label: 'Call',
    shortLabel: 'Call',
    className: 'bg-[hsl(var(--badge-call))] text-[hsl(var(--badge-call-fg))] border-transparent font-semibold',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-[hsl(var(--badge-sms))] text-[hsl(var(--badge-sms-fg))] border-transparent font-semibold',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WA',
    className: 'bg-[hsl(var(--badge-whatsapp))] text-[hsl(var(--badge-whatsapp-fg))] border-transparent font-semibold',
  },
  facebook_msg: {
    label: 'Messenger',
    shortLabel: 'FB',
    className: 'bg-[hsl(var(--badge-facebook))] text-[hsl(var(--badge-facebook-fg))] border-transparent font-semibold',
  },
  email: {
    label: 'Email',
    shortLabel: 'Email',
    className: 'bg-sky-600 text-white border-transparent font-semibold',
  },
};

const defaultConfig = {
  label: 'Contact',
  shortLabel: 'Contact',
  className: 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent font-semibold',
};

export function ContactMethodBadge({ method, compact }: ContactMethodBadgeProps) {
  const config = method ? (methodConfig[method] ?? defaultConfig) : defaultConfig;

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${compact ? 'text-[10px] px-1.5 py-0 rounded-md' : ''}`}
    >
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
