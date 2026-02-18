import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { trackLead } from '@/lib/fbPixel';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search, ClipboardList, Phone, FileText, Zap, Check, ArrowRight, X, Volume2, VolumeX, MessageSquare
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';
import appLogo from '@/assets/logo.png';
import featureContactTracking from '@/assets/feature-contact-tracking.png';
import featureDashboard from '@/assets/howto-step4-dashboard.png';
import featureClassification from '@/assets/feature-classification.png';
import featureTemplates from '@/assets/feature-templates.png';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { ReviewsSection } from '@/components/landing/ReviewsSection';

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
];

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [toolkitIndex, setToolkitIndex] = useState(0);
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

  const ctaTo = user ? '/' : '/auth';

  const VideoPlayer = (
    <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Loading spinner */}
      {!videoLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/80 transition-opacity duration-500">
          <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        src={demoVideo}
        muted={isMuted}
        autoPlay
        loop
        playsInline
        className="w-full h-auto"
        onCanPlayThrough={() => setVideoLoaded(true)}
      />
      <button
        onClick={() => { setIsMuted(!isMuted); if (videoRef.current) videoRef.current.muted = !isMuted; }}
        className="absolute bottom-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
      >
        {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
      </button>
    </div>
  );
  
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
            
            {/* Mobile: video above title */}
            {isMobile && (
              <div className="mb-6 max-w-md mx-auto">
                {VideoPlayer}
              </div>
            )}

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

          {/* Desktop: video below hero */}
          {!isMobile && (
            <div className="mt-12 max-w-4xl mx-auto">
              {VideoPlayer}
            </div>
          )}
        </div>
      </section>

      {/* STOP MANUALLY SCROLLING GOOGLE MAPS */}
      <section className="relative z-10 py-10 sm:py-16 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4">Stop Manually Scrolling <span className="text-gradient-primary">Google Maps</span> for Leads</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-12">There's a faster way to find businesses without websites.</p>
          
          <div className="space-y-10 max-w-lg mx-auto md:max-w-4xl">
            {/* The Old Way */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <X className="h-5 w-5 text-red-500" />
                <h3 className="text-lg sm:text-xl font-bold text-foreground">The Old Way</h3>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg">
                <img src={oldWayImage} alt="The old way — scrolling Google Maps" className="w-full h-auto object-contain" />
              </div>
              <ul className="space-y-2 text-left max-w-sm mx-auto">
                <li className="flex items-start gap-2 text-sm text-muted-foreground"><X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> Hours spent scrolling Google Maps</li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground"><X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> No way to track who you've contacted</li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground"><X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> Leads lost in notes and spreadsheets</li>
              </ul>
            </div>

            {/* The LeadFinder Way */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                <h3 className="text-lg sm:text-xl font-bold text-foreground">The LeadFinder Way</h3>
              </div>
              <div className="rounded-xl overflow-hidden border border-primary/20 shadow-lg shadow-primary/5 hover:shadow-primary/10 transition-shadow">
                <img src={newWayImage} alt="The new way — LeadFinder Pro" className="w-full h-auto object-contain" />
              </div>
              <ul className="space-y-2 text-left max-w-sm mx-auto">
                <li className="flex items-start gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Find 20+ leads in minutes</li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Track every message and follow-up</li>
              </ul>
            </div>
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

          {/* Mobile: slider with dots + swipe text */}
          {isMobile ? (
            <div className="relative">
              <div className="overflow-hidden">
                {(() => {
                  const feature = FEATURES[toolkitIndex];
                  const Icon = feature.icon;
                  return (
                    <Card 
                      className="bg-card/60 border-border/40 transition-all duration-300 cursor-pointer group"
                      onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                    >
                      <CardContent className="p-5 space-y-3 text-center">
                        <h3 className="font-bold text-lg text-foreground">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                        <div className="rounded-lg overflow-hidden border border-border/30">
                          <img src={feature.image} alt={feature.title} className="w-full h-auto" loading="lazy" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
              {/* Dots */}
              <div className="flex items-center justify-center gap-1.5 mt-4">
                {FEATURES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setToolkitIndex(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === toolkitIndex
                        ? 'w-6 h-2 bg-primary'
                        : 'w-2 h-2 bg-muted-foreground/25'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground/40 text-center mt-2">Swipe to explore</p>
            </div>
          ) : (
            /* Desktop: grid */
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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
          )}
        </div>
      </section>

      {/* REVIEWS / SOCIAL PROOF */}
      <ReviewsSection />

      {/* GOT ANY QUESTIONS? — WhatsApp contact */}
      <section className="relative z-10 py-16 sm:py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <div className="flex justify-center mb-6">
              <div className="h-14 w-14 rounded-full bg-card/60 flex items-center justify-center border border-border/40">
                <MessageSquare className="h-7 w-7 text-foreground/70" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Got Any <span className="text-gradient-primary">Questions?</span></h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-2">
              Fast responses from a real person — no bots, no waiting.
            </p>
            <p className="text-muted-foreground/50 text-sm mb-8">
              We typically reply within minutes.
            </p>
            <a
              href="https://wa.me/447477932564"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center font-semibold px-8 h-[52px] rounded-xl text-base text-black transition-all duration-300 hover:brightness-110"
              style={{ background: 'hsl(142 70% 49%)', boxShadow: '0 0 20px hsl(142 70% 49% / 0.3), 0 0 60px hsl(142 70% 49% / 0.1)' }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Message Us on WhatsApp
            </a>
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
