import { Mail, Facebook, Instagram, Globe, Loader2, Ban, Sparkles, Smartphone, PhoneOff } from 'lucide-react';
import { useEnrichBusiness } from '@/hooks/useEnrichBusiness';
import { cn } from '@/lib/utils';
import type { OutreachLead } from '@/types/outreach';

interface LeadEnrichButtonsProps {
  /**
   * Any OutreachLead-shaped object. On the Outreach row this is the real lead;
   * on a search result it's a lightweight pseudo-lead (synthetic id + place_id +
   * business_name) so the same Enrich engine works before the lead is saved.
   */
  lead: OutreachLead;
  /** Persist/mirror resolved fields. Outreach passes updateLead; search a local patcher. */
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  className?: string;
}

/**
 * Per-lead contact controls.
 *
 * HONESTY: contact icons are DISPLAY-ONLY links that render ONLY when a REAL,
 * verified value is stored on the lead (the fields enrich writes). There is NO
 * URL guessing/construction anywhere — a lead with no found contact shows no
 * contact icons, never a shown-but-dead link. The always-visible ✨ Enrich button
 * is the single way real contacts get found (enrich-business → Maps + Facebook).
 */
export function LeadEnrichButtons({ lead, onUpdate, className }: LeadEnrichButtonsProps) {
  const { enrich: enrichAll, enriching, limitReached } = useEnrichBusiness(lead, onUpdate);
  const lt = lead.line_type; // HLR line-type: WhatsApp-capability proxy

  // Real, stored contacts only — no constructed URLs.
  const contacts = [
    lead.email ? { key: 'email', Icon: Mail, href: `mailto:${lead.email}`, color: 'text-blue-500 hover:text-blue-400', title: `Email: ${lead.email}`, external: false } : null,
    lead.facebook_url ? { key: 'facebook', Icon: Facebook, href: lead.facebook_url, color: 'text-blue-600 hover:text-blue-500', title: `Facebook: ${lead.facebook_url}`, external: true } : null,
    lead.instagram_url ? { key: 'instagram', Icon: Instagram, href: lead.instagram_url, color: 'text-pink-500 hover:text-pink-400', title: `Instagram: ${lead.instagram_url}`, external: true } : null,
    lead.website ? { key: 'website', Icon: Globe, href: lead.website, color: 'text-emerald-500 hover:text-emerald-400', title: `Website: ${lead.website}`, external: true } : null,
  ].filter(Boolean) as { key: string; Icon: typeof Mail; href: string; color: string; title: string; external: boolean }[];

  return (
    <div className={cn('flex items-center gap-0.5', className)} onClick={(e) => e.stopPropagation()}>
      {/* Always visible: combined enrich (contacts + WhatsApp signal + image pool). */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!limitReached) enrichAll(); }}
        disabled={enriching || limitReached}
        title={limitReached ? 'Daily enrichment limit reached' : 'Enrich business — find real contacts, WhatsApp signal & photos'}
        className="p-1.5 rounded-md hover:bg-muted/40 transition-colors text-violet-500 hover:text-violet-400 disabled:opacity-60"
      >
        {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : limitReached ? <Ban className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </button>

      {/* WhatsApp-capability chip (HLR line-type): mobile → likely WhatsApp. */}
      {lt === 'mobile' && (
        <span title="Mobile — WhatsApp-capable (line-type check)" className="p-1.5 text-green-500"><Smartphone className="h-3.5 w-3.5" /></span>
      )}
      {(lt === 'landline' || lt === 'voip') && (
        <span title={`${lt} — not WhatsApp-capable`} className="p-1.5 text-muted-foreground/50"><PhoneOff className="h-3.5 w-3.5" /></span>
      )}

      {/* Verified contact links — only render when a real value exists. */}
      {contacts.map(({ key, Icon, href, color, title, external }) => (
        <a
          key={key}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className={`p-1.5 rounded-md hover:bg-muted/40 transition-colors ${color}`}
          title={title}
        >
          <Icon className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}
