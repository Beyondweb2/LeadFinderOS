import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SELLER_WEBSITE_CONTROL_VALUES, type SellerWebsiteControl } from '@/lib/clientMissingInfo';
import { WEBSITE_CONTROL_OPTIONS } from '@/lib/salesCrm';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT DETAILS FOR PAUL — what the SELLER collected during the sale, after payment (2026-10-05,
   client missing-info actions). Four fields only: services, areas, website (only when none is on
   file), who controls the website. Saved by fn quick-close `save_client_info` onto the SAME lead fields
   the setup checklist reads "from Sales" — so Paul's setup updates the moment this is saved. It only
   adds: a blank box leaves what is there alone.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface SellerClientInfo { canEdit: boolean; services: string[]; service_areas: string[]; website: string | null; website_control: string | null }

const CONTROL_LABEL = new Map<string, string>(WEBSITE_CONTROL_OPTIONS.map((o) => [o.value, o.label]));

export function SellerClientInfoForm({ info, onSave, busy }: {
  info: SellerClientInfo;
  onSave: (v: { services?: string; service_areas?: string; website?: string; website_control?: SellerWebsiteControl }) => Promise<boolean>;
  busy: boolean;
}) {
  const [services, setServices] = useState('');
  const [areas, setAreas] = useState('');
  const [website, setWebsite] = useState('');
  const [control, setControl] = useState<SellerWebsiteControl | ''>('');
  const dirty = !!(services.trim() || areas.trim() || website.trim() || control);
  const save = async () => {
    const ok = await onSave({
      ...(services.trim() ? { services } : {}), ...(areas.trim() ? { service_areas: areas } : {}),
      ...(website.trim() ? { website } : {}), ...(control ? { website_control: control } : {}),
    });
    if (ok) { setServices(''); setAreas(''); setWebsite(''); setControl(''); }
  };
  const field = 'mt-1 h-11 text-base';
  return (
    <div className="space-y-3 text-sm" data-testid="seller-client-info">
      <label className="block font-medium">Main services
        <span className="block text-xs font-normal text-muted-foreground">{info.services.length ? `On file: ${info.services.join(', ')}` : 'Nothing on file yet'} · separate with commas</span>
        {info.canEdit && <Input className={field} value={services} onChange={(e) => setServices(e.target.value)} placeholder="e.g. boiler repairs, bathroom fitting" />}
      </label>
      <label className="block font-medium">Towns and areas they cover
        <span className="block text-xs font-normal text-muted-foreground">{info.service_areas.length ? `On file: ${info.service_areas.join(', ')}` : 'Nothing on file yet'} · separate with commas</span>
        {info.canEdit && <Input className={field} value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="e.g. Portsmouth, Fareham, Havant" />}
      </label>
      <label className="block font-medium">Current website
        <span className="block text-xs font-normal text-muted-foreground">{info.website ? `On file: ${info.website} (ask Paul to change it)` : 'Nothing on file yet'}</span>
        {info.canEdit && !info.website && <Input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. portsmouthplumbing.co.uk" inputMode="url" />}
      </label>
      <label className="block font-medium">Who controls the website
        <span className="block text-xs font-normal text-muted-foreground">{info.website_control && info.website_control !== 'unknown' ? `On file: ${CONTROL_LABEL.get(info.website_control) ?? info.website_control}` : 'Not known yet'}</span>
        {info.canEdit && (
          <select className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base" value={control} onChange={(e) => setControl(e.target.value as SellerWebsiteControl | '')}>
            <option value="">— choose —</option>
            {SELLER_WEBSITE_CONTROL_VALUES.map((v) => <option key={v} value={v}>{CONTROL_LABEL.get(v) ?? v}</option>)}
          </select>
        )}
      </label>
      {info.canEdit && (
        <Button className="h-11 w-full" onClick={() => void save()} disabled={!dirty || busy}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save client details for Paul
        </Button>
      )}
    </div>
  );
}
