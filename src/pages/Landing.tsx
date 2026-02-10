import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Search,
  ClipboardList,
  Phone,
  ArrowRight,
  X,
  CheckCircle,
  Volume2,
  VolumeX,
  Check,
  Gift,
  BarChart3,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';
import appLogo from '@/assets/logo.png';

import featureClassification from '@/assets/feature-classification.png';
import featureContactTracking from '@/assets/feature-contact-tracking.png';
import featureDashboard from '@/assets/howto-step4-dashboard.png';
import featureTemplates from '@/assets/feature-templates.png';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ReviewsSection } from '@/components/landing/ReviewsSection';
import { AffiliateCapture } from '@/components/AffiliateCapture';

// Scroll reveal wrapper component
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

const FEATURES = [
  {
    icon: Search,
    title: 'No website detection',
    description: 'Instantly spot businesses that are missing a website, no manual checking.',
    image: featureClassification,
  },
  {
    icon: ClipboardList,
    title: 'Outreach list and statuses',
    description: 'Keep leads organised, contacted, replied, follow up, closed, all in one place.',
    image: featureContactTracking,
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp then SMS',
    description: 'Message leads fast, WhatsApp first, SMS fallback when needed.',
    image: featureTemplates,
  },
  {
    icon: BarChart3,
    title: 'Simple performance tracking',
    description: 'See what outreach is working, and where leads are getting stuck.',
    image: featureDashboard,
  },
];

const PRICING_FEATURES = [
  'Unlimited lead searches',
  'Find businesses without websites',
  'Full CRM access',
  'Contact tracking and notes',
  'WhatsApp and SMS outreach',
  'Export leads',
];

// Mobile hero video component
const MobileHeroVideo = () => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  return (
    <div className="relative">
      <div 
        className="absolute -inset-2 rounded-2xl blur-xl opacity-40"
        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
      />
      <div 
        className="absolute -inset-px rounded-xl"
        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.15), transparent)' }}
      />
      
      <div 
        className="relative rounded-xl overflow-hidden bg-card/80 backdrop-blur-sm"
        style={{ 
          border: '1px solid hsl(210 100% 50% / 0.2)',
          boxShadow: '0 0 20px hsl(210 100% 50% / 0.15)'
        }}
      >
        <video 
          ref={videoRef}
          className="w-full h-auto"
          autoPlay 
          loop 
          muted
          playsInline
          preload="auto"
        >
          <source src={demoVideo} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        <button
          onClick={toggleMute}
          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background/90 transition-colors duration-200"
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

