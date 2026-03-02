import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, Users, MessageSquare, Star, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface OutreachProgressSummaryProps {
  businessesFound: number;
  addedToCrm: number;
  messagesSent: number;
  leadsTracked: number;
}

export function OutreachProgressSummary({
  businessesFound,
  addedToCrm,
  messagesSent,
  leadsTracked,
}: OutreachProgressSummaryProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = () => {
    const win = window.open('', '_blank');
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) throw error;
        if (data?.url) {
          if (win) win.location.href = data.url;
          else window.location.href = data.url;
          window.dispatchEvent(new CustomEvent('checkout-opened'));
        } else {
          win?.close();
        }
      } catch {
        win?.close();
        toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const stats = [
    { label: 'Businesses Found', value: businessesFound, icon: Search },
    { label: 'Added to Outreach', value: addedToCrm, icon: Users },
    { label: 'Messages Sent', value: messagesSent, icon: MessageSquare },
    { label: 'Leads Tracked', value: leadsTracked, icon: Star },
  ];

  return (
    <Card className="mt-6 border-primary/20 bg-primary/5">
      <CardContent className="p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">Your Outreach Progress So Far</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="text-center space-y-1">
                <Icon className="h-4 w-4 mx-auto text-primary/70" />
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">
            You've started building a real outreach pipeline.
            Unlock unlimited searches to keep growing your opportunities.
          </p>
          <Button
            size="lg"
            className="w-full"
            disabled={isLoading}
            onClick={handleUpgrade}
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
            ) : (
              <><CreditCard className="mr-2 h-4 w-4" />Unlock Unlimited Searches</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
