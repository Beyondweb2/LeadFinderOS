import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OutreachLead } from '@/types/outreach';

type SocialDomain = 'facebook.com' | 'instagram.com';

/**
 * Normalise + validate a pasted social URL (HONESTY: never store junk).
 * - empty           → { cleared: true }
 * - wrong domain /  → { error }
 *   unparseable
 * - valid           → { url } (https:// prepended if missing, trimmed)
 */
function normalizeSocial(raw: string, domain: SocialDomain): { url?: string; cleared?: boolean; error?: string } {
  const v = raw.trim();
  if (!v) return { cleared: true };
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let host = '';
  try {
    host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { error: 'Not a valid URL' };
  }
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    return { error: `Must be a ${domain.split('.')[0]} link` };
  }
  return { url: withProto };
}

interface ContactUrlPopoverProps {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown>;
}

/**
 * Manual Facebook/Instagram URL paste for a lead (2C). Stores the URL exactly as
 * a verified value (method 'manual', status 'found') — the same shape enrichment
 * writes — so the display-only contact icons appear and ✨ Enrich feeds these
 * URLs into the FB/IG scrapers. Handles no-website businesses whose socials Maps
 * doesn't auto-link. Save-only: the operator presses Enrich when ready (keeps the
 * Apify cost explicit). No backend change — uses the existing onUpdate persist path.
 */
export function ContactUrlPopover({ lead, onUpdate }: ContactUrlPopoverProps) {
  const [open, setOpen] = useState(false);
  const [fb, setFb] = useState(lead.facebook_url ?? '');
  const [ig, setIg] = useState(lead.instagram_url ?? '');
  const [fbErr, setFbErr] = useState<string | null>(null);
  const [igErr, setIgErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed from the (possibly enriched) lead each time the popover opens.
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setFb(lead.facebook_url ?? '');
      setIg(lead.instagram_url ?? '');
      setFbErr(null);
      setIgErr(null);
    }
    setOpen(o);
  };

  const save = async () => {
    const f = normalizeSocial(fb, 'facebook.com');
    const i = normalizeSocial(ig, 'instagram.com');
    setFbErr(f.error ?? null);
    setIgErr(i.error ?? null);
    if (f.error || i.error) return;

    const patch: Partial<OutreachLead> = {};
    if (f.url) Object.assign(patch, { facebook_url: f.url, facebook_status: 'found', facebook_method: 'manual' });
    else if (f.cleared && lead.facebook_url) Object.assign(patch, { facebook_url: null, facebook_status: 'none' });
    if (i.url) Object.assign(patch, { instagram_url: i.url, instagram_status: 'found', instagram_method: 'manual' });
    else if (i.cleared && lead.instagram_url) Object.assign(patch, { instagram_url: null, instagram_status: 'none' });

    if (Object.keys(patch).length) {
      setSaving(true);
      try {
        await onUpdate(lead.id, patch);
      } finally {
        setSaving(false);
      }
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Add / edit Facebook or Instagram URL"
          className="p-1.5 rounded-md hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <p className="text-sm font-medium">Add social profile URLs</p>
          <div className="space-y-1">
            <Label htmlFor={`fb-${lead.id}`} className="text-xs">Facebook</Label>
            <Input
              id={`fb-${lead.id}`}
              value={fb}
              onChange={(e) => setFb(e.target.value)}
              placeholder="https://facebook.com/…"
              className="h-8 text-sm"
            />
            {fbErr && <p className="text-xs text-destructive">{fbErr}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ig-${lead.id}`} className="text-xs">Instagram</Label>
            <Input
              id={`ig-${lead.id}`}
              value={ig}
              onChange={(e) => setIg(e.target.value)}
              placeholder="https://instagram.com/…"
              className="h-8 text-sm"
            />
            {igErr && <p className="text-xs text-destructive">{igErr}</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">Saved as verified — then press ✨ Enrich to pull photos &amp; email.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
