import { CheckCircle2, Circle, KeyRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useOnboardingLink } from '@/hooks/useOnboardingLink';
import { OnboardingLinkStatusLine } from '@/components/OnboardingLinkCard';
import { isPaidLead } from '@/lib/leadPayment';
import { GBP_MANAGER_EMAIL } from '@/lib/findableOffer';
import { GBP_ACCESS_CHECKLIST_KEY, gbpClientSaysLabel } from '@/lib/deliveryCockpit';
import type { OutreachLead } from '@/types/outreach';

/* THE CLIENT'S ONBOARDING AT A GLANCE (admin, Client tab, 2026-09-28). Sign-up link sent → opened →
   paid → Google Business Profile access, in three states that are NEVER merged:
     1. requested  — the paid page showed the instructions (gbp_access_requested_at);
     2. client says — what THEY answered there (gbp_status: invited / later / can't get in);
     3. confirmed  — a person at Findable accepted the Manager invite (the delivery checklist tick).
   "I've invited you" is the client's claim, not access; only (3) is. Nothing here verifies Google. */
export function ClientOnboardingStrip({ lead, row, onUpdateLead }: {
  lead: OutreachLead;
  row: { gbp_status?: string | null; gbp_status_at?: string | null; gbp_access_requested_at?: string | null; status?: string | null } | null;
  onUpdateLead: (leadId: string, updates: Partial<OutreachLead>) => Promise<OutreachLead | null> | void;
}) {
  const link = useOnboardingLink(lead.id);
  const paid = isPaidLead(lead);
  const checklist = (lead.delivery_checklist ?? {}) as Record<string, boolean>;
  const confirmed = checklist[GBP_ACCESS_CHECKLIST_KEY] === true;
  const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null);
  const Dot = ({ on }: { on: boolean }) => (on ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />);
  return (
    <div className="mb-3 space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs" data-testid="client-onboarding-strip">
      <div className="flex items-start gap-2"><Dot on={(link.data?.status.sentCount ?? 0) > 0} /><div className="min-w-0"><span className="font-medium">Sign-up link</span><OnboardingLinkStatusLine status={link.data?.status} /></div></div>
      <div className="flex items-center gap-2"><Dot on={paid} /><span className="font-medium">Paid</span><span className="text-muted-foreground">{paid ? 'Yes' : 'Not yet'}</span></div>
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-3.5 w-3.5 text-primary" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">Google Business Profile access <span className="font-normal text-muted-foreground">(Manager, {GBP_MANAGER_EMAIL})</span></p>
          <p><span className="text-muted-foreground">Asked: </span>{row?.gbp_access_requested_at ? `shown after payment, ${day(row.gbp_access_requested_at)}` : paid ? 'paid before this was recorded, check the welcome pack was sent' : 'not yet (asked after payment)'}</p>
          <p><span className="text-muted-foreground">Client says: </span>{gbpClientSaysLabel(row?.gbp_status)}{row?.gbp_status_at ? ` · ${day(row.gbp_status_at)}` : ''}</p>
          <label className="flex cursor-pointer items-center gap-2 pt-0.5">
            <Checkbox checked={confirmed} disabled={!paid} onCheckedChange={(v) => void onUpdateLead(lead.id, { delivery_checklist: { ...checklist, [GBP_ACCESS_CHECKLIST_KEY]: v === true } } as Partial<OutreachLead>)} />
            <span className={confirmed ? 'font-medium text-emerald-600 dark:text-emerald-400' : ''}>{confirmed ? 'Access confirmed by Findable' : 'Tick when you have accepted their invite'}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
