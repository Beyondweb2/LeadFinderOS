import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { trackLead } from '@/lib/fbPixel';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search, Settings, ClipboardList, Phone, FileText, Zap, Check, ArrowRight, X, Volume2, VolumeX, MessageSquare, Star, Sparkles
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';
import appLogo from '@/assets/logo.png';
import featureCustomization from '@/assets/feature-customization-new.png';
import featureContactTracking from '@/assets/feature-contact-tracking.png';
import featureDashboard from '@/assets/howto-step4-dashboard.png';
import featureExport from '@/assets/feature-export.png';
import featureClassification from '@/assets/feature-classification.png';
import featureTemplates from '@/assets/feature-templates.png';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { ReviewsSection } from '@/components/landing/ReviewsSection';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

const ScrollReveal = ({ 
  children, 
  className = '', 
  delay = 0,
  direction = 'up' 
}: { 
  children: React.ReactNode; 
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  
  const getTransform = () => {
    switch (direction) {
      case 'up': return 'translateY(30px)';
      case 'down': return 'translateY(-30px)';
      case 'left': return 'translateX(30px)';
      case 'right': return 'translateX(-30px)';
      default: return 'translateY(40px)';
    }
  };
  
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translate(0)' : getTransform(),
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const HowItWorksSection = lazy(() => import('@/components/landing/HowItWorksSection').then(m => ({ default: m.HowItWorksSection })));

const FEATURES = [
  { icon: Search, title: 'Smart Classification', description: 'Instantly see which businesses don\'t have a website.', image: featureClassification },
  { icon: ClipboardList, title: 'Smart Dashboard', description: 'Your entire pipeline at a glance.', image: featureDashboard },
  { icon: Phone, title: 'Contact Tracking', description: 'Log every call, text, and follow-up.', image: featureContactTracking },
  { icon: FileText, title: 'Templates', description: 'Ready-to-send WhatsApp, SMS, and call scripts.', image: featureTemplates },
  { icon: FileText, title: 'Export Tools', description: 'Export your leads and outreach data to CSV.', image: featureExport },
  { icon: Settings, title: 'Customization', description: 'Tailor the dashboard to match how you work.', image: featureCustomization },
];

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  useLandingTheme();

  useEffect(() => {
    const onScroll = () => setHasScrolled(window.scrollY > window.innerHeight * 0.35);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // CTA destination: logged in → dashboard, logged out → signup
  const ctaTo = user ? '/' : '/auth';
  
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AffiliateCapture />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.12), transparent 60%)' }} />
        <div className="absolute inset-0 bg-noise" />
      </div>

      <header className="relative z-10 backdrop-blur-sm bg-transparent">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="text-base sm:text-lg font-bold tracking-tight">Lead<span className="text-gradient-primary">Finder</span> Pro</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm" asChild><Link to="/auth">Sign In</Link></Button>
            <Button asChild className="font-semibold text-sm px-3 sm:px-4 btn-premium"><Link to={ctaTo}>Try it free</Link></Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 pt-6 pb-6 sm:pt-16 sm:pb-20 md:pt-24 md:pb-32 px-4">
        <div className="container mx-auto text-center lg:max-w-[1140px]">
          <div className="max-w-3xl mx-auto lg:max-w-2xl">
            <div className="hidden sm:inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 backdrop-blur-sm border border-primary/20 bg-primary/10 text-primary">
              <Zap className="h-3 w-3" /><span>Lead generation for web professionals</span>
            </div>

            <h1 className="text-[1.75rem] leading-[1.05] sm:text-5xl md:text-6xl font-extrabold tracking-tight">
              <span>Find Businesses</span> <br className="hidden sm:block" />
              <span className="text-gradient-primary whitespace-nowrap">Without Websites</span>
            </h1>
            
            <p className="text-sm sm:text-lg md:text-xl text-foreground/60 max-w-2xl mx-auto leading-relaxed mt-4 sm:mt-5">
              The all-in-one system to find businesses without websites, contact them instantly, and track every follow-up.
            </p>
            
            <div className="flex flex-col items-center max-w-[480px] mx-auto w-full px-6 sm:px-0 mt-8">
              <Button size="lg" className="btn-premium text-[16px] font-semibold px-6 sm:px-12 h-[52px] rounded-xl w-full sm:w-auto shadow-lg shadow-primary/20 hover:shadow-primary/30" asChild>
                <Link to={ctaTo}>Try it free <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              
              <div className="flex flex-wrap justify-center gap-3 sm:gap-6 mt-4 text-[10px] sm:text-xs text-muted-foreground/60 font-medium">
                <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> No card required</span>
                <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Instant access</span>
                <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Cancel anytime</span>
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-2">Get your first leads in 30 seconds</p>
            </div>
          </div>
        </div>
      </section>

      {/* VIDEO / COMPARISON */}
      <section className="relative z-10 py-10 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4">Stop Manually Scrolling <span className="text-gradient-primary">Google Maps</span></h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-12">There's a faster way to find businesses without websites.</p>
          <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <video
              ref={videoRef}
              src={demoVideo}
              muted={isMuted}
              autoPlay
              loop
              playsInline
              className="w-full h-auto"
              poster={newWayImage}
            />
            <button
              onClick={() => { setIsMuted(!isMuted); if (videoRef.current) videoRef.current.muted = !isMuted; }}
              className="absolute bottom-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            >
              {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
            </button>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div id="how-it-works"><Suspense fallback={<div className="py-20" />}><HowItWorksSection ScrollReveal={ScrollReveal} /></Suspense></div>

      {/* YOUR COMPLETE LEAD TOOLKIT */}
      <section className="relative z-10 py-16 sm:py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-12">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Your Complete <span className="text-gradient-primary">Lead Toolkit</span></h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Everything you need to find, contact, and convert businesses without websites.</p>
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delay={i * 100}>
                  <Card 
                    className="bg-card/60 border-border/40 hover:border-primary/30 transition-all duration-300 cursor-pointer group"
                    onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                  >
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground">{feature.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                      <div className="rounded-lg overflow-hidden border border-border/30">
                        <img src={feature.image} alt={feature.title} className="w-full h-auto" loading="lazy" />
                      </div>
                    </CardContent>
                  </Card>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* REVIEWS / SOCIAL PROOF */}
      <ReviewsSection />

      {/* WHATSAPP / CONTACT SECTION */}
      <section className="relative z-10 py-16 sm:py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <div className="flex justify-center mb-6">
              <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                <MessageSquare className="h-7 w-7 text-green-500" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Reach Out <span className="text-gradient-primary">Instantly</span></h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Contact businesses directly via WhatsApp, SMS, or phone — all from within the app. Templates included so you never start from scratch.
            </p>
            <Button size="lg" className="btn-premium font-semibold px-8" asChild>
              <Link to={ctaTo}>Try it free <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-6 mt-4 text-[10px] sm:text-xs text-muted-foreground/60 font-medium">
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> No card required</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Instant access</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Cancel anytime</span>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 py-16 sm:py-24 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Ready to Find Your Next Client?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Join web professionals already using LeadFinder to land clients consistently.
            </p>
            <Button size="lg" className="btn-premium text-[16px] font-semibold px-10 h-[52px] rounded-xl shadow-lg shadow-primary/20" asChild>
              <Link to={ctaTo}>Try it free <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-6 mt-4 text-[10px] sm:text-xs text-muted-foreground/60 font-medium">
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> No card required</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Instant access</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Cancel anytime</span>
            </div>
            <p className="text-[11px] text-muted-foreground/50 mt-3">Built for freelancers & agencies</p>
          </ScrollReveal>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] py-12 mt-12 px-4">
        <div className="container mx-auto text-center space-y-6">
          <div className="flex flex-col items-center gap-4">
            <span className="font-bold tracking-tight text-base">Lead<span className="text-gradient-primary">Finder</span> Pro</span>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground">Sign In</Link>
              <Link to={ctaTo} className="hover:text-foreground">Try it free</Link>
              <Link to="/feedback" className="hover:text-foreground">Feedback</Link>
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} LeadFinder Pro. All rights reserved.</p>
        </div>
      </footer>

      {/* Image expand dialog */}
      {expandedImage && (
        <Dialog open={!!expandedImage} onOpenChange={() => setExpandedImage(null)}>
          <DialogContent className="max-w-4xl p-2 bg-card border-border">
            <div className="rounded-lg overflow-hidden">
              <img src={expandedImage.src} alt={expandedImage.title} className="w-full h-auto" />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isMobile && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 p-3 backdrop-blur-xl border-t border-white/10 transition-all duration-300 ${hasScrolled ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`} style={{ background: 'hsl(220 40% 4% / 0.95)' }}>
          <Button size="lg" className="w-full btn-premium font-semibold h-[52px] text-sm rounded-xl" asChild>
            <Link to={ctaTo}>Try it free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">No card required · Cancel anytime</p>
        </div>
      )}
      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
