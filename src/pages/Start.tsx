import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight, Shield, MessageCircle, CreditCard, Lock, Phone } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import featureClassification from '@/assets/feature-classification.png';
import featureTemplates from '@/assets/feature-templates.png';
import featureDashboard from '@/assets/howto-step4-dashboard.png';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const ScrollReveal = ({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translate(0)' : 'translateY(24px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const BENEFITS = [
  'Find businesses without websites in seconds',
  'Open WhatsApp or SMS instantly with templates',
  'Track every contact and follow-up',
  '5-day free trial · £0 today',
];

const TRUST_POINTS = [
  '5-day free trial with full access',
  'Upgrade only if you want unlimited access',
  'Cancel anytime',
  'Real human support via WhatsApp',
];

const SCREENSHOTS = [
  { src: featureClassification, alt: 'Lead search results', label: 'Search Results' },
  { src: featureTemplates, alt: 'WhatsApp & SMS templates', label: 'Message Templates' },
  { src: featureDashboard, alt: 'CRM tracking dashboard', label: 'CRM Dashboard' },
];

const Start = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'var(--gradient-hero)' }}
      />

      {/* Header */}
      <header className="relative z-20 border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/start" className="flex items-center gap-2.5">
            <img src={appLogo} alt="LeadFinder" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">LeadFinder</span>
          </Link>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 pt-16 sm:pt-24 pb-14 sm:pb-20 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
            Find leads faster.{' '}
            <span className="text-primary">Stay organised.</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8">
            LeadFinder helps you quickly find businesses without websites, open WhatsApp or SMS instantly with ready-made templates, and track your outreach in one clear system.
          </p>
          <Button
            size="lg"
            className="btn-premium font-semibold text-base px-8 py-3.5 h-auto shadow-lg shadow-primary/20"
            asChild
          >
            <Link to="/auth?intent=upgrade">
              Create free account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground/50 mt-3">
            5-day free trial · £0 today · Cancel anytime
          </p>
        </div>
      </section>

      {/* Visual Proof */}
      <ScrollReveal className="relative z-10 pb-16 sm:pb-24 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-10">
            See how it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            {SCREENSHOTS.map((shot) => (
              <div key={shot.label} className="flex flex-col items-center gap-3">
                <div
                  className="w-full rounded-xl overflow-hidden bg-card/80 aspect-[16/10]"
                  style={{
                    border: '1px solid hsl(210 100% 50% / 0.15)',
                    boxShadow: '0 4px 24px hsl(210 100% 50% / 0.08)',
                  }}
                >
                  <img
                    src={shot.src}
                    alt={shot.alt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <span className="text-sm font-medium text-muted-foreground">{shot.label}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* Benefit Strip */}
      <ScrollReveal className="relative z-10 pb-16 sm:pb-24 px-4" delay={100}>
        <div className="container mx-auto max-w-md">
          <ul className="space-y-4">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center justify-center gap-3">
                <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={3} />
                <span className="text-[15px] font-medium text-foreground/90">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </ScrollReveal>

      {/* Trust Section */}
      <ScrollReveal className="relative z-10 pb-16 sm:pb-24 px-4" delay={100}>
        <div className="container mx-auto max-w-lg text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">No risk. No pressure.</h2>
          <ul className="space-y-3 mb-8">
            {TRUST_POINTS.map((t) => (
              <li key={t} className="flex items-center justify-center gap-3">
                <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={3} />
                <span className="text-sm text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 opacity-40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Secure</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span>Stripe</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircle className="h-4 w-4" />
              <span>WhatsApp</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>SMS</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>256-bit</span>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* WhatsApp Contact */}
      <ScrollReveal className="relative z-10 pb-16 sm:pb-24 px-4" delay={100}>
        <div className="container mx-auto max-w-md text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Got a question?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Message us directly on WhatsApp. A real person replies.
          </p>
          <Button
            size="lg"
            className="font-semibold h-auto py-3 px-6"
            style={{ background: 'hsl(142 70% 45%)', color: '#fff' }}
            asChild
          >
            <a href="https://wa.me/66645468692" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Chat on WhatsApp
            </a>
          </Button>
        </div>
      </ScrollReveal>

      {/* Final CTA */}
      <section className="relative z-10 pb-20 sm:pb-28 px-4">
        <div className="container mx-auto max-w-md text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-5">Ready to try it?</h2>
          <Button
            size="lg"
            className="btn-premium font-semibold text-base px-8 py-3.5 h-auto shadow-lg shadow-primary/20"
            asChild
          >
            <Link to="/auth?intent=upgrade">
              Create free account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground/50 mt-3">
            5-day free trial · £0 today
          </p>
        </div>
      </section>
    </div>
  );
};

export default Start;
