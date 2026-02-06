import { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Crown, Clock, Zap, Shield, Users, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { subscribed, isLoading: subLoading, status, openCustomerPortal, createCheckout } = useSubscription();
  const { isOnTrial, trialExpired, planStatus, isLoading: trialLoading } = useTrial();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const isLoading = subLoading || trialLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Allow access if subscribed OR on active trial
  if (subscribed || isOnTrial) {
    return <>{children}</>;
  }

  // Handle back to login (sign out first to prevent redirect loop)
  const handleBackToLogin = async () => {
    await signOut();
    navigate('/auth');
  };

  // Show cancelled message for cancelled subscriptions
  if (status === 'canceled' || status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="max-w-lg mx-auto text-center p-8">
          <div className="inline-flex p-4 rounded-full bg-destructive/10 mb-6">
            <Clock className="h-12 w-12 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Subscription Cancelled</h1>
          <p className="text-muted-foreground mb-8 text-lg">
            Your subscription has been cancelled. Resubscribe to regain access to LeadFinder Pro.
          </p>
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => openCustomerPortal()}>
              <Crown className="h-4 w-4 mr-2" />
              Manage Subscription
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/subscribe')}>
              View Plans
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBackToLogin} className="mt-2">
              <LogOut className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show full-screen upgrade prompt for expired trials
  if (trialExpired || planStatus === 'expired') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl mx-auto text-center">
            {/* Header */}
            <div className="inline-flex p-5 rounded-full bg-primary/10 mb-8">
              <Crown className="h-16 w-16 text-primary" />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Your Free Trial Has Ended
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
              Upgrade to LeadFinder Pro to unlock unlimited lead searches and grow your business faster.
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              <div className="bg-card border rounded-xl p-5 text-left">
                <Zap className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold mb-1">Unlimited Searches</h3>
                <p className="text-sm text-muted-foreground">
                  No daily limits. Search as much as you need.
                </p>
              </div>
              <div className="bg-card border rounded-xl p-5 text-left">
                <Users className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold mb-1">Full CRM Access</h3>
                <p className="text-sm text-muted-foreground">
                  Track leads, manage outreach, close deals.
                </p>
              </div>
              <div className="bg-card border rounded-xl p-5 text-left">
                <Shield className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold mb-1">Priority Support</h3>
                <p className="text-sm text-muted-foreground">
                  Get help when you need it most.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-4">
              <Button 
                size="lg" 
                className="text-lg px-10 py-6 h-auto"
                onClick={() => createCheckout()}
              >
                <Crown className="h-5 w-5 mr-2" />
                Upgrade to Pro — £19.99/month
              </Button>
              <p className="text-sm text-muted-foreground">
                Cancel anytime. No questions asked.
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBackToLogin}
                className="mt-2"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Back to Login
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: redirect to subscribe
  return <Navigate to="/subscribe" replace />;
}