import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Crown, Clock, Zap, Shield, Users, LogOut, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubscriptionGateProps {
  children: ReactNode;
}

// Floating orb component matching landing page
const FloatingOrb = ({ className, delay = 0 }: { className?: string; delay?: number }) => (
  <div 
    className={`absolute rounded-full blur-3xl opacity-20 animate-pulse ${className}`}
    style={{ 
      animationDelay: `${delay}ms`,
      animationDuration: '4s'
    }}
  />
);

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { subscribed, isLoading: subLoading, status, openCustomerPortal, createCheckout } = useSubscription();
  const { isOnTrial, trialExpired, planStatus, isLoading: trialLoading } = useTrial();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  const isLoading = subLoading || trialLoading;

  // Fade in animation
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

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
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-background" />
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.15), transparent 60%)'
          }}
        />
        
        <FloatingOrb className="w-96 h-96 bg-primary -top-48 -left-48" delay={0} />
        <FloatingOrb className="w-64 h-64 bg-primary/50 bottom-20 right-10" delay={2000} />
        
        <div 
          className="max-w-lg mx-auto text-center p-6 sm:p-8 relative z-10"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
          }}
        >
          <div className="inline-flex p-4 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
            <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-destructive" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-3">Subscription Cancelled</h1>
          <p className="text-muted-foreground mb-8 text-base sm:text-lg">
            Your subscription has been cancelled. Resubscribe to regain access to LeadFinder Pro.
          </p>
          <div className="flex flex-col gap-3">
            <Button size="lg" className="btn-premium" onClick={() => openCustomerPortal()}>
              <Crown className="h-4 w-4 mr-2" />
              Manage Subscription
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/subscribe')}>
              View Plans
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBackToLogin} className="mt-2 text-muted-foreground hover:text-foreground">
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
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        {/* Cinematic background matching landing page */}
        <div className="absolute inset-0 bg-background" />
        
        {/* Hero gradient glow */}
        <div 
          className="absolute inset-0 opacity-40"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -10%, hsl(210 100% 50% / 0.25), transparent 50%)'
          }}
        />
        
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(210 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(210 100% 50%) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        
        {/* Floating orbs */}
        <FloatingOrb className="w-[500px] h-[500px] bg-primary -top-64 -left-64" delay={0} />
        <FloatingOrb className="w-80 h-80 bg-primary/60 top-1/3 -right-40" delay={1500} />
        <FloatingOrb className="w-48 h-48 bg-primary/40 bottom-20 left-20" delay={3000} />
        
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
          <div 
            className="max-w-2xl mx-auto text-center"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Crown icon with glow */}
            <div 
              className="inline-flex p-4 sm:p-5 rounded-2xl mb-6 sm:mb-8"
              style={{
                background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15) 0%, hsl(220 100% 50% / 0.1) 100%)',
                border: '1px solid hsl(210 100% 50% / 0.2)',
                boxShadow: '0 0 40px hsl(210 100% 50% / 0.15)'
              }}
            >
              <Crown className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
            </div>
            
            {/* Headline with gradient text */}
            <h1 
              className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4"
              style={{
                background: 'linear-gradient(135deg, hsl(0 0% 98%) 0%, hsl(210 20% 70%) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Your Free Trial Has Ended
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-lg mx-auto px-4">
              Upgrade to LeadFinder Pro to unlock unlimited lead searches and grow your business faster.
            </p>

            {/* Features Grid - Glass cards */}
            <div 
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10 px-2"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 200ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 200ms'
              }}
            >
              {[
                { icon: Zap, title: 'Unlimited Searches', desc: 'No daily limits. Search as much as you need.' },
                { icon: Users, title: 'Full CRM Access', desc: 'Track leads, manage outreach, close deals.' },
                { icon: Shield, title: 'Priority Support', desc: 'Get help when you need it most.' },
              ].map((feature, i) => (
                <div 
                  key={feature.title}
                  className="p-4 sm:p-5 rounded-xl text-left"
                  style={{
                    background: 'linear-gradient(135deg, hsl(220 40% 8% / 0.8) 0%, hsl(220 40% 5% / 0.9) 100%)',
                    border: '1px solid hsl(0 0% 100% / 0.08)',
                    backdropFilter: 'blur(12px)',
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                    transition: `opacity 0.6s ease-out ${300 + i * 100}ms, transform 0.6s ease-out ${300 + i * 100}ms`
                  }}
                >
                  <div 
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center mb-3"
                    style={{
                      background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15) 0%, hsl(210 100% 50% / 0.05) 100%)',
                      border: '1px solid hsl(210 100% 50% / 0.2)'
                    }}
                  >
                    <feature.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1 text-sm sm:text-base">{feature.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA Section */}
            <div 
              className="flex flex-col items-center gap-4"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 500ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 500ms'
              }}
            >
              <Button 
                size="lg" 
                className="btn-premium text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 h-auto rounded-xl font-semibold"
                onClick={() => createCheckout()}
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Upgrade to Pro — £19.99/month
              </Button>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Cancel anytime. No questions asked.
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBackToLogin}
                className="mt-2 text-muted-foreground hover:text-foreground"
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
