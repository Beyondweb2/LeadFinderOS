import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellRing, Circle, ClipboardCopy, Loader2, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import { IconTile, TONE, ToneChip } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { whatsAppLinkForLead } from '@/lib/conversationState';
import {
  clientInfoRequestMessage, NEED_PARAM, needParamValue, SELLER_ASK_NOTE,
  type ClientContactRoute, type ClientInfoRequestView, type MissingInfoItem, type SellerAskState,
} from '@/lib/clientMissingInfo';
import type { WhatsAppCapability } from '@/lib/whatsAppCapability';
import { cn } from '@/lib/utils';
import { KnownInfoFinder } from '@/components/KnownInfoFinder';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MISSING INFORMATION — one consolidated action area on a Paid Client (2026-10-05,
   docs/pre-sales-certification/client-missing-info-actions.md). What is missing (from the checklist),
   then the two ways to get it: ASK SALESPERSON (only when someone else sold it) and CONTACT CLIENT.
   Every value comes from paid-client-hub `get` → src/lib/clientMissingInfo.ts; nothing here decides.
   ⛔ NOTHING HERE SENDS A MESSAGE. Contact client opens the Inbox / an email draft / the number; Copy
   request puts a suggested message on the clipboard for Paul to edit and send himself.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface MissingInfoView {
  items: MissingInfoItem[];
  seller_items: string[];
  client_items: string[];
  ask: { state: SellerAskState; seller_name: string | null };
  request: ClientInfoRequestView;
  request_read_failed?: boolean;
  contact: { routes: ClientContactRoute[]; conversation: boolean; window_open: boolean; capability: WhatsAppCapability; contact_name: string | null };
}

const WHO: Record<string, string> = { sales: 'Sales', client: 'Client', findable: 'Findable' };
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '';

