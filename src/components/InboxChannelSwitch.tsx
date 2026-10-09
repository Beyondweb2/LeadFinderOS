import { useSearchParams } from 'react-router-dom';
import { Segmented } from '@/components/salesDash/primitives';
import { useLeadContactMethod, useSmsUnread } from '@/hooks/useSms';

/* ONE communications inbox, two channels (2026-10-09). WhatsApp stays exactly as it was; SMS is the other tab of the
   same page (/inbox?channel=sms), so a salesperson never has to know there are two systems. The SMS tab carries its own
   unread count, read through the same RLS scope as everything else (a rep only counts their own leads' texts).

   ⛔ A LEAD KEEPS ITS CHANNEL. When the page is opened for a lead (/inbox?lead=<id>) without a channel in the address, the
   channel is the lead's Contact Method: a lead on Text opens on the SMS tab, anything else on WhatsApp — wherever the link
   came from (a notification, the Outreach row, a campaign). An explicit ?channel= always wins, so the switch still works. */
export type InboxChannel = 'whatsapp' | 'sms';

export function useInboxChannel(): InboxChannel {
  const [params] = useSearchParams();
  const explicit = params.get('channel');
  const lead = params.get('lead');
  const method = useLeadContactMethod(!explicit && lead ? lead : null);
  if (explicit === 'sms') return 'sms';
  if (explicit === 'whatsapp') return 'whatsapp';
  return method === 'sms' ? 'sms' : 'whatsapp';
}

export function InboxChannelSwitch({ current }: { current: InboxChannel }) {
  const [, setParams] = useSearchParams();
  const unread = useSmsUnread();
  const smsUnread = (unread.data ?? []).reduce((n, u) => n + (u.unread_messages || 0), 0);
  return (
    <Segmented<InboxChannel>
      label="Inbox channel" value={current}
      onChange={(k) => setParams((p) => { const n = new URLSearchParams(p); n.delete('lead'); n.delete('phone'); n.set('channel', k); return n; })}
      options={[
        { key: 'whatsapp', label: 'WhatsApp', tone: 'green' },
        { key: 'sms', label: 'SMS', tone: 'blue', count: smsUnread > 0 ? smsUnread : undefined },
      ]}
    />
  );
}
