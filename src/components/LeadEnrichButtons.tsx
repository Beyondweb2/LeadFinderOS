import { Mail, Facebook, Instagram, Loader2, Ban } from 'lucide-react';
import { useEnrichLead, type EnrichType } from '@/hooks/useEnrichLead';
import type { OutreachLead } from '@/types/outreach';

interface LeadEnrichButtonsProps {
  /**
   * Any OutreachLead-shaped object. On the Outreach row this is the real lead;
   * on a search result it's a lightweight pseudo-lead (synthetic id + place_id +
   * business_name + website) so the same engine works before the lead is saved.
   */
  lead: OutreachLead;
  /** Persist/mirror the resolved fields. Outreach passes updateLead; search passes a local-state patcher. */
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  className?: string;
}

type TypeConfig = {
  type: EnrichType;
  label: string;
  Icon: typeof Mail;
  value: string | null | undefined;
  href: string | null;
  status: string | null | undefined;
  /** Tailwind text colour for the "found" link state. */
  color: string;
};

/**
 * Compact, per-type contact-enrichment control reused on BOTH the search results
 * and the Outreach row. Each type (email | facebook | instagram) is its own
 * single button = its own single (cost-efficient) enrich-lead call, fired ONLY
 * on click — never auto-fetched. Once a value is found it renders as a clickable
 * icon/link instead of a button.
 */
export function LeadEnrichButtons({ lead, onUpdate, className }: LeadEnrichButtonsProps) {
  const { enrich, enriching, limitReached } = useEnrichLead(lead, onUpdate);

  const types: TypeConfig[] = [
    {
      type: 'email',
      label: 'Email',
      Icon: Mail,
      value: lead.email,
      href: lead.email ? `mailto:${lead.email}` : null,
      status: lead.email_status,
      color: 'text-blue-500 hover:text-blue-400',
    },
    {
      type: 'facebook',
      label: 'Facebook',
      Icon: Facebook,
      value: lead.facebook_url,
      href: lead.facebook_url ?? null,
      status: lead.facebook_status,
      color: 'text-blue-600 hover:text-blue-500',
    },
    {
      type: 'instagram',
      label: 'Instagram',
      Icon: Instagram,
      value: lead.instagram_url,
      href: lead.instagram_url ?? null,
      status: lead.instagram_status,
      color: 'text-pink-500 hover:text-pink-400',
    },
  ];

  return (
    <div className={`flex items-center gap-0.5 ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
      {types.map(({ type, label, Icon, value, href, status, color }) => {
        // ── Found: clickable icon/link ──
        if (value && href) {
          const isEmail = type === 'email';
          return (
            <a
              key={type}
              href={href}
              {...(isEmail ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className={`p-1.5 rounded-md hover:bg-muted/40 transition-colors ${color}`}
              title={`${label}: ${value}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </a>
          );
        }

        // ── Not found yet: enrich button ──
        const isBusy = enriching === type;
        const isError = status === 'error';
        const isNone = status === 'none';
        const title = limitReached
          ? 'Daily enrichment limit reached'
          : isError
            ? `${label} lookup failed — click to retry`
            : isNone
              ? `No ${label} found — click to retry`
              : `Find ${label}`;

        const stateColor = limitReached
          ? 'text-amber-500'
          : isError
            ? 'text-destructive hover:text-destructive'
            : 'text-muted-foreground/50 hover:text-foreground';

        return (
          <button
            key={type}
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!limitReached) enrich(type); }}
            disabled={isBusy || limitReached}
            title={title}
            className={`p-1.5 rounded-md hover:bg-muted/40 transition-colors disabled:opacity-60 ${stateColor}`}
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : limitReached ? (
              <Ban className="h-3.5 w-3.5" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