export function ClientMissingInfoPanel({ leadId, businessName, mi, setupLink, onChanged }: {
  leadId: string; businessName: string | null; mi: MissingInfoView; setupLink: string | null; onChanged: () => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  if (!mi.items.length) return null;

  const clientKeys = mi.client_items;
  const askState = mi.ask.state;
  const req = mi.request;
  const pending = req.state === 'pending' ? req : null;
  const seller = mi.ask.seller_name ?? 'the salesperson';
  const message = clientInfoRequestMessage({ contactName: mi.contact.contact_name, keys: clientKeys, setupLink: clientKeys.includes('onboarding') ? setupLink : null });

  const ask = async (remind: boolean) => {
    setBusy(remind ? 'remind' : 'ask');
    try {
      const r = await invokeEdge<{ ok: true; outcome: string; seller_name: string | null }>('paid-client-hub', { action: 'request_client_info', lead_id: leadId, remind });
      const who = r.seller_name ?? 'the salesperson';
      toast({
        title: r.outcome === 'created' ? `Asked ${who}` : r.outcome === 'reminded' ? `Reminded ${who}` : r.outcome === 'too_soon' ? 'Already reminded recently' : `Already requested from ${who}`,
        description: r.outcome === 'created' || r.outcome === 'reminded' ? 'They see it as CLIENT INFO NEEDED on their Sales page.' : undefined,
      });
      onChanged();
    } catch (e) {
      toast({ title: 'Not sent to the salesperson', description: edgeErrorMessage(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  /* History only ("opened", never "sent"); it never blocks the contact itself. */
  const recordOpened = (via: 'whatsapp' | 'email' | 'phone') => {
    void invokeEdge('paid-client-hub', { action: 'client_contact_opened', lead_id: leadId, via, items: clientKeys }).catch(() => undefined);
  };
  const copyRequest = async () => {
    try { await navigator.clipboard.writeText(message); toast({ title: 'Request copied', description: 'Edit it and send it yourself — nothing was sent.' }); }
    catch { toast({ title: 'Copy blocked by the browser', description: message, variant: 'destructive' }); }
  };
  const openInbox = () => {
    recordOpened('whatsapp');
    navigate(`${whatsAppLinkForLead(leadId)}&${NEED_PARAM}=${encodeURIComponent(needParamValue(clientKeys))}`);
  };
  const mailto = (email: string) =>
    `mailto:${email}?subject=${encodeURIComponent(`Your Findable setup${businessName ? ` — ${businessName}` : ''}`)}&body=${encodeURIComponent(message)}`;

  const routes = mi.contact.routes;
  const primary = routes[0] ?? null;
  const rest = routes.slice(1);
  const routeButton = (r: ClientContactRoute, main: boolean) => {
    const variant = main ? 'default' : 'outline';
    if (r.kind === 'whatsapp_thread' || r.kind === 'whatsapp_start') {
      return (
        <Button key={r.kind} size="sm" variant={variant} onClick={openInbox} data-testid="contact-client-whatsapp"
          title={r.kind === 'whatsapp_thread' ? 'Opens their WhatsApp conversation in the Inbox. Nothing is sent.' : 'No conversation yet — opens the Inbox, where the usual template and 24-hour rules decide what can be sent.'}>
          <MessageCircle className="mr-1 h-4 w-4" />{main ? 'Contact client' : 'WhatsApp'}{r.kind === 'whatsapp_start' ? ' · start on WhatsApp' : ''}
        </Button>
      );
    }
    if (r.kind === 'email') {
      return (
        <Button key="email" size="sm" variant={variant} asChild data-testid="contact-client-email">
          <a href={mailto(r.email)} onClick={() => recordOpened('email')} title={`Opens an email draft to ${r.email}. Nothing is sent until you send it.`}>
            <Mail className="mr-1 h-4 w-4" />{main ? 'Contact client · email' : 'Email'}
          </a>
        </Button>
      );
    }
    return (
      <Button key="phone" size="sm" variant={variant} asChild data-testid="contact-client-phone">
        <a href={`tel:${r.phone.replace(/\s+/g, '')}`} onClick={() => recordOpened('phone')} title={`Call ${r.phone}`}>
          <Phone className="mr-1 h-4 w-4" />{main ? `Contact client · call ${r.phone}` : `Call ${r.phone}`}
        </a>
      </Button>
    );
  };

  const canAsk = askState === 'ask' && !mi.request_read_failed;
  return (
    <div className={cn('min-w-0 space-y-3 rounded-2xl px-3.5 py-3', TONE.amber.tint)} data-testid="missing-info">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconTile icon={AlertTriangle} tone="amber" size="sm" />
        <p className={cn('text-sm font-bold tracking-wide', TONE.amber.text)}>MISSING INFORMATION</p>
        <ToneChip tone="amber" className="ml-auto">{mi.items.length}</ToneChip>
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="missing-info-items">
        {mi.items.map((i) => (
          <li key={i.key} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1" data-testid={`missing-${i.key}`}>
            <Circle className={cn('h-3.5 w-3.5 shrink-0', TONE.amber.text)} />
            <span className="font-medium">{i.label}</span>
            <ToneChip tone="amber">{WHO[i.who] ?? i.who}</ToneChip>
            {canAsk && i.seller && i.who !== 'sales' && <span className="text-xs text-muted-foreground">· {seller} may know</span>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {/* ASK SALESPERSON — only another, active salesperson's sale (sellerAskState). One open request. */}
        {canAsk && !pending && (
          <Button size="sm" onClick={() => void ask(false)} disabled={!!busy} data-testid="ask-salesperson">
            {busy === 'ask' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserRound className="mr-1 h-4 w-4" />}Ask salesperson
          </Button>
        )}
        {clientKeys.length > 0 && primary && routeButton(primary, true)}
        {clientKeys.length > 0 && rest.map((r) => routeButton(r, false))}
        {clientKeys.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => void copyRequest()} data-testid="copy-request" title="A short message asking for what is missing — you edit and send it.">
            <ClipboardCopy className="mr-1 h-4 w-4" />Copy request
          </Button>
        )}
        {/* Before asking anyone: what other forms, the crawl, the handoff and Quick Close already hold. */}
        <KnownInfoFinder leadId={leadId} onChanged={onChanged} />
      </div>

      {pending && (
        <p className="flex flex-wrap items-center gap-2 text-xs" data-testid="request-pending">
          <span className="font-medium">Requested from {seller}</span>
          <span className="text-muted-foreground">· {when(pending.requestedAt)}{pending.remindedAt ? ` · reminded ${when(pending.remindedAt)}` : ''}</span>
          {canAsk && (
            <Button size="sm" variant="ghost" className={cn('h-9 px-2 text-xs')} onClick={() => void ask(true)} disabled={!!busy || !pending.canRemind}
              title={pending.canRemind ? `Send ${seller} a reminder` : `You can remind again from ${when(pending.remindAt)}`} data-testid="remind-salesperson">
              {busy === 'remind' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <BellRing className="mr-1 h-3.5 w-3.5" />}Remind again
            </Button>
          )}
        </p>
      )}
      {req.state === 'answered' && <p className="text-xs text-muted-foreground" data-testid="request-answered">{seller} answered your request · {when(req.answeredAt)}</p>}
      {askState === 'seller_inactive' && <p className="text-xs text-muted-foreground">{SELLER_ASK_NOTE.seller_inactive} — contact the client directly.</p>}
      {mi.request_read_failed && askState === 'ask' && <p className="text-xs text-muted-foreground">Could not check for an earlier request — reload to ask the salesperson.</p>}
      {clientKeys.length > 0 && !primary && (
        <p className="text-xs text-muted-foreground" data-testid="no-contact-route">No phone or email on file for the client{setupLink ? ' — copy their setup link above and send it another way' : ''}.</p>
      )}
      {clientKeys.length > 0 && primary?.kind === 'whatsapp_start' && (
        <p className="text-xs text-muted-foreground">No WhatsApp conversation with them yet: the Inbox opens a new one, and the usual template and 24-hour rules apply.</p>
      )}
    </div>
  );
}
