import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import {
  Search,
  ClipboardList,
  Phone,
  FileText,
  Zap,
  Check,
  ArrowRight,
  X,
  CheckCircle,
  Volume2,
  VolumeX,
  Expand,
  MessageSquare,
  Gift,
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';
import appLogo from '@/assets/logo.png';

import featureCustomization from '@/assets/feature-customization-new.png';
import featureContactTracking from '@/assets/howto-step4-trackleads.png';
import featureDashboard from '@/assets/howto-step4-dashboard.png';
import featureExport from '@/assets/feature-export.png';
import featureClassification from '@/assets/feature-classification.png';
import featureTemplates from '@/assets/feature-templates.png';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
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
    title: 'Smart Classification',
    description: 'See which businesses have no website, a directory listing, or an existing site — so you focus on the best leads.',
    image: featureClassification,
    imageScale: 'scale-100',
  },
  {
    icon: ClipboardList,
    title: 'Smart Dashboard',
    description: 'Track performance, revenue, conversions, and productivity all in one place.',
    image: featureDashboard,
    imageScale: 'scale-100',
  },
  {
    icon: Phone,
    title: 'Contact Tracking',
    description: 'Log contact attempts, update lead status, and add notes as you reach out.',
    image: featureContactTracking,
    imageScale: 'scale-100',
  },
  {
    icon: FileText,
    title: 'Templates',
    description: 'Pre-built text and voice scripts to speed up your outreach workflow.',
    image: featureTemplates,
    imageScale: 'scale-100',
  },
  {
    icon: FileText,
    title: 'Export Tools',
    description: 'Export your leads as CSV files to use in other tools or keep as backup.',
    image: featureExport,
    imageScale: 'scale-100',
  },
  {
    icon: Zap,
    title: 'Customization',
    description: 'Personalize your workspace with custom themes and accent colors.',
    image: featureCustomization,
    imageScale: 'scale-100',
  },
];

const PRICING_FEATURES = [
  'Unlimited lead searches',
  'Find businesses without websites',
  'Full CRM access',
  'Contact tracking & notes',
  'Email & call templates',
  'Export leads to outreach',
  'Priority support',
];

// Count-up animation component
const CountUpStat = ({ target, suffix, label }: { target: number; suffix: string; label: string }) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 3500;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-lg sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
};

// Mobile hero video component - compact version for hero section
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
      {/* Glow effect behind video */}
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
        
        {/* Sound toggle button */}
        <button
          onClick={toggleMute}
          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background/90 transition-colors duration-200"
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
};

