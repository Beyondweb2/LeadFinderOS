import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Facebook, ExternalLink, Search, Trash2, Loader2, Globe, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

interface FacebookSectionProps {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  compact?: boolean;
}

function extractCityFromAddress(address: string | null): string {
  if (!address) return '';
  // Try to get city-level info from address (usually after first comma or last meaningful part)
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1]; // usually city
  return parts[0] || '';
}

function isValidFacebookUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.includes('facebook.com') || parsed.hostname.includes('fb.com');
  } catch {
    return false;
  }
}

function normalizeFacebookUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    parsed.protocol = 'https:';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function FacebookSection({ lead, onUpdate, compact = false }: FacebookSectionProps) {
  const [pasteUrl, setPasteUrl] = useState('');
  const [isFinding, setIsFinding] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const { toast } = useToast();

  const hasFacebook = !!lead.facebook_url;

  const handleAutoFind = async () => {
    // Check if lead has a website URL - need to look at the lead data
    // The outreach_leads table doesn't have website_url, but the lead might have google_maps_url
    // We need the actual website. Check if lead has any website reference.
    // For now, we'll pass the google maps URL or check if there's a website field
    // Actually the search-leads function provides websiteUrl, but outreach_leads doesn't store it.
    // We should check if there's a website we can scan.
    
    // The lead doesn't store website URL directly. Show appropriate message.
    // Actually, let me check - the original lead data from search has websiteUrl but outreach_leads doesn't store it.
    // So we'll just try the business name + google search approach OR if they have a google maps URL we can try that.
    
    // For the edge function, we need a website URL. Since outreach_leads doesn't have one,
    // let's show a toast suggesting manual methods.
    toast({
      title: 'No website available',
      description: 'No website URL stored for this lead. Use Search Google or paste a URL manually.',
    });
  };

  const handleSearchGoogle = () => {
    const city = extractCityFromAddress(lead.address);
    const query = `"${lead.business_name}" "${city}" site:facebook.com`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  };

  const handleSearchFacebook = () => {
    window.open(`https://www.facebook.com/search/pages/?q=${encodeURIComponent(lead.business_name)}`, '_blank');
  };

  const handleSavePasted = async () => {
    const url = pasteUrl.trim();
    if (!url) return;
    if (!isValidFacebookUrl(url)) {
      toast({
        title: 'Invalid URL',
        description: 'Please paste a valid facebook.com or fb.com URL.',
        variant: 'destructive',
      });
      return;
    }
    const normalized = normalizeFacebookUrl(url);
    await onUpdate(lead.id, {
      facebook_url: normalized,
      facebook_method: 'manual',
      facebook_confidence: 100,
      facebook_last_checked_at: new Date().toISOString(),
    } as any);
    setPasteUrl('');
    setShowPaste(false);
    toast({ title: 'Facebook page saved' });
  };

  const handleClear = async () => {
    await onUpdate(lead.id, {
      facebook_url: null,
      facebook_method: null,
      facebook_confidence: null,
      facebook_last_checked_at: null,
    } as any);
    toast({ title: 'Facebook page removed' });
  };

  if (compact) {
    // Compact version for card view - just show icon + link if exists
    if (!hasFacebook) return null;
    return (
      <a
        href={lead.facebook_url!}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-blue-500 hover:text-blue-400 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="Open Facebook page"
      >
        <Facebook className="h-3 w-3" />
        <span className="truncate max-w-[100px]">
          {lead.facebook_url!.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/^https?:\/\/(www\.)?fb\.com\//, '')}
        </span>
      </a>
    );
  }

  // Full version for detail dialog
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Facebook className="h-4 w-4 text-blue-500" />
        <h4 className="text-sm font-semibold">Facebook Page</h4>
      </div>

      {hasFacebook ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
          <a
            href={lead.facebook_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:underline truncate max-w-[280px] flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {lead.facebook_url!.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleClear}>
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Not linked</span>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleSearchGoogle}>
              <Search className="h-3 w-3" /> Search Google
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleSearchFacebook}>
              <Facebook className="h-3 w-3" /> Search Facebook
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowPaste(!showPaste)}
            >
              <Globe className="h-3 w-3" /> Paste URL
            </Button>
          </div>
          {showPaste && (
            <div className="flex gap-1.5">
              <Input
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://facebook.com/..."
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSavePasted()}
              />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleSavePasted} disabled={!pasteUrl.trim()}>
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
