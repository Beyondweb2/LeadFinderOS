import { Mail, Facebook, Instagram, Globe, Loader2, Ban, Sparkles, Smartphone, PhoneOff, MoreHorizontal } from 'lucide-react';
import { useEnrichBusiness } from '@/hooks/useEnrichBusiness';
import { cn } from '@/lib/utils';
import { socialKindOf } from '@/lib/socialUrl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  /**
   * Find Leads declutter: render the paid Enrich trigger (and, if provided, a
   * Check-for-a-website action) inside a "⋯" overflow menu, keeping the found
   * contact icons + WhatsApp chip inline. Default (false) keeps the original
   * inline ✨ layout — so the Outreach row/card is unchanged.
   */
  overflowMenu?: boolean;
  /** Overflow mode only: fire the on-demand website check for this lead. */
  onCheckWebsite?: () => void;
  /** Overflow mode only: whether the Check-for-website item should be offered. */
  checkWebsiteAvailable?: boolean;
  /** Overflow mode only: website check in progress. */
  checkingWebsite?: boolean;
}

/**
 * Per-lead contact controls.
 *
 * HONESTY: contact icons are DISPLAY-ONLY links that render ONLY when a REAL,
 * verified value is stored on the lead (the fields enrich writes). There is NO
 * URL guessing/construction anywhere — a lead with no found contact shows no
 * contact icons, never a shown-but-dead link. Enrich (paid) is the single way real
 * contacts get found (enrich-business → Maps + Facebook).
 */
export function LeadEnrichButtons({
  lead,
  onUpdate,
  className,
  overflowMenu = false,
  onCheckWebsite,
  checkWebsiteAvailable = false,
  checkingWebsite = false,
}: LeadEnrichButtonsProps) {
  const { enrich: enrichAll, enriching, limitReached } = useEnrichBusiness(lead, onUpdate);
  const lt = lead.line_type; // HLR line-type: WhatsApp-capability proxy

  // The "website" field is often actually a social link (a Maps listing whose only
  // "website" is the business's Facebook/Instagram). Show it with the matching social
  // icon — never the generic Globe — and skip it when we already have that social
  // from enrichment (no duplicate icon). Globe renders only for a real website.
  const websiteSocial = socialKindOf(lead.website);
  const websiteItem = !lead.website
    ? null
    : websiteSocial === 'facebook'
      ? (lead.facebook_url ? null : { key: 'website', Icon: Facebook, href: lead.website, color: 'text-blue-600 hover:text-blue-500', title: `Facebook: ${lead.website}`, external: true })
      : websiteSocial === 'instagram'
        ? (lead.instagram_url ? null : { key: 'website', Icon: Instagram, href: lead.website, color: 'text-pink-500 hover:text-pink-400', title: `Instagram: ${lead.website}`, external: true })
        : { key: 'website', Icon: Globe, href: lead.website, color: 'text-emerald-500 hover:text-emerald-400', title: `Website: ${lead.website}`, external: true };

  // Real, stored contacts only — no constructed URLs.
  const contacts = [
    lead.email ? { key: 'email', Icon: Mail, href: `mailto:${lead.email}`, color: 'text-blue-500 hover:text-blue-400', title: `Email: ${lead.email}`, external: false } : null,
    lead.facebook_url ? { key: 'facebook', Icon: Facebook, href: lead.facebook_url, color: 'text-blue-600 hover:text-blue-500', title: `Facebook: ${lead.facebook_url}`, external: true } : null,
    lead.instagram_url ? { key: 'instagram', Icon: Instagram, href: lead.instagram_url, color: 'text-pink-500 hover:text-pink-400', title: `Instagram: ${lead.instagram_url}`, external: true } : null,
    websiteItem,
  ].filter(Boolean) as { key: string; Icon: typeof Mail; href: string; color: string; title: string; external: boolean }[];

  // WhatsApp-capability chip (HLR line-type): mobile → likely WhatsApp.
  const whatsappChip = lt === 'mobile'
    ? <span key="wa" title="Mobile — WhatsApp-capable (line-type check)" className="p-1.5 text-green-500"><Smartphone className="h-3.5 w-3.5" /></span>
    : (lt === 'landline' || lt === 'voip')
      ? <span key="wa" title={`${lt} — not WhatsApp-capable`} className="p-1.5 text-muted-foreground/50"><PhoneOff className="h-3.5 w-3.5" /></span>
      : null;

  const contactLinks = contacts.map(({ key, Icon, href, color, title, external }) => (
    <a
      key={key}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`p-1.5 rounded-md hover:bg-muted/40 transition-colors ${color}`}
      title={title}
    >
      <Icon className="h-3.5 w-3.5" />
    </a>
  ));

  // ── Overflow-menu layout (Find Leads): contacts + chip inline, paid triggers in ⋯ ──
  if (overflowMenu) {
    return (
      <div className={cn('flex items-center gap-0.5', className)} onClick={(e) => e.stopPropagation()}>
        {whatsappChip}
        {contactLinks}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="More actions"
              className="p-1.5 rounded-md hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
            >
              {enriching || checkingWebsite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem
              disabled={enriching || limitReached}
              onClick={(e) => { e.preventDefault(); if (!limitReached) enrichAll(); }}
            >
              {limitReached ? <Ban className="mr-2 h-3.5 w-3.5" /> : <Sparkles className="mr-2 h-3.5 w-3.5 text-violet-500" />}
              {limitReached
                ? 'Daily enrichment limit reached'
                : 'Enrich — find email, Facebook, Instagram & WhatsApp signal (~$0.035)'}
            </DropdownMenuItem>
            {onCheckWebsite && checkWebsiteAvailable && (
              <DropdownMenuItem
                disabled={checkingWebsite}
                onClick={(e) => { e.preventDefault(); onCheckWebsite(); }}
              >
                <Globe className="mr-2 h-3.5 w-3.5" />
                Check for a website (~$0.02)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // ── Default layout (Outreach): inline ✨ Enrich + chip + contacts (unchanged) ──
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
      {whatsappChip}
      {contactLinks}
    </div>
  );
}
