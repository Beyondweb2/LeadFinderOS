import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  DollarSign,
  Users,
  TrendingUp,
  Mail,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useLandingTheme } from '@/hooks/useLandingTheme';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { AffiliateCapture } from '@/components/AffiliateCapture';

const ScrollReveal = ({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translate(0)' : 'translateY(30px)',
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const BENEFITS = [
  {
    icon: DollarSign,
    title: '30% Commission',
    description: 'Earn 30% of the first payment from every user you refer who subscribes.',
  },
  {
    icon: Users,
    title: 'Unique Referral Link',
    description: 'Get your own branded referral link to share across all your channels.',
  },
  {
    icon: TrendingUp,
    title: 'Real-Time Tracking',
    description: 'Monitor your referrals, conversions, and earnings through your affiliate dashboard.',
  },
];

const STEPS = [
  { step: '1', title: 'Apply', description: 'Send us your details via email or WhatsApp.' },
  { step: '2', title: 'Get Approved', description: 'We review your application and set you up.' },
  { step: '3', title: 'Share & Earn', description: 'Share your link and earn 30% on every first payment.' },
];

const AffiliateProgram = () => {
  useLandingTheme();

  const emailSubject = encodeURIComponent('Affiliate Program Application - LeadFinder Pro');
  const emailBody = encodeURIComponent(
    `Hi LeadFinder team,\n\nI'd like to apply for the affiliate program.\n\nName: \nSocial Media Platform(s): \nSocial Media Handle(s): \nHow I plan to promote: \n\nThanks!`
  );
  const whatsappText = encodeURIComponent(
    `Hi! I'd like to apply for the LeadFinder Pro affiliate program.\n\nName: \nSocial Media Platform(s): \nSocial Media Handle(s): \nHow I plan to promote: `
  );

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AffiliateCapture />

      {/* Background effects - same as landing */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 120% 80% at 50% -30%, hsl(210 100% 15% / 0.5), transparent 60%)',
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px]"
          style={{
            background:
              'radial-gradient(ellipse 100% 70% at 50% 0%, hsl(210 100% 50% / 0.08), transparent 70%)',
          }}
        />
        <div className="absolute inset-0 bg-noise" />
      </div>

      {/* Floating orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[10%] left-[15%] w-[600px] h-[600px] rounded-full blur-[180px] animate-float opacity-40"
          style={{ background: 'hsl(210 100% 50% / 0.08)' }}
        />
        <div
          className="absolute top-[40%] right-[10%] w-[500px] h-[500px] rounded-full blur-[160px] animate-float opacity-30"
          style={{ background: 'hsl(210 100% 50% / 0.06)', animationDelay: '-4s' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 backdrop-blur-sm bg-transparent">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <Link to="/landing" className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="text-base sm:text-lg font-semibold tracking-tight">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm px-2 sm:px-4" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild className="btn-premium font-medium text-sm px-3 sm:px-4">
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 pt-12 pb-8 sm:pt-20 sm:pb-16 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <ScrollReveal>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium mb-6 backdrop-blur-sm"
              style={{
                border: '1px solid hsl(210 100% 50% / 0.3)',
                background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.1), hsl(210 100% 50% / 0.05))',
                color: 'hsl(210 100% 60%)',
              }}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>Partner with us</span>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 sm:mb-6 tracking-tight">
              <span className="text-foreground">Earn </span>
              <span className="text-gradient-primary">30% Commission</span>
            </h1>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <p className="text-sm sm:text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
              Join the LeadFinder Pro affiliate program. Refer web designers, freelancers, and agencies—earn 30% of their first payment.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Benefits */}
      <section className="relative z-10 pb-12 sm:pb-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {BENEFITS.map((b, i) => (
              <ScrollReveal key={b.title} delay={i * 100}>
                <Card
                  className="border-white/[0.08] bg-card/60 backdrop-blur-sm h-full"
                  style={{ boxShadow: '0 0 20px hsl(210 100% 50% / 0.05)' }}
                >
                  <CardContent className="p-5 sm:p-6 text-center">
                    <div
                      className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                      style={{
                        background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15), hsl(210 100% 50% / 0.05))',
                        border: '1px solid hsl(210 100% 50% / 0.2)',
                      }}
                    >
                      <b.icon className="h-5 w-5" style={{ color: 'hsl(210 100% 60%)' }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{b.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 pb-12 sm:pb-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
              How It <span className="text-gradient-primary">Works</span>
            </h2>
          </ScrollReveal>

          <div className="space-y-4 sm:space-y-6">
            {STEPS.map((s, i) => (
              <ScrollReveal key={s.step} delay={i * 100}>
                <div className="flex items-start gap-4 sm:gap-6">
                  <div
                    className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-lg"
                    style={{
                      background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 100% 45%))',
                      color: 'hsl(220 40% 4%)',
                    }}
                  >
                    {s.step}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* What we're looking for */}
      <section className="relative z-10 pb-12 sm:pb-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
              Ideal <span className="text-gradient-primary">Partners</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <Card
              className="border-white/[0.08] bg-card/60 backdrop-blur-sm"
              style={{ boxShadow: '0 0 20px hsl(210 100% 50% / 0.05)' }}
            >
              <CardContent className="p-6 sm:p-8">
                <ul className="space-y-3">
                  {[
                    'Web design & freelancer content creators',
                    'YouTube, TikTok, or Instagram creators in the tech/business niche',
                    'Freelancer community leaders & group admins',
                    'Web design agency owners',
                    'Business coaches & consultants',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(210 100% 60%)' }} />
                      <span className="text-sm sm:text-base text-foreground/90">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      {/* Apply CTA */}
      <section className="relative z-10 pb-16 sm:pb-24 px-4">
        <div className="container mx-auto max-w-2xl">
          <ScrollReveal>
            <Card
              className="border-white/[0.08] bg-card/60 backdrop-blur-sm overflow-hidden"
              style={{ boxShadow: '0 0 30px hsl(210 100% 50% / 0.1)' }}
            >
              <div
                className="h-1 w-full"
                style={{ background: 'linear-gradient(90deg, hsl(210 100% 50%), hsl(220 100% 45%))' }}
              />
              <CardContent className="p-6 sm:p-10 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                  Ready to <span className="text-gradient-primary">Partner Up?</span>
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
                  Send us your name, social media platforms, handles, and how you plan to promote. We'll get back to you within 24 hours.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                  <Button
                    size="lg"
                    className="btn-premium font-semibold px-6 sm:px-8 py-3 h-auto text-sm sm:text-base w-full sm:w-auto"
                    asChild
                  >
                    <a href={`mailto:beyondwebcraft@outlook.com?subject=${emailSubject}&body=${emailBody}`}>
                      <Mail className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Email Us
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-6 sm:px-8 py-3 h-auto text-sm sm:text-base border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-foreground w-full sm:w-auto"
                    asChild
                  >
                    <a
                      href={`https://wa.me/447477932564?text=${whatsappText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      WhatsApp Us
                    </a>
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground mt-6">
                  Include: Your name • Social media platform(s) • Handle(s) • Contact info • How you'll promote
                </p>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-5 w-5" />
            <span>© {new Date().getFullYear()} LeadFinder Pro</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/landing" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AffiliateProgram;