// Video section component with sound toggle (desktop)
// Starts muted (required for autoplay) - user can unmute
const VideoSection = () => {
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
    <ScrollReveal className="relative z-10 pb-10 sm:pb-14 md:pb-20 px-2 sm:px-4">
      <div className="container mx-auto">
        {/* Constrained on larger screens */}
        <div className="relative max-w-5xl mx-auto">
          {/* Glow effect behind video - fixed brand blue */}
          <div 
            className="absolute -inset-4 rounded-3xl blur-2xl opacity-40"
            style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
          />
          <div 
            className="absolute -inset-px rounded-2xl"
            style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.15), transparent)' }}
          />
          
          <div 
            className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm"
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
            
            {/* Sound toggle button */}
            <button
              onClick={toggleMute}
              className="absolute bottom-3 right-3 md:bottom-4 md:right-4 p-2 md:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background/90 transition-colors duration-200"
              aria-label={isMuted ? "Unmute video" : "Mute video"}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 md:h-5 md:w-5" />
              ) : (
                <Volume2 className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </button>
          </div>
        </div>
        
        {/* CTA after video */}
        <div className="text-center mt-6 sm:mt-10 md:mt-12">
          <Button size="lg" className="btn-premium font-semibold px-5 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base" asChild>
            <Link to="/auth">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </ScrollReveal>
  );
};

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const isMobile = useIsMobile();
  
  // Lock landing page to dark brand theme
  useLandingTheme();

  // Track scroll to show/hide sticky CTA and adjust header button
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
      {/* Capture affiliate codes from URL */}
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
        {/* Deep blue gradient from top */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'radial-gradient(ellipse 120% 80% at 50% -30%, hsl(210 100% 15% / 0.5), transparent 60%)',
          }}
        />
        {/* Blue accent glow - top center */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px]"
          style={{ 
            background: 'radial-gradient(ellipse 100% 70% at 50% 0%, hsl(210 100% 50% / 0.08), transparent 70%)',
          }}
        />
        {/* Subtle blue glow - bottom right */}
        <div 
          className="absolute bottom-0 right-0 w-[800px] h-[600px]"
          style={{ 
            background: 'radial-gradient(ellipse 80% 80% at 100% 100%, hsl(210 100% 40% / 0.06), transparent 60%)',
          }}
        />
        {/* Subtle noise texture */}
        <div className="absolute inset-0 bg-noise" />
      </div>

      {/* Floating orbs - subtle and slow */}
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

      {/* Header - blends into hero */}
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
              className={`font-medium text-sm px-3 sm:px-4 transition-all duration-300 ${
                isMobile && !hasScrolled 
                  ? 'border border-white/20 bg-transparent hover:bg-white/[0.06] text-foreground' 
                  : 'btn-premium'
              }`}
              variant={isMobile && !hasScrolled ? 'outline' : 'default'}
            >
              <Link to="/auth">
                <span className="hidden sm:inline">Start Free Trial</span>
                <span className="sm:hidden">Free Trial</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-6 pb-8 sm:pt-12 sm:pb-16 md:pt-20 md:pb-28 lg:pt-28 lg:pb-36 px-4">
        <div className="container mx-auto text-center">
          {/* Mobile: Video at top instead of logo */}
          <div className="sm:hidden mb-6">
            <MobileHeroVideo />
          </div>
          
          {/* Tagline badge - hidden on mobile */}
          <div 
            className="hidden sm:inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-8 backdrop-blur-sm"
            style={{ 
              border: '1px solid hsl(210 100% 50% / 0.3)', 
              background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.1), hsl(210 100% 50% / 0.05))',
              color: 'hsl(210 100% 60%)'
            }}
          >
            <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Lead generation for web professionals</span>
          </div>
          
          <h1 className="text-[2rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold mb-3 sm:mb-6 tracking-tight">
            <span className="block text-foreground">Find Businesses</span>
            <span className="block text-gradient-primary mt-0.5 sm:mt-2">Without Websites</span>
          </h1>
          
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-6 sm:mb-12 leading-relaxed px-2">
            Find local businesses without websites and reach out directly.
            <span className="hidden sm:inline"> Stop scrolling Google Maps — start contacting prospects.</span>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4">
            <Button size="lg" className="btn-premium text-sm sm:text-base font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto w-full sm:w-auto shadow-lg shadow-primary/20" asChild>
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-sm sm:text-base px-6 sm:px-8 py-3 sm:py-4 h-auto border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-foreground backdrop-blur-sm w-full sm:w-auto" 
              asChild
            >
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
          
          {/* Stats bar */}
          <div className="mt-8 sm:mt-16 md:mt-20 grid grid-cols-3 gap-2 sm:gap-8 md:gap-16 max-w-xs sm:max-w-xl mx-auto">
            <div className="text-center">
              <div className="text-lg sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">100K+</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">Businesses</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">Global</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">∞</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">Searches</div>
            </div>
          </div>
          {/* Mobile reassurance microcopy */}
          <p className="sm:hidden text-[11px] text-muted-foreground text-center mt-3">
            Set up in under 60 seconds. No credit card needed.
          </p>
        </div>
      </section>

      {/* Video Demo Section - hidden on mobile since it's in hero */}
      <div className="hidden sm:block">
        <VideoSection />
      </div>

      {/* Before/After Comparison Section */}
      <section className="relative z-10 py-12 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Stop Searching <span className="text-gradient-primary">Manually</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              Finding businesses without websites used to mean hours of manual searching. Not anymore.
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
                    Scrolling through Google Maps, clicking each pin, checking for websites one by one...
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* New Way */}
            <ScrollReveal delay={200} direction="right">
              <div className="relative group">
                {/* Glow effect - subtle */}
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
                    Instantly see which businesses don't have websites, sorted and ready to contact.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
          
          {/* CTA after comparison - hidden on mobile to reduce density */}
          <ScrollReveal delay={300} className="hidden sm:block text-center mt-10 sm:mt-14">
            <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base" asChild>
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
          </ScrollReveal>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorksSection ScrollReveal={ScrollReveal} />

      {/* Features Section */}
      <section className="relative z-10 py-12 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Everything You Need to
              <span className="text-gradient-primary"> Close More Deals</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              A complete toolkit for finding, tracking, and converting leads into paying clients.
            </p>
          </ScrollReveal>
          
          {/* Mobile Carousel */}
          {isMobile ? (
            <div className="w-full mx-auto">
              <Carousel
                opts={{ loop: true, startIndex: 0 }}
                plugins={[
                  Autoplay({
                    delay: 4000,
                    stopOnInteraction: true,
                    stopOnMouseEnter: true,
                  }),
                ]}
                className="w-full"
                setApi={(api) => {
                  if (api) {
                    setFeatureIndex(api.selectedScrollSnap());
                    api.on('select', () => {
                      setFeatureIndex(api.selectedScrollSnap());
                    });
                  }
                }}
              >
                <CarouselContent>
                  {FEATURES.filter(f => !['Export Tools', 'Customization'].includes(f.title)).map((feature) => (
                    <CarouselItem key={feature.title}>
                      <div 
                        className="flex flex-col items-center text-center px-1 cursor-pointer"
                        onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                      >
                        {/* Feature Title */}
                        <h3 className="text-lg font-bold tracking-tight mb-2">{feature.title}</h3>
                        
                        <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-xs">
                          {feature.description}
                        </p>
                        
                        {/* Full-width image */}
                        <div className="relative w-full">
                          <div 
                            className="relative rounded-lg overflow-hidden bg-card/80 aspect-[16/10]"
                            style={{ 
                              border: '1px solid hsl(210 100% 50% / 0.15)',
                              boxShadow: '0 0 12px hsl(210 100% 50% / 0.08)'
                            }}
                          >
                            <img 
                              src={feature.image} 
                              alt={feature.title}
                              className={`w-full h-full object-cover object-top ${feature.imageScale || 'scale-100'}`}
                            />
                            <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-background/70 backdrop-blur-sm">
                              <Expand className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                
                {/* Custom navigation arrows - smaller */}
                <CarouselPrevious className="-left-1 h-8 w-8 bg-primary/90 border-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-lg" />
                <CarouselNext className="-right-1 h-8 w-8 bg-primary/90 border-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-lg" />
              </Carousel>
              
              {/* Dot indicators */}
              <div className="flex justify-center gap-2 mt-6">
                {FEATURES.filter(f => !['Export Tools', 'Customization'].includes(f.title)).map((_, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      featureIndex === index 
                        ? 'w-6 bg-primary' 
                        : 'bg-muted-foreground/30'
                    }`}
                    aria-label={`Go to feature ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Desktop Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {FEATURES.map((feature, index) => (
                <ScrollReveal key={feature.title} delay={index * 100}>
                  <Card
                    className="group relative glass-panel-strong border-white/[0.06] transition-all duration-300 overflow-hidden h-full hover:border-[hsl(210_100%_50%_/_0.2)] cursor-pointer"
                    onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                  >
                    {/* Hover glow - subtle */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.03), transparent)' }}
                    />
                    
                    {/* Screenshot image */}
                    <div className="relative overflow-hidden rounded-t-lg">
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent z-10 pointer-events-none" />
                      {/* Expand icon overlay */}
                      <div className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Expand className="h-4 w-4 text-foreground" />
                      </div>
                      <img 
                        src={feature.image} 
                        alt={feature.title}
                        className={`w-full h-40 sm:h-48 object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] ${feature.imageScale || 'scale-100'}`}
                      />
                    </div>
                    
                    <CardHeader className="relative pb-1 sm:pb-2 p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-xl transition-colors duration-500 flex-shrink-0"
                          style={{ 
                            background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.15), hsl(210 100% 50% / 0.05))',
                            border: '1px solid hsl(210 100% 50% / 0.1)'
                          }}
                        >
                          <feature.icon className="h-4 w-4" style={{ color: 'hsl(210 100% 50%)' }} strokeWidth={1.5} />
                        </div>
                        <CardTitle className="text-base sm:text-lg font-semibold tracking-tight leading-tight">{feature.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="relative pt-0 p-4 sm:p-5 sm:pt-0">
                      <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                </ScrollReveal>
              ))}
            </div>
          )}
          
          {/* CTA after features */}
          <ScrollReveal delay={600} className="hidden sm:block text-center mt-10 sm:mt-14">
            <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base" asChild>
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 py-12 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Simple, Transparent <span className="text-gradient-primary">Pricing</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              One plan with everything you need. Cancel anytime.
            </p>
          </ScrollReveal>
          
          <ScrollReveal delay={150}>
            <div className="relative max-w-md mx-auto">
              {/* Glow background - fixed brand blue */}
              <div 
                className="absolute -inset-4 sm:-inset-8 rounded-3xl blur-2xl sm:blur-3xl opacity-50"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
              />
              <div 
                className="absolute -inset-px rounded-2xl"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.4), hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.2))' }}
              />
              
              <Card className="relative glass-panel-strong border-0 overflow-hidden">
                {/* Top accent line - fixed brand blue */}
                <div 
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(to right, transparent, hsl(210 100% 50%), transparent)' }}
                />
                
                <CardHeader className="text-center pb-2 pt-6 sm:pt-8 px-4 sm:px-6">
                  {/* 1-Day Free Trial Badge */}
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
                  <p className="text-xs text-muted-foreground mt-2">after 1-day free trial (24 hours)</p>
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
                    No commitment. Cancel anytime during trial.
                  </p>
                </CardFooter>
              </Card>
            </div>
          </ScrollReveal>
        </div>
      </section>


      {/* Final CTA Section */}
      <section className="relative z-10 py-12 sm:py-16 md:py-20 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center">
            <div 
              className="relative max-w-2xl mx-auto rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.08), hsl(220 80% 45% / 0.04))',
                border: '1px solid hsl(210 100% 50% / 0.15)',
              }}
            >
              {/* Glow effect */}
              <div 
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-40 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, hsl(210 100% 50% / 0.15), transparent 70%)' }}
              />
              
              <h2 className="relative text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 tracking-tight">
                Ready to Find Your Next Client?
              </h2>
              <p className="relative text-sm sm:text-base md:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-lg mx-auto">
                Start finding businesses that need your services.
              </p>
              <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base w-full sm:w-auto" asChild>
                  <Link to="/auth">
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
              </div>
              <p className="relative text-[10px] sm:text-xs text-muted-foreground mt-4">
                1-day free trial (24 hours) • Cancel anytime
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 sm:py-10 md:py-12 mt-8 sm:mt-12 px-4">
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
          
          {/* Disclaimer + Copyright + Contact */}
          <div className="border-t border-white/[0.04] pt-6 sm:pt-8 text-center space-y-2 sm:space-y-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed px-2">
              Disclaimer: LeadFinder Pro uses AI classification and third-party data sources. 
              Results are not guaranteed to be 100% accurate and may contain errors. 
              Please verify business information independently before taking action.
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} LeadFinder Pro. All rights reserved.
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/40">
              Need help? <a href="mailto:beyondwebcraft@outlook.com" className="hover:text-muted-foreground transition-colors">beyondwebcraft@outlook.com</a>
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile sticky bottom CTA - only after scrolling past hero */}
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
            1-day free trial (24 hours) · No credit card needed
          </p>
        </div>
      )}

      {/* Spacer for sticky CTA on mobile */}
      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
