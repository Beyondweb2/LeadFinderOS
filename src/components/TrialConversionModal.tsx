import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Search, MessageSquare, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TrialConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noWebsiteCount?: number;
  totalFound?: number;
}

export function TrialConversionModal({ open, onOpenChange, noWebsiteCount = 0, totalFound = 0 }: TrialConversionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { session } = useAuth();
  const { toast } = useToast();

  const handleStartTrial = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch {
      toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card p-0 overflow-hidden">
        {/* Header accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />
        
        <div className="px-6 pt-5 pb-6 space-y-5">
          {/* Headline */}
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Start your 5-day free trial to unlock these leads
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You've found businesses that need a website.
              Start your free trial to see contact details, reach out instantly, and track your outreach.
            </p>
          </div>

          {/* Stats row */}
          {(noWebsiteCount > 0 || totalFound > 0) && (
            <div className="flex justify-center gap-6 py-3 px-4 rounded-lg bg-muted/30 border border-border/50">
              {totalFound > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{totalFound}</p>
                  <p className="text-[11px] text-muted-foreground">Found</p>
                </div>
              )}
              {noWebsiteCount > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{noWebsiteCount}</p>
                  <p className="text-[11px] text-muted-foreground">Need a website</p>
                </div>
              )}
            </div>
          )}

          {/* Benefits */}
          <div className="space-y-2.5">
            {[
              { icon: Search, text: 'Unlimited lead searches' },
              { icon: MessageSquare, text: 'Contact by call, SMS or WhatsApp' },
              { icon: BarChart3, text: 'Track outreach & close deals' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm text-foreground/90">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="space-y-2.5 pt-1">
            <Button
              className="w-full btn-premium font-semibold h-11 text-sm gap-2"
              onClick={handleStartTrial}
              disabled={isLoading}
            >
              <Sparkles className="h-4 w-4" />
              {isLoading ? 'Opening checkout...' : 'Start Free Trial'}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Maybe later
            </Button>
            <p className="text-[11px] text-muted-foreground/70 text-center">
              5-day free trial · £0 today · Cancel anytime
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
