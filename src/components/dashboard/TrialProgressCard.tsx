import { useState, useEffect } from 'react';
import { Unlock, Target, Users, MessageSquare, Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface TrialProgressCardProps {
  trialEnd: string | null;
  noWebsiteBusinesses: number;
  addedToCRM: number;
  searchesToday?: number;
  totalLeadsAdded?: number;
}

function useCountdown(trialEnd: string | null) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!trialEnd) return;

    const update = () => {
      const now = new Date().getTime();
      const end = new Date(trialEnd).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setTimeLeft(`Ends in ${hours}h`);
      } else {
        setTimeLeft(`Ends in ${minutes}m`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [trialEnd]);

  return timeLeft;
}

export function TrialProgressCard({
  trialEnd,
  noWebsiteBusinesses,
  addedToCRM,
}: TrialProgressCardProps) {
  const countdown = useCountdown(trialEnd);
  const { user } = useAuth();
  const [messagesSent, setMessagesSent] = useState(0);
  const [trackedCount, setTrackedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Fetch messages sent from user_metrics
    supabase
      .from('user_metrics')
      .select('messages_sent_count')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMessagesSent(data.messages_sent_count || 0);
      });
    // Fetch tracked leads count
    supabase
      .from('outreach_leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_potential_work', true)
      .eq('is_archived', false)
      .then(({ count }) => {
        setTrackedCount(count || 0);
      });
  }, [user]);

  const stats = [
    { label: 'No website', value: noWebsiteBusinesses, icon: Target, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'In Outreach', value: addedToCRM, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Msgs sent', value: messagesSent, icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Tracked', value: trackedCount, icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Unlock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Full Access</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {countdown || '...'}
        </span>
      </div>

      {/* 4-stat grid */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 py-2 rounded-md bg-muted/30">
            <div className={`p-1.5 rounded-md ${s.bg}`}>
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
            </div>
            <span className="text-base font-bold">{s.value}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
