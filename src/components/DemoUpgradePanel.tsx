import { useState } from 'react';
import { Check, Lock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSubscription } from '@/hooks/useSubscription';

const UPGRADE_BENEFITS = [
  'Unlimited searches',
  'Full outreach tracking',
  'WhatsApp & SMS messaging',
  'CRM pipeline access',
];

export function DemoUpgradePanel() {
  const { createCheckout } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    setIsLoading(true);
    try { await createCheckout(); } catch { setIsLoading(false); }
  };

  return (
    <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-6 sm:p-8 text-center space-y-5">
        <div className="inline-flex p-3 rounded-full bg-primary/10 border border-primary/20">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            Free access complete
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
            Upgrade now to unlock unlimited searches and continue finding new clients without limits.
          </p>
        </div>

        <ul className="flex flex-col items-start gap-2.5 max-w-xs mx-auto">
          {UPGRADE_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2.5 text-sm text-foreground">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <Button size="lg" className="btn-premium font-semibold px-8 h-auto py-3" onClick={handleCheckout} disabled={isLoading}>
          <CreditCard className="mr-2 h-4 w-4" />
          Unlock unlimited — £19.99/month
        </Button>

        <p className="text-xs text-muted-foreground">Cancel anytime</p>
      </CardContent>
    </Card>
  );
}
