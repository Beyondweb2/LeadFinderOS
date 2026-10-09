import { useSearchParams } from 'react-router-dom';
import { Segmented } from '@/components/salesDash/primitives';
import { useSmsUnread } from '@/hooks/useSms';

/* ONE communications inbox, two channels (2026-10-09). WhatsApp stays exactly as it was; SMS is the other tab of the
   same page (/inbox?channel=sms), so a salesperson never has to know there are two systems. The SMS tab carries its own
   unread count, read through the same RLS scope as everything else (a rep only counts their own leads' texts). */
export type InboxChannel = 'whatsapp' | 'sms';

export function useInboxChannel(): InboxChannel {
  const [params] = useSearchParams();
  return params.get('channel') === 'sms' ? 'sms' : 'whatsapp';
}

export function InboxChannelSwitch({ current }: { current: InboxChannel }) {
  const [, setParams] = useSearchParams();
  const unread = useSmsUnread();
  const smsUnread = (unread.data ?? []).reduce((n, u) => n + (u.unread_messages || 0), 0);
  return (
    <Segmented<InboxChannel>
      label="Inbox channel" value={current}
      onChange={(k) => setParams((p) => { const n = new URLSearchParams(p); n.delete('lead'); n.delete('phone'); if (k === 'sms') n.set('channel', 'sms'); else n.delete('channel'); return n; })}
      options={[
        { key: 'whatsapp', label: 'WhatsApp', tone: 'green' },
        { key: 'sms', label: 'SMS', tone: 'blue', count: smsUnread > 0 ? smsUnread : undefined },
      ]}
    />
  );
}
