import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Search, MessageSquare, BarChart3, ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

interface TrialConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noWebsiteCount?: number;
  totalFound?: number;
}

export function TrialConversionModal({ open, onOpenChange, noWebsiteCount = 0, totalFound = 0 }: TrialConversionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [delayedOpen, setDelayedOpen] = useState(false);
  const { session } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setDelayedOpen(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setDelayedOpen(false);
    }
  }, [open]);

  const handleStartTrial = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch {
      toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]">
        {/* Accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />

        <div className="px-7 pt-6 pb-7 sm:px-8 sm:pt-7 sm:pb-8 flex flex-col items-center">
          {/* Logo + Brand */}
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-5">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
            <div />
          </div>

          {/* Heading */}
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-2">
            <span className="text-foreground">Unlock </span>
            <span className="text-primary">Full Access</span>
          </DialogTitle>

          <p className="text-center text-sm text-muted-foreground leading-relaxed mb-5">
            You've found real businesses that need a website
          </p>

          {/* Metrics */}
          {(noWebsiteCount > 0 || totalFound > 0) && (
            <div className="w-full grid grid-cols-2 gap-3 mb-5">
              {noWebsiteCount > 0 && (
                <div className="flex flex-col items-center gap-1.5 py-3.5 px-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
                  <span className="text-2xl font-bold text-foreground">{noWebsiteCount}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground font-medium">Need a website</span>
                  </div>
                </div>
              )}
              {totalFound > 0 && (
                <div className="flex flex-col items-center gap-1.5 py-3.5 px-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
                  <span className="text-2xl font-bold text-foreground">{totalFound}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground font-medium">Hot leads found</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Value description */}
          <p className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-5">
            Start your 5-day free trial to unlock full details, contact businesses, and manage your outreach
          </p>

          {/* Benefits */}
          <div className="w-full space-y-2 mb-5">
            {[
              { icon: Search, text: 'Unlimited lead searches' },
              { icon: MessageSquare, text: 'Contact by call, SMS or WhatsApp' },
              { icon: BarChart3, text: 'Track outreach & close deals' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm text-foreground/90">
                <Icon className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Trust line */}
          <div className="w-full rounded-xl border border-border/30 bg-muted/20 px-4 py-3 mb-5">
            <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Card required to start your trial · <strong className="text-foreground/80">£0 today</strong> · Cancel anytime</span>
            </div>
          </div>

          {/* CTAs */}
          <Button
            className="w-full btn-premium font-semibold h-12 rounded-xl text-[15px] gap-2"
            onClick={handleStartTrial}
            disabled={isLoading}
          >
            <Lock className="h-4 w-4" />
            {isLoading ? 'Opening checkout...' : 'Start My 5-Day Free Trial'}
          </Button>

          <Button
            variant="ghost"
            className="w-full mt-2 text-sm text-muted-foreground/60 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>

          <p className="text-[11px] text-muted-foreground/50 text-center mt-3 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            Secure payment via Stripe · No charge today
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
