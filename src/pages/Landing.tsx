import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
  Star,
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
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ReviewsSection } from '@/components/landing/ReviewsSection';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

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
    description: 'Instantly see which businesses have no website — hot leads are highlighted so you never waste time on the wrong ones.',
    image: featureClassification,
    imageScale: 'scale-100',
  },
  {
    icon: ClipboardList,
    title: 'Smart Dashboard',
    description: 'Your entire pipeline at a glance — track searches, outreach progress, conversions, and revenue in real time.',
    image: featureDashboard,
    imageScale: 'scale-100',
  },
  {
    icon: Phone,
    title: 'Contact Tracking',
    description: 'Log every call, text, and follow-up. Update statuses and add notes so you never lose track of a lead.',
    image: featureContactTracking,
    imageScale: 'scale-100',
  },
  {
    icon: FileText,
    title: 'Templates',
    description: 'Ready-to-send WhatsApp, SMS, and call scripts — just pick a template, personalise, and hit send.',
    image: featureTemplates,
    imageScale: 'scale-100',
  },
  {
    icon: FileText,
    title: 'Export Tools',
    description: 'Download your leads as CSV in one click — perfect for importing into other CRMs or keeping offline backups.',
    image: featureExport,
    imageScale: 'scale-100',
  },
  {
    icon: Zap,
    title: 'Customization',
    description: 'Make it yours — choose from 12 themes, pick an accent colour, and set up your workspace exactly how you like it.',
    image: featureCustomization,
    imageScale: 'scale-[0.85]',
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

// Mobile feature carousel with dots and swipe hint
const MobileFeatureCarousel = ({ features, onExpand }: { features: typeof FEATURES; onExpand: (src: string, title: string) => void }) => {
  const [api, setApi] = useState<any>(null);
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div className="px-2">
      <Carousel
        opts={{ loop: true, align: 'start' }}
        plugins={[Autoplay({ delay: 4000, stopOnInteraction: true })]}
        setApi={setApi}
      >
        <CarouselContent>
          {features.map((feature) => (
            <CarouselItem key={feature.title}>
              <div 
                className="flex flex-col items-center text-center cursor-pointer"
                onClick={() => onExpand(feature.image, feature.title)}
              >
                <h3 className="text-lg font-bold tracking-tight mb-1.5">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-3 max-w-xs">
                  {feature.description}
                </p>
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
      </Carousel>
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === current 
                ? 'w-6 h-2' 
                : 'w-2 h-2 opacity-30'
            }`}
            style={{ background: i === current ? 'hsl(210 100% 50%)' : 'hsl(210 20% 50%)' }}
            onClick={() => api?.scrollTo(i)}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/50 text-center mt-2 tracking-wide">
        Swipe to explore
      </p>
    </div>
  );
};

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
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

      {/* Floating logo icons down the page - desktop only, alternating sides */}
      <div className="hidden md:block fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        {[
          { top: '6%', right: '3%', size: 'w-12 h-12 lg:w-16 lg:h-16', opacity: 0.06, duration: 10, delay: 0 },
          { top: '35%', left: '1.5%', size: 'w-10 h-10 lg:w-14 lg:h-14', opacity: 0.045, duration: 13, delay: -3 },
          { top: '65%', right: '2%', size: 'w-10 h-10 lg:w-12 lg:h-12', opacity: 0.04, duration: 11, delay: -6 },
          { top: '88%', left: '4%', size: 'w-10 h-10 lg:w-14 lg:h-14', opacity: 0.035, duration: 15, delay: -4 },
        ].map((pos, i) => (
          <img
            key={i}
            src={appLogo}
            alt=""
            className={`absolute ${pos.size} select-none`}
            style={{
              top: pos.top,
              ...(pos.left ? { left: pos.left } : {}),
              ...(pos.right ? { right: pos.right } : {}),
              opacity: pos.opacity,
              animation: `float ${pos.duration}s ease-in-out infinite`,
              animationDelay: `${pos.delay}s`,
            }}
          />
        ))}
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

      {/* Hero Section */}
      <section className="relative z-10 pt-6 pb-8 sm:pt-12 sm:pb-16 md:pt-20 md:pb-28 lg:pt-28 lg:pb-36 px-4">
        <div className="container mx-auto text-center">
          {/* Mobile: Video at top instead of logo */}
          <div className="sm:hidden mb-6">
            <MobileHeroVideo />
          </div>
          
          {/* Tagline badge - hidden on mobile */}
          <div 
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium mb-6 backdrop-blur-sm"
            style={{ 
              border: '1px solid hsl(210 100% 50% / 0.2)', 
              background: 'hsl(210 100% 50% / 0.08)',
              color: 'hsl(210 100% 65%)'
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Your all-in-one outreach tool</span>
          </div>
          
          <h1 className="text-[2rem] leading-[1.1] sm:text-5xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-3 sm:mb-6 tracking-tight">
            <span className="block text-gradient-primary">Find Businesses</span>
            <span className="block text-foreground mt-0.5 sm:mt-2">Without Websites</span>
          </h1>
          
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-3 sm:mb-8 leading-relaxed px-2">
            Find real businesses without websites, reach out directly via WhatsApp or SMS, and track every lead in one simple dashboard.
          </p>
          
          {/* Keywords removed */}
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4">
            <Button size="lg" className="btn-premium text-sm sm:text-base font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto w-full sm:w-auto shadow-lg shadow-primary/20" asChild>
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
            <Link to="/guide" className="text-sm sm:text-base text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
              See How It Works
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
          </div>
          
          {/* Stats bar */}
          <div className="mt-8 sm:mt-16 md:mt-20 grid grid-cols-3 gap-2 sm:gap-8 md:gap-16 max-w-xs sm:max-w-2xl mx-auto">
            <CountUpStat target={100000} suffix="+" label="Businesses" />
            <div className="text-center">
              <div className="text-lg sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">Global</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">Unlimited</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground mt-1 font-medium">Searches</div>
            </div>
          </div>
          {/* Reassurance microcopy */}
          <p className="text-[11px] sm:text-xs text-muted-foreground text-center mt-3">
            Try everything free for 24 hours. No charge until the trial ends. Cancel anytime.
          </p>

          {/* Scroll down indicator */}
          <div className="mt-6 sm:mt-10 flex flex-col items-center gap-1 animate-bounce opacity-40">
            <span className="text-[10px] sm:text-xs text-muted-foreground tracking-wide">Scroll</span>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="text-muted-foreground">
              <rect x="1" y="1" width="14" height="22" rx="7" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2" fill="currentColor" className="animate-[scroll-dot_2s_ease-in-out_infinite]" />
            </svg>
          </div>
        </div>
      </section>

      {/* Early Social Proof — 2 featured reviews for trust */}
      <ScrollReveal className="relative z-10 pb-6 sm:pb-10 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              { name: 'James T.', role: 'Freelance Web Developer', quote: 'Had a list of 30+ leads in minutes. Landed 3 clients in my first month — paid for itself straight away.', avatar: 'JT', stars: 5 },
              { name: 'Marcus L.', role: 'Web Designer', quote: "We're reaching 5x more businesses than before and actually getting replies. Huge time saver.", avatar: 'ML', stars: 5 },
            ].map((r, i) => (
              <div
                key={i}
                className="rounded-xl px-4 py-4 sm:px-5 sm:py-4"
                style={{
                  background: 'linear-gradient(135deg, hsl(220 40% 10% / 0.95), hsl(220 40% 7% / 0.98))',
                  border: '1px solid hsl(210 100% 50% / 0.12)',
                  boxShadow: '0 4px 20px hsl(210 100% 50% / 0.06)',
                }}
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-2.5 justify-center sm:justify-start">
                  {[...Array(r.stars)].map((_, si) => (
                    <Star key={si} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-foreground/90 text-sm leading-relaxed text-center sm:text-left mb-3">"{r.quote}"</p>
                <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: 'hsl(210 100% 50% / 0.15)',
                      border: '1px solid hsl(210 100% 50% / 0.2)',
                      color: 'hsl(210 100% 65%)',
                    }}
                  >
                    {r.avatar}
                  </div>
                  <p className="text-muted-foreground text-xs">{r.name} · {r.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* Video Demo Section - hidden on mobile since it's in hero */}
      <div className="hidden sm:block">
        <VideoSection />
      </div>

      {/* What you can do in your first 24 hours — standalone section */}
      <section className="relative z-10 py-8 sm:py-12 md:py-16 px-4">
        <div className="container mx-auto">
          <ScrollReveal>
            <div
              className="relative max-w-2xl mx-auto rounded-2xl p-6 sm:p-8 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, hsl(220 40% 10% / 0.95), hsl(220 40% 6% / 0.98))',
                border: '1px solid hsl(210 100% 50% / 0.10)',
              }}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1.5 tracking-tight">
                What you can do in your first 24 hours
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-5">Everything below is included — no limits, no restrictions.</p>
              <ul className="space-y-3.5">
                {[
                  'Search any area and instantly see businesses without websites',
                  'Copy numbers and send your first WhatsApp or SMS messages',
                  'Track every lead from first message to reply',
                  'Use ready-made outreach templates — no copywriting needed',
                  'Decide if it works for you — before you\'re ever charged',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-foreground/90">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'hsl(142 71% 45% / 0.15)', border: '1px solid hsl(142 71% 45% / 0.25)' }}>
                      <Check className="h-3 w-3" style={{ color: 'hsl(142 71% 45%)' }} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="text-center mt-6">
                <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 h-auto text-sm sm:text-base" asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-3">
                  24-hour free trial · £0 charged today · Cancel instantly if it's not for you
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorksSection ScrollReveal={ScrollReveal} />

      {/* Before/After Comparison Section */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
             <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
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

      {/* Benefits / Emotional Hooks Section */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              What If Finding Leads <span className="text-gradient-primary">Didn't</span> Take Hours
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              Search once and instantly see which businesses don't have websites — sorted and ready to contact.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div 
              className="relative max-w-4xl mx-auto rounded-2xl p-6 sm:p-8 md:p-10 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, hsl(220 40% 10% / 0.95), hsl(220 40% 6% / 0.98))',
                border: '1px solid hsl(210 100% 50% / 0.12)',
                boxShadow: '0 0 40px hsl(210 100% 50% / 0.06)',
              }}
            >
              {/* Subtle glow */}
              <div 
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-30 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, hsl(210 100% 50% / 0.12), transparent 70%)' }}
              />

              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {[
                  { bold: 'Find 10x more leads', detail: 'in a fraction of the time you spend now' },
                  { bold: 'Track everything in one place', detail: 'leads, outreach, follow-ups — all in a single dashboard' },
                  { bold: 'Replace hours of searching', detail: 'with a single click — results in seconds' },
                  { bold: 'Turn cold outreach into warm conversations', detail: 'with ready-made templates and scripts' },
                  { bold: 'Close your first deal within days', detail: 'not weeks, not months — days' },
                  { bold: 'Never run out of businesses to contact', detail: 'unlimited searches across the globe' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div 
                      className="flex-shrink-0 mt-0.5 p-1 rounded-full"
                      style={{ 
                        background: 'hsl(142 76% 45% / 0.12)',
                        border: '1px solid hsl(142 76% 45% / 0.2)',
                      }}
                    >
                      <CheckCircle className="h-4 w-4" style={{ color: 'hsl(142 76% 45%)' }} strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-sm sm:text-base font-semibold text-foreground">{item.bold}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative text-center mt-8">
                <Button size="lg" className="btn-premium font-semibold px-6 sm:px-8 py-3 sm:py-4 h-auto text-sm sm:text-base" asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-3">
                  1-day free trial (24 hours) · You won't be charged until the trial ends · Cancel anytime
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Features Section — Lead Toolkit */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Your Complete
              <span className="text-gradient-primary"> Lead Toolkit</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              Everything you need to find, track, and convert leads into paying clients.
            </p>
          </ScrollReveal>
          
          {/* Mobile: Carousel */}
          {isMobile ? (
            <MobileFeatureCarousel features={FEATURES.filter(f => !['Export Tools', 'Customization'].includes(f.title))} onExpand={(src, title) => setExpandedImage({ src, title })} />
          ) : (
            /* Desktop: Auto-playing Carousel */
            <ScrollReveal>
              <div className="max-w-4xl mx-auto px-14">
                <Carousel
                  opts={{ loop: true, align: 'center' }}
                  plugins={[Autoplay({ delay: 4000, stopOnInteraction: true })]}
                >
                  <CarouselContent>
                    {FEATURES.map((feature) => (
                      <CarouselItem key={feature.title}>
                        <Card
                          className="group relative glass-panel-strong border-white/[0.06] transition-all duration-300 overflow-hidden hover:border-[hsl(210_100%_50%_/_0.2)] cursor-pointer"
                          onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                        >
                          <div 
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.03), transparent)' }}
                          />
                          <div className="relative overflow-hidden rounded-t-lg">
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent z-10 pointer-events-none" />
                            <div className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <Expand className="h-4 w-4 text-foreground" />
                            </div>
                            <img 
                              src={feature.image} 
                              alt={feature.title}
                              className={`w-full h-64 sm:h-80 object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] ${feature.imageScale || 'scale-100'}`}
                            />
                          </div>
                          <CardHeader className="relative pb-1 sm:pb-2 p-4 sm:p-5">
                            <div className="flex items-center gap-3">
                              <div 
                                className="p-2 rounded-xl flex-shrink-0"
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
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="border-white/10 bg-card/80 hover:bg-card" />
                  <CarouselNext className="border-white/10 bg-card/80 hover:bg-card" />
                </Carousel>
              </div>
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* Reviews / Social Proof */}
      <ReviewsSection />

      {/* Pricing Section */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
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
                    £0 today · You're only charged after 24 hours · Cancel anytime, no questions asked
                  </p>
                </CardFooter>
              </Card>
            </div>
          </ScrollReveal>
        </div>
      </section>


      {/* Final CTA Section */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 px-4">
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
                 £0 today · Full access for 24 hours · Cancel anytime
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
            1-day free trial (24 hours) · Cancel anytime
          </p>
        </div>
      )}

      {/* Spacer for sticky CTA on mobile */}
      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