// Desktop video section
const VideoSection = ({ inline = false }: { inline?: boolean }) => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const videoContent = (
    <div 
      className={`relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm ${inline ? '' : 'max-w-5xl mx-auto'}`}
      style={{ 
        border: '1px solid hsl(210 100% 50% / 0.2)',
        boxShadow: '0 0 20px hsl(210 100% 50% / 0.15), 0 0 40px hsl(210 100% 50% / 0.05)'
      }}
    >
      <video 
        ref={videoRef}
        className="w-full h-auto"
        autoPlay 
        loop 
        muted
        playsInline
        preload="auto"
      >
        <source src={demoVideo} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      
      <button
        onClick={toggleMute}
        className="absolute bottom-3 right-3 md:bottom-4 md:right-4 p-2 md:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background/90 transition-colors duration-200"
        aria-label={isMuted ? "Unmute video" : "Mute video"}
      >
        {isMuted ? <VolumeX className="h-4 w-4 md:h-5 md:w-5" /> : <Volume2 className="h-4 w-4 md:h-5 md:w-5" />}
      </button>
    </div>
  );

  if (inline) return videoContent;

  return (
    <ScrollReveal className="relative z-10 pb-10 sm:pb-14 md:pb-20 px-2 sm:px-4">
      <div className="container mx-auto">
        <div className="relative">
          <div 
            className="absolute -inset-4 rounded-3xl blur-2xl opacity-40"
            style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
          />
          <div 
            className="absolute -inset-px rounded-2xl"
            style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.15), transparent)' }}
          />
          {videoContent}
        </div>
      </div>
    </ScrollReveal>
  );
};

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const isMobile = useIsMobile();
  
  useLandingTheme();

  useEffect(() => {
    const onScroll = () => {
      const threshold = window.innerHeight * 0.35;
      setHasScrolled(window.scrollY > threshold);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AffiliateCapture />

      {/* Feature Image Modal */}
      <Dialog open={!!expandedImage} onOpenChange={() => setExpandedImage(null)}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 bg-card/95 backdrop-blur-xl border-white/10">
          <div className="relative">
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            {expandedImage && (
              <div className="p-2">
                <img 
                  src={expandedImage.src} 
                  alt={expandedImage.title}
                  className="w-full h-auto rounded-lg"
                />
                <p className="text-center text-lg font-semibold mt-4 pb-2">{expandedImage.title}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cinematic background */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 120% 80% at 50% -30%, hsl(210 100% 15% / 0.5), transparent 60%)' }}
        />
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px]"
          style={{ background: 'radial-gradient(ellipse 100% 70% at 50% 0%, hsl(210 100% 50% / 0.08), transparent 70%)' }}
        />
        <div 
          className="absolute bottom-0 right-0 w-[800px] h-[600px]"
          style={{ background: 'radial-gradient(ellipse 80% 80% at 100% 100%, hsl(210 100% 40% / 0.06), transparent 60%)' }}
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
        <div 
          className="absolute bottom-[10%] left-[30%] w-[400px] h-[400px] rounded-full blur-[140px] animate-float opacity-25"
          style={{ background: 'hsl(210 100% 45% / 0.05)', animationDelay: '-2s' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 backdrop-blur-sm bg-transparent">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="text-base sm:text-lg font-semibold tracking-tight">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm px-2 sm:px-4" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button 
              asChild 
              className="font-medium text-sm px-3 sm:px-4 btn-premium"
            >
              <Link to="/auth">
                <span className="hidden sm:inline">Start Free Trial</span>
                <span className="sm:hidden">Free Trial</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative z-10 pt-6 pb-4 sm:pt-10 sm:pb-8 md:pt-16 md:pb-12 lg:pt-20 lg:pb-16 px-4">
        <div className="container mx-auto">
          {/* Mobile layout: media first, then copy */}
          <div className="sm:hidden">
            <div className="mb-5">
              <MobileHeroVideo />
            </div>
            
            <div className="text-center">
              <h1 className="text-[1.65rem] leading-[1.15] font-bold mb-3 tracking-tight">
                <span className="block">Find businesses without websites</span>
                <span className="block text-gradient-primary mt-1">and contact them fast</span>
              </h1>
              
              <p className="text-sm text-muted-foreground mb-3 leading-relaxed px-1">
                Search by trade and location, instantly see who has no website, message by WhatsApp or SMS, and keep every lead organised in one simple pipeline.
              </p>

              <p className="text-xs text-muted-foreground/60 mb-3">
                Built for freelance web designers, developers, and small agencies.
              </p>
              
              <div className="flex flex-col items-start gap-1.5 mb-5 max-w-xs mx-auto">
                {[
                  'Spot no-website leads in seconds',
                  'Message them fast, WhatsApp first, SMS if needed',
                  'Track replies, follow ups, and outcomes in one place',
                ].map((bullet) => (
                  <div key={bullet} className="flex items-center gap-2 w-full">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" style={{ color: 'hsl(210 100% 55%)' }} strokeWidth={2} />
                    <span className="text-foreground/85 text-[13px]">{bullet}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-col items-center gap-2">
                <Button size="lg" className="btn-premium text-sm font-semibold px-6 py-3 h-auto w-full shadow-lg shadow-primary/20" asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  1 day full access, then £19.99 per month. Cancel anytime before renewal.
                </p>
                <Link to="/guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 mt-0.5">
                  Watch how it works
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Desktop layout: side-by-side, media dominant */}
          <div className="hidden sm:flex items-center gap-8 lg:gap-14 max-w-6xl mx-auto">
            {/* Left: copy */}
            <div className="flex-1 text-left">
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-[3.4rem] font-bold mb-4 tracking-tight leading-[1.12]">
                <span className="block">Find businesses without websites</span>
                <span className="block text-gradient-primary mt-1.5">and contact them fast</span>
              </h1>
              
              <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed max-w-lg">
                Search by trade and location, instantly see who has no website, message by WhatsApp or SMS, and keep every lead organised in one simple pipeline.
              </p>

              <p className="text-xs md:text-sm text-muted-foreground/60 mb-4">
                Built for freelance web designers, developers, and small agencies.
              </p>
              
              <div className="flex flex-col gap-2 mb-6 max-w-md">
                {[
                  'Spot no-website leads in seconds',
                  'Message them fast, WhatsApp first, SMS if needed',
                  'Track replies, follow ups, and outcomes in one place',
                ].map((bullet) => (
                  <div key={bullet} className="flex items-center gap-2.5">
                    <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'hsl(210 100% 55%)' }} strokeWidth={2} />
                    <span className="text-foreground/85 text-sm md:text-base">{bullet}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-col items-start gap-2.5">
                <Button size="lg" className="btn-premium text-sm md:text-base font-semibold px-7 py-3.5 h-auto shadow-lg shadow-primary/20" asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  1 day full access, then £19.99 per month. Cancel anytime before renewal.
                </p>
                <Link to="/guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                  Watch how it works
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Right: video media */}
            <div className="flex-[1.3] relative">
              <div 
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-40"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
              />
              <div 
                className="absolute -inset-px rounded-2xl"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.15), transparent)' }}
              />
              <VideoSection inline />
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUST STRIP ===== */}
      <section className="relative z-10 pb-6 sm:pb-10 px-4">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-2xl mx-auto">
            {[
              'Real business data sources',
              'Built for outreach workflows',
              'Instantly highlights no-website businesses',
            ].map((chip) => (
              <div
                key={chip}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-medium"
                style={{
                  border: '1px solid hsl(210 100% 50% / 0.12)',
                  background: 'hsl(210 100% 50% / 0.04)',
                  color: 'hsl(210 20% 60%)',
                }}
              >
                <CheckCircle className="h-3 w-3 flex-shrink-0" style={{ color: 'hsl(210 100% 50% / 0.5)' }} strokeWidth={2} />
                {chip}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BEFORE/AFTER SECTION ===== */}
      <section className="relative z-10 py-10 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Stop checking Google Maps <span className="text-gradient-primary">one pin at a time</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2 leading-relaxed">
              Finding businesses without websites usually means hours of manual work, clicking listings, opening websites, and building a messy list in notes. LeadFinder Pro turns that into a repeatable system.
            </p>
          </ScrollReveal>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 max-w-6xl mx-auto">
            {/* Old Way */}
            <ScrollReveal delay={100} direction="left">
              <div className="relative group">
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-destructive/30 via-destructive/10 to-transparent opacity-60" />
                <div className="relative rounded-2xl overflow-hidden border border-destructive/20 bg-card/80 backdrop-blur-sm p-1.5 sm:p-4">
                  <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 flex items-center gap-1.5 sm:gap-2 bg-destructive/90 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-semibold text-[10px] sm:text-xs uppercase tracking-wide shadow-lg">
                    <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    The Old Way
                  </div>
                  <div 
                    className="rounded-lg sm:rounded-xl overflow-hidden cursor-pointer"
                    onClick={() => setExpandedImage({ src: oldWayImage, title: 'The Old Way — Manual Google Maps Searching' })}
                  >
                    <img
                      src={oldWayImage}
                      alt="Manually searching Google Maps for businesses"
                      className="w-full h-auto"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm text-center mt-2 sm:mt-4 px-1 sm:px-2">
                    Manual search, slow, easy to miss opportunities
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* New Way */}
            <ScrollReveal delay={200} direction="right">
              <div className="relative group">
                <div 
                  className="absolute -inset-2 rounded-3xl blur-xl opacity-40 group-hover:opacity-50 transition-opacity duration-300"
                  style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.25), hsl(210 100% 50% / 0.1), hsl(220 80% 45% / 0.1))' }}
                />
                <div 
                  className="absolute -inset-px rounded-2xl"
                  style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.4), hsl(210 100% 50% / 0.2), transparent)' }}
                />
                <div 
                  className="relative rounded-2xl overflow-hidden bg-card/90 backdrop-blur-sm p-1.5 sm:p-4"
                  style={{ 
                    border: '1px solid hsl(210 100% 50% / 0.3)',
                    boxShadow: '0 0 20px hsl(210 100% 50% / 0.15), 0 0 40px hsl(210 100% 50% / 0.05)'
                  }}
                >
                  <div 
                    className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-semibold text-[10px] sm:text-xs uppercase tracking-wide shadow-lg"
                    style={{ background: 'hsl(210 100% 50%)', color: 'hsl(220 40% 4%)' }}
                  >
                    <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    With LeadFinder
                  </div>
                  <div 
                    className="rounded-xl overflow-hidden cursor-pointer"
                    onClick={() => setExpandedImage({ src: newWayImage, title: 'With LeadFinder — Filtered Results Ready to Contact' })}
                  >
                    <img
                      src={newWayImage}
                      alt="LeadFinder showing filtered list of businesses without websites"
                      className="w-full h-auto"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm text-center mt-3 sm:mt-4 px-1 sm:px-2">
                    Instant list of no-website leads, ready to contact
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
          
          {/* CTA after comparison — CTA #2 */}
          <ScrollReveal delay={300} className="text-center mt-8 sm:mt-14">
            <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base" asChild>
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-2">
              1 day full access, then £19.99 per month. Cancel anytime before renewal.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <HowItWorksSection ScrollReveal={ScrollReveal} />

      {/* ===== FEATURES SECTION ===== */}
      <section className="relative z-10 py-10 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Everything you need to <span className="text-gradient-primary">find and manage leads</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              Four tools that replace hours of manual prospecting.
            </p>
          </ScrollReveal>
          
          <ScrollReveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 max-w-4xl mx-auto">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative rounded-2xl p-[1px] cursor-pointer transition-all duration-300"
                  style={{
                    background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15), hsl(220 40% 15% / 0.3), hsl(210 100% 50% / 0.08))',
                  }}
                  onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                >
                  <div
                    className="relative rounded-2xl p-5 sm:p-6 h-full"
                    style={{
                      background: 'linear-gradient(180deg, hsl(220 40% 9% / 0.98), hsl(220 40% 6% / 0.99))',
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="p-2 rounded-xl flex-shrink-0"
                        style={{ 
                          background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.15), hsl(210 100% 50% / 0.05))',
                          border: '1px solid hsl(210 100% 50% / 0.1)'
                        }}
                      >
                        <feature.icon className="h-4 w-4" style={{ color: 'hsl(210 100% 50%)' }} strokeWidth={1.5} />
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold tracking-tight">{feature.title}</h3>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===== REVIEWS ===== */}
      <ReviewsSection />

      {/* ===== PRICING SECTION ===== */}
      <section className="relative z-10 py-10 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Simple, transparent <span className="text-gradient-primary">pricing</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              1 day full access, then £19.99 per month. Cancel anytime before renewal.
            </p>
          </ScrollReveal>
          
          <ScrollReveal delay={150}>
            <div className="relative max-w-md mx-auto">
              <div 
                className="absolute -inset-4 sm:-inset-8 rounded-3xl blur-2xl sm:blur-3xl opacity-50"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
              />
              <div 
                className="absolute -inset-px rounded-2xl"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.4), hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.2))' }}
              />
              
              <Card className="relative glass-panel-strong border-0 overflow-hidden">
                <div 
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(to right, transparent, hsl(210 100% 50%), transparent)' }}
                />
                
                <CardHeader className="text-center pb-2 pt-6 sm:pt-8 px-4 sm:px-6">
                  <div 
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide mx-auto mb-3 sm:mb-4"
                    style={{ 
                      background: 'linear-gradient(135deg, hsl(142 76% 36% / 0.2), hsl(142 76% 36% / 0.1))', 
                      border: '1px solid hsl(142 76% 36% / 0.3)',
                      color: 'hsl(142 76% 50%)'
                    }}
                  >
                    <Gift className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    1-Day Free Trial
                  </div>
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Lead<span className="text-gradient-primary">Finder</span> Pro</CardTitle>
                  <div className="mt-4 sm:mt-6">
                    <span className="text-4xl sm:text-5xl font-bold tracking-tight">£19.99</span>
                    <span className="text-muted-foreground ml-1 text-sm sm:text-base">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">1 day full access (24 hours), then auto-renews monthly unless cancelled</p>
                </CardHeader>
                
                <CardContent className="pt-6 sm:pt-8 px-4 sm:px-6">
                  <ul className="space-y-3 sm:space-y-4">
                    {PRICING_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 sm:gap-3">
                        <div 
                          className="flex-shrink-0 p-0.5 sm:p-1 rounded-full"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.1)', 
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: 'hsl(210 100% 50%)' }} strokeWidth={2.5} />
                        </div>
                        <span className="text-foreground/90 text-xs sm:text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                
                <CardFooter className="pt-4 sm:pt-6 pb-6 sm:pb-8 flex-col gap-3 sm:gap-4 px-4 sm:px-6">
                  <Button size="lg" className="w-full btn-premium text-sm sm:text-base font-semibold py-3 sm:py-4 h-auto" asChild>
                    <Link to="/auth">
                      Start Free Trial
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                    Secure checkout. Cancel anytime.
                  </p>
                </CardFooter>
              </Card>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative z-10 py-10 sm:py-16 md:py-20 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center">
            <div 
              className="relative max-w-2xl mx-auto rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.08), hsl(220 80% 45% / 0.04))',
                border: '1px solid hsl(210 100% 50% / 0.15)',
              }}
            >
              <div 
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-40 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, hsl(210 100% 50% / 0.15), transparent 70%)' }}
              />
              
              <h2 className="relative text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 tracking-tight">
                Get your next outreach list in minutes
              </h2>
              <p className="relative text-sm sm:text-base md:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-lg mx-auto leading-relaxed">
                Start the 1 day trial, run a search in your city, save a list, and send your first messages today.
              </p>
              <div className="relative">
                <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base w-full sm:w-auto" asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
              </div>
              <p className="relative text-[10px] sm:text-xs text-muted-foreground mt-4">
                1 day full access (24 hours). Cancel anytime before renewal.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 sm:py-10 md:py-12 mt-6 sm:mt-10 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="flex items-center gap-2">
              <img src={appLogo} alt="LeadFinder Pro" className="h-7 w-7 sm:h-8 sm:w-8" />
              <span className="font-semibold tracking-tight text-sm sm:text-base">
                Lead<span className="text-gradient-primary">Finder</span> Pro
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8 text-xs sm:text-sm text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground transition-colors duration-200">
                Sign In
              </Link>
              <Link to="/auth" className="hover:text-foreground transition-colors duration-200">
                Start Free Trial
              </Link>
              <Link to="/feedback" className="hover:text-foreground transition-colors duration-200">
                Feedback
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors duration-200">
                Terms & Conditions
              </Link>
            </div>
          </div>
          
          <div className="border-t border-white/[0.04] pt-6 sm:pt-8 text-center space-y-3">
            {/* Collapsible data accuracy */}
            <Collapsible>
              <CollapsibleTrigger className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors">
                Data accuracy and sources
                <ChevronDown className="h-3 w-3" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-[10px] sm:text-xs text-muted-foreground/50 max-w-2xl mx-auto leading-relaxed mt-2 px-2">
                  LeadFinder Pro uses third-party data sources and automated classification. Results are not guaranteed to be 100% accurate. Please verify business details before taking action.
                </p>
              </CollapsibleContent>
            </Collapsible>
            
            <p className="text-[10px] sm:text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} LeadFinder Pro. All rights reserved.
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/40">
              Need help? <a href="mailto:beyondwebcraft@outlook.com" className="hover:text-muted-foreground transition-colors">beyondwebcraft@outlook.com</a>
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile sticky bottom CTA */}
      {isMobile && (
        <div 
          className={`fixed bottom-0 left-0 right-0 z-50 p-3 backdrop-blur-xl border-t border-white/10 transition-all duration-300 ${
            hasScrolled ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}
          style={{ background: 'hsl(220 40% 4% / 0.95)' }}
        >
          <Button size="lg" className="w-full btn-premium font-semibold py-3 h-auto text-sm" asChild>
            <Link to="/auth">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            1 day full access (24 hours) · Cancel anytime
          </p>
        </div>
      )}

      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
