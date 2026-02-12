import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search,
  Settings,
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
    description: 'Instantly see which businesses don\'t have a website and prioritise the ones worth contacting.',
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
    description: 'Export your leads and outreach data to CSV — perfect for backups, reporting, or importing into other tools.',
    image: featureExport,
    imageScale: 'scale-100',
  },
  {
    icon: Settings,
    title: 'Customization',
    description: 'Set your accent colour, manage templates, and tailor the dashboard to match how you work.',
    image: featureCustomization,
    imageScale: 'scale-100',
  },
];

const PRICING_FEATURES = [
  'Unlimited lead searches',
  'Instantly find businesses without websites',
  'Built-in CRM to track every lead',
  'One-click WhatsApp & SMS outreach',
  'Message templates included',
  'Track replies and follow-ups',
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
    <div className="text-base sm:text-2xl md:text-3xl font-bold text-gradient-primary tracking-tight">
      {count.toLocaleString()}{suffix}
    </div>
    <div className="text-[10px] sm:text-xs text-foreground/50 mt-1 font-medium">{label}</div>
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
        
        {/* Micro-bridge after video */}
        <p className="text-center text-xs sm:text-sm text-muted-foreground/60 mt-6 sm:mt-10">
          See the difference for yourself.
        </p>
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
                <div className="relative w-full -mx-2">
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
                      className={`w-full h-full object-cover object-top ${feature.imageScale || 'scale-105'}`}
                    />
                    <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-background/70 backdrop-blur-sm">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
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


interface Testimonial {
  name: string;
  role: string;
  region: string;
  quote: string;
  stars: number;
}

const MobileTestimonialSlider = ({ testimonials }: { testimonials: Testimonial[] }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  const t = testimonials[current];

  return (
    <div className="text-center px-2">
      <div key={current} className="animate-fade-in">
        <div className="flex gap-0.5 mb-3 justify-center">
          {[...Array(t.stars)].map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          ))}
        </div>
        <p className="text-foreground/80 text-sm leading-relaxed italic font-normal">
          "{t.quote}"
        </p>
        <p className="text-muted-foreground/60 text-xs mt-4 font-medium">
          {t.name} · {t.role} – {t.region}
        </p>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`rounded-full transition-all duration-300 ${
              index === current
                ? 'w-6 h-2 bg-[hsl(210_100%_50%)]'
                : 'w-2 h-2 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>
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
        {/* Smooth dark navy-to-black gradient base */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.20), transparent 60%)',
          }}
        />
        {/* Very subtle mid-page glow */}
        <div 
          className="absolute top-[40%] left-1/2 -translate-x-1/2 w-full h-[40%]"
          style={{ 
            background: 'radial-gradient(ellipse 90% 50% at 50% 50%, hsl(210 80% 45% / 0.04), transparent 70%)',
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
      <section className="relative z-10 pt-6 pb-6 sm:pt-12 sm:pb-16 md:pt-20 md:pb-28 lg:pt-28 lg:pb-36 px-4">
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
            <span>The fastest way to land web design clients</span>
          </div>
          
          <h1 className="text-[2rem] leading-[1.1] sm:text-5xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-3 sm:mb-6 tracking-tight">
            <span className="block text-gradient-primary">Find Businesses</span>
            <span className="block mt-0.5 sm:mt-2">Without Websites</span>
          </h1>
          
          <p className="text-sm sm:text-lg md:text-xl text-foreground/55 max-w-2xl mx-auto mb-3 sm:mb-8 leading-relaxed px-2">
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
          </div>

          {/* Reassurance microcopy removed from hero */}

          {/* Stats bar - moved above bullets */}
          <div className="mt-5 sm:mt-10 md:mt-12 grid grid-cols-3 gap-2 sm:gap-8 md:gap-14 max-w-xs sm:max-w-xl mx-auto">
            <CountUpStat target={100000} suffix="+" label="Businesses" />
            <div className="text-center">
              <div className="text-base sm:text-2xl md:text-3xl font-bold text-gradient-primary tracking-tight">Global</div>
              <div className="text-[10px] sm:text-xs text-foreground/50 mt-1 font-medium">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-sm sm:text-2xl md:text-3xl font-bold text-gradient-primary tracking-tight">Unlimited</div>
              <div className="text-[10px] sm:text-xs text-foreground/50 mt-1 font-medium">Searches</div>
            </div>
          </div>

          {/* Power bullets under hero CTA */}
          <div className="mt-5 sm:mt-8">
            {/* Mobile: centered checklist group with fixed icon column */}
            <div className="flex justify-center sm:hidden">
              <div className="flex flex-col gap-2 pl-1">
                {[
                  'Find 20+ real prospects in minutes',
                  'Send more outreach in 10 minutes than most do in a morning',
                  'Always know who to follow up and when',
                  'Build a pipeline you can actually rely on',
                ].map((bullet, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 flex-shrink-0 flex justify-center pt-0.5">
                      <Check 
                        className="h-[18px] w-[18px]" 
                        style={{ color: 'hsl(142 76% 55%)' }} 
                        strokeWidth={3} 
                      />
                    </div>
                    <span className="text-[14px] font-medium text-foreground/90 text-left">{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Desktop: horizontal wrap */}
            <div className="hidden sm:flex flex-wrap justify-center gap-x-8 gap-y-2.5">
              {[
                'Find 20+ real prospects in minutes',
                'Send more outreach in 10 minutes than most do in a morning',
                'Always know who to follow up and when',
                'Build a pipeline you can actually rely on',
              ].map((bullet, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Check 
                    className="h-[20px] w-[20px] flex-shrink-0" 
                    style={{ color: 'hsl(142 76% 55%)' }} 
                    strokeWidth={3} 
                  />
                  <span className="text-base font-medium text-foreground/90">{bullet}</span>
                </div>
              ))}
            </div>
          </div>
          

          {/* Scroll down indicator */}
          <div className="mt-6 sm:mt-14 flex flex-col items-center gap-1 animate-bounce opacity-40">
            <span className="text-[10px] sm:text-xs text-muted-foreground tracking-wide">Scroll</span>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="text-muted-foreground">
              <rect x="1" y="1" width="14" height="22" rx="7" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2" fill="currentColor" className="animate-[scroll-dot_2s_ease-in-out_infinite]" />
            </svg>
          </div>
        </div>
      </section>

      {/* Video Demo Section - desktop only (mobile has it in hero) */}
      <div className="hidden sm:block">
        <VideoSection />
      </div>

      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* Unified Testimonials — 3 cards */}
      <ScrollReveal className="relative z-10 py-10 sm:py-16 md:py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          {/* Trust line */}
          <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground font-medium">Rated 4.9/5 by freelancers and agencies</p>
          </div>

          {(() => {
            const testimonials = [
              {
                name: 'James T.',
                role: 'Freelance Web Developer',
                region: 'UK',
                quote: "used to waste my whole morning scrolling maps looking for leads. now i get 30+ in about 10 minutes and actually spend time reaching out instead of searching.",
                stars: 5,
              },
              {
                name: 'Marcus L.',
                role: 'Web Designer',
                region: 'UK',
                quote: "being able to message leads straight from the app on whatsapp or sms is a game changer. i used to copy numbers into my phone one by one — now i just tap and send. way more outreach in way less time.",
                stars: 5,
              },
              {
                name: 'David R.',
                role: 'WordPress Developer',
                region: 'UK',
                quote: "i used to track everything in spreadsheets and sticky notes — half my leads got lost. now it's all in one dashboard. i can see who i've messaged, who replied, and what's next. wish i had this sooner.",
                stars: 5,
              },
            ];

            return isMobile ? (
              <MobileTestimonialSlider testimonials={testimonials} />
            ) : (
              <div className="grid grid-cols-3 gap-6">
                {testimonials.map((r, i) => (
                  <ScrollReveal key={i} delay={i * 100}>
                    <div 
                      className="h-full flex flex-col justify-between text-center px-5 py-6 sm:px-6 sm:py-7 rounded-xl"
                      style={{
                        background: 'hsl(220 30% 8% / 0.6)',
                        border: '1px solid hsl(0 0% 100% / 0.06)',
                        boxShadow: '0 2px 12px hsl(220 40% 4% / 0.3)',
                      }}
                    >
                      <div>
                        <div className="flex gap-0.5 mb-3 justify-center">
                          {[...Array(r.stars)].map((_, si) => (
                            <Star key={si} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                        <p className="text-foreground/80 text-sm leading-relaxed italic font-normal">
                          "{r.quote}"
                        </p>
                      </div>
                      <p className="text-muted-foreground/70 text-xs mt-4 text-center">
                        {r.name} · {r.role} – {r.region}
                      </p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            );
          })()}
        </div>
      </ScrollReveal>

      {/* Desktop: Old Way vs New Way comparison */}
      {!isMobile && (
        <ScrollReveal className="relative z-10 py-16 sm:py-20 md:py-28 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
                Stop Wasting Mornings on <span className="text-gradient-primary">Google Maps</span>
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-base md:text-lg">
                There's a faster way to find businesses without websites.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 lg:gap-14 max-w-5xl mx-auto items-start">
              {/* Old Way */}
              <ScrollReveal delay={100}>
                <div className="opacity-80 hover:opacity-90 transition-opacity duration-300">
                  <div className="flex items-center gap-2.5 justify-center mb-5">
                    <X className="h-5 w-5" style={{ color: 'hsl(0 80% 60%)' }} strokeWidth={2.5} />
                    <h3 className="text-xl font-bold text-foreground/90 tracking-tight">The Old Way</h3>
                  </div>
                  <div className="relative group mb-6">
                    <div 
                      className="absolute -inset-2 rounded-2xl blur-xl opacity-30"
                      style={{ background: 'linear-gradient(to bottom right, hsl(0 60% 40% / 0.3), hsl(0 60% 40% / 0.1))' }}
                    />
                    <div 
                      className="relative rounded-xl overflow-hidden h-[280px] lg:h-[320px]"
                      style={{ 
                        border: '1px solid hsl(0 60% 40% / 0.25)',
                        boxShadow: '0 0 30px hsl(0 60% 40% / 0.1)'
                      }}
                    >
                      <img src={oldWayImage} alt="Manually scrolling Google Maps" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <ul className="space-y-3 text-sm md:text-base text-muted-foreground">
                    <li className="flex items-start gap-2.5"><X className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(0 80% 60%)' }} strokeWidth={2.5} /><span>Hours spent scrolling Google Maps</span></li>
                    <li className="flex items-start gap-2.5"><X className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(0 80% 60%)' }} strokeWidth={2.5} /><span>No way to track who you've contacted</span></li>
                    <li className="flex items-start gap-2.5"><X className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(0 80% 60%)' }} strokeWidth={2.5} /><span>Leads lost in notes and spreadsheets</span></li>
                  </ul>
                </div>
              </ScrollReveal>
              {/* New Way */}
              <ScrollReveal delay={300}>
                <div className="transition-all duration-300 hover:scale-[1.01]" style={{ filter: 'drop-shadow(0 0 24px hsl(142 60% 40% / 0.08))' }}>
                  <div className="flex items-center gap-2.5 justify-center mb-5">
                    <Check className="h-5 w-5" style={{ color: 'hsl(142 76% 55%)' }} strokeWidth={2.5} />
                    <h3 className="text-xl font-bold text-foreground/90 tracking-tight">The LeadFinder Way</h3>
                  </div>
                  <div className="relative group mb-6">
                    <div 
                      className="absolute -inset-2 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-300"
                      style={{ background: 'linear-gradient(to bottom right, hsl(142 60% 40% / 0.3), hsl(142 60% 40% / 0.1))' }}
                    />
                    <div 
                      className="relative rounded-xl overflow-hidden h-[280px] lg:h-[320px]"
                      style={{ 
                        border: '1px solid hsl(142 60% 40% / 0.25)',
                        boxShadow: '0 0 30px hsl(142 60% 40% / 0.1)'
                      }}
                    >
                      <img src={newWayImage} alt="LeadFinder Pro results" className="w-full h-full object-cover object-top" />
                    </div>
                  </div>
                  <ul className="space-y-3 text-sm md:text-base text-muted-foreground">
                    <li className="flex items-start gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(142 76% 55%)' }} strokeWidth={2.5} /><span>Find 20+ leads in minutes</span></li>
                    <li className="flex items-start gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(142 76% 55%)' }} strokeWidth={2.5} /><span>Track every message and follow-up</span></li>
                    <li className="flex items-start gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(142 76% 55%)' }} strokeWidth={2.5} /><span>One click WhatsApp and SMS outreach</span></li>
                  </ul>
                </div>
              </ScrollReveal>
            </div>

          </div>
        </ScrollReveal>
      )}

      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* How It Works — 5 steps */}
      <HowItWorksSection ScrollReveal={ScrollReveal} />


      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* Power Section — Built for serious outreach */}
      <section className="relative z-10 py-12 sm:py-20 md:py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <ScrollReveal className="mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4">
              Your Outreach, <span className="text-gradient-primary">Systemised.</span>
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground">
              A structured workflow for finding leads, sending messages, and tracking every follow-up in one place.
            </p>
          </ScrollReveal>

          <div className="mb-10 sm:mb-14">
            <div className="flex justify-center">
              <div className="flex flex-col gap-2.5 sm:gap-3 pl-2 max-w-[340px] sm:max-w-none">
                {[
                  'Know who to contact and when',
                  'Keep every follow-up organised',
                  'See who replied and what\'s next',
                  'Manage outreach from first message to client',
                ].map((item, i) => (
                  <ScrollReveal key={i} delay={i * 60}>
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 flex-shrink-0 flex justify-center">
                        <Check 
                          className="h-6 w-6 sm:h-7 sm:w-7" 
                          style={{ color: 'hsl(142 76% 55%)' }} 
                          strokeWidth={3} 
                        />
                      </div>
                      <span className="text-base sm:text-lg font-semibold text-foreground/90 tracking-tight text-left">{item}</span>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </div>

          <ScrollReveal delay={300}>
            <p className="text-xs sm:text-sm text-muted-foreground/70 max-w-md mx-auto leading-relaxed text-center mb-8 sm:mb-10">
              Built for freelance web designers, WordPress developers, and small agencies who want a consistent way to find businesses that need a website.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={350} className="hidden sm:block">
            <Button 
              size="lg" 
              className="btn-premium text-base font-semibold px-10 py-5 h-auto w-auto"
              asChild
            >
              <Link to="/auth">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground/60 mt-4">
              Free for 24 hours. No card required. Cancel anytime.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* Features Section — Lead Toolkit */}
      <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-28 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Your Complete
              <span className="text-gradient-primary"> Lead Toolkit</span>
            </h2>
            <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
              Everything you need to find, track, and convert leads into paying clients.
            </p>
          </ScrollReveal>
          
          {/* Mobile: Carousel (4 core features) */}
          {isMobile ? (
              <MobileFeatureCarousel features={FEATURES.filter(f => !['Export Tools', 'Customization'].includes(f.title))} onExpand={(src, title) => setExpandedImage({ src, title })} />
          ) : (
            /* Desktop: 4-card grid — core features only */
            <ScrollReveal>
              <div className="grid grid-cols-2 gap-x-10 gap-y-14 lg:gap-x-14 lg:gap-y-16 max-w-5xl mx-auto">
                {FEATURES.filter(f => !['Export Tools', 'Customization'].includes(f.title)).map((feature, i) => (
                  <ScrollReveal key={feature.title} delay={i * 80}>
                    <div className="flex flex-col gap-4">
                      {/* Title row */}
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="p-2 rounded-lg flex-shrink-0"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.12)',
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <feature.icon className="h-4 w-4" style={{ color: 'hsl(210 100% 60%)' }} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-base lg:text-lg font-semibold tracking-tight">{feature.title}</h3>
                      </div>
                      {/* Description */}
                      <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                      {/* Image with glow */}
                      <div
                        className="group relative cursor-pointer"
                        onClick={() => setExpandedImage({ src: feature.image, title: feature.title })}
                      >
                        <div 
                          className="absolute -inset-2 rounded-2xl blur-xl opacity-25 group-hover:opacity-40 transition-opacity duration-300"
                          style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                        />
                        <div 
                          className="relative rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-[1.01]"
                          style={{ 
                            border: '1px solid hsl(210 100% 50% / 0.15)',
                            boxShadow: '0 0 20px hsl(210 100% 50% / 0.08)'
                          }}
                        >
                          <div className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <Search className="h-4 w-4 text-foreground" />
                          </div>
                          <img 
                            src={feature.image} 
                            alt={feature.title}
                            className={`w-full h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02] ${feature.imageScale || 'scale-100'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* Pricing Section */}
      <section className="relative z-10 py-8 sm:py-14 md:py-20 lg:py-24 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center mb-8 sm:mb-10 md:mb-12">
            <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Simple, Transparent <span className="text-gradient-primary">Pricing</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              One plan. Full access. Cancel anytime.
            </p>
          </ScrollReveal>
          
          <ScrollReveal delay={150}>
            <div className="relative max-w-md mx-auto">
              {/* Glow background */}
              <div 
                className="absolute -inset-4 sm:-inset-8 rounded-3xl blur-2xl sm:blur-3xl opacity-50"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1), hsl(210 100% 50% / 0.1))' }}
              />
              <div 
                className="absolute -inset-px rounded-2xl"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.4), hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.2))' }}
              />
              
              <Card className="relative glass-panel-strong border-0 overflow-hidden">
                {/* Top accent line */}
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
                  <div className="mt-4 sm:mt-5">
                    <span className="text-4xl sm:text-5xl font-bold tracking-tight">£19.99</span>
                    <span className="text-muted-foreground ml-1 text-sm sm:text-base">/month</span>
                  </div>
                  <p className="text-xs text-foreground/50 mt-2">Start with a 24-hour free trial. No charge today.</p>
                </CardHeader>
                
                <CardContent className="pt-5 sm:pt-6 px-4 sm:px-6">
                  <ul className="space-y-2.5 sm:space-y-3">
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
                
                <CardFooter className="pt-4 sm:pt-5 pb-6 sm:pb-7 flex-col gap-3 px-4 sm:px-6">
                  <Button size="lg" className="w-full btn-premium text-sm sm:text-base font-semibold py-3 sm:py-4 h-auto" asChild>
                    <Link to="/auth">
                      Start My Free Trial
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <p className="text-[10px] sm:text-xs text-muted-foreground/60 text-center">
                    £0 today · Full access for 24 hours · Cancel anytime
                  </p>
                </CardFooter>
              </Card>
            </div>
          </ScrollReveal>
        </div>
      </section>


      {/* Mobile section divider */}
      <div className="sm:hidden mx-8 h-px bg-white/[0.06]" />

      {/* Got Questions Section */}
      <section className="relative z-10 py-10 sm:py-14 md:py-16 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center max-w-lg mx-auto">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Got Any <span className="text-gradient-primary">Questions?</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-1.5">
              Fast responses from a real person — no bots, no waiting.
            </p>
            <p className="text-xs text-muted-foreground/60 mb-5">
              We typically reply within minutes.
            </p>
            <a
              href="https://wa.me/447000000000?text=Hi%2C%20I%20have%20a%20question%20about%20LeadFinder%20Pro"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm text-black transition-all duration-200 hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, hsl(142 80% 50%), hsl(142 80% 45%))',
                boxShadow: '0 4px 14px hsl(142 80% 50% / 0.4), 0 0 20px hsl(142 80% 50% / 0.2)',
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Message Us on WhatsApp
            </a>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 sm:py-10 md:py-12 mt-4 sm:mt-12 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
            <span className="font-semibold tracking-tight text-sm sm:text-base">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
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
            24-hour free trial · Cancel anytime
          </p>
        </div>
      )}

      {/* Spacer for sticky CTA on mobile */}
      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
