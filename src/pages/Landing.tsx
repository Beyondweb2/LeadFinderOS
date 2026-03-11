import { useState, useRef, useEffect, useCallback } from 'react';
import { trackLead } from '@/lib/fbPixel';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search,
  Check,
  
  X,
  Volume2,
  VolumeX,
  MessageSquare,
  Star,
  Zap,
  ChevronDown,
} from 'lucide-react';
import demoVideo from '@/assets/leadfinder-advert-2.mp4';
import appLogo from '@/assets/logo.png';

import featureDashboard from '@/assets/howto-step4-dashboard.png';
import featureClassification from '@/assets/feature-classification.png';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';

import step1Search from '@/assets/howto-step1-search.png';
import step2Results from '@/assets/howto-step2-results.png';
import step3Outreach from '@/assets/howto-step3-outreach-crm.png';
import step4Dashboard from '@/assets/howto-step4-dashboard.png';
import demoSearchInput from '@/assets/demo-search-input.jpg';
import demoSearchResults from '@/assets/demo-search-results.jpg';

import previewDashboard from '@/assets/preview-dashboard.jpg';
import previewSearch from '@/assets/preview-search.jpg';
import previewOutreach from '@/assets/preview-outreach.jpg';
import previewTrack from '@/assets/preview-track.jpg';
import previewResults from '@/assets/preview-results.jpg';

import featureTemplates from '@/assets/feature-templates.png';
import featureContactTracking from '@/assets/feature-contact-tracking.png';
import featureCustomization from '@/assets/feature-customization-new.png';
import featureExport from '@/assets/feature-export.png';
import featureLeadManagement from '@/assets/feature-lead-management.png';
import avatarChris from '@/assets/avatar-chris.jpg';
import avatarTom from '@/assets/avatar-tom.jpg';
import avatarAlex from '@/assets/avatar-alex.jpg';
import avatarDaniel from '@/assets/avatar-daniel.jpg';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

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

// Navigate to start free trial page
const goToStartTrial = (navigate: ReturnType<typeof useNavigate>) => () => {
  navigate('/start-free-trial');
};

// Inline CTA band - desktop only, inserted between sections
const InlineCTA = ({ text = 'Ready to find your next client?', onCTA }: { text?: string; onCTA: () => void }) => (
  <div className="hidden sm:flex items-center justify-center gap-4 py-6 sm:py-8">
    <p className="text-muted-foreground/70 text-sm sm:text-base font-medium">{text}</p>
    <Button className="btn-premium font-semibold text-sm px-6 h-10 shadow-lg shadow-primary/20" onClick={onCTA}>
      Try for free
    </Button>
  </div>
);

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
      <div className="text-[8px] sm:text-xs text-foreground/50 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
};

const MobileHeroVideo = () => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <video
        ref={videoRef}
        src={demoVideo}
        className="w-full h-auto block"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      <button
        onClick={toggleMute}
        className="absolute bottom-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
};

const VideoSection = () => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <ScrollReveal className="relative z-10 pb-8 sm:pb-12 md:pb-16 px-2 sm:px-4">
      <div className="container mx-auto">
        <div className="max-w-4xl mx-auto relative rounded-2xl overflow-hidden border border-border">
          <video
            ref={videoRef}
            src={demoVideo}
            className="w-full h-auto block"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 md:bottom-4 md:right-4 p-2 md:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-4 w-4 md:h-5 md:w-5" /> : <Volume2 className="h-4 w-4 md:h-5 md:w-5" />}
          </button>
        </div>
        <p className="text-center text-xs sm:text-sm text-muted-foreground/60 mt-6 sm:mt-10">
          See the difference for yourself.
        </p>
      </div>
    </ScrollReveal>
  );
};

const productPreviewSlides = [
  { image: previewDashboard, title: 'Dashboard', desc: 'Get a full overview of your pipeline. Track revenue, active leads and upcoming follow-ups.' },
  { image: previewSearch, title: 'Search', desc: 'Find businesses without websites by searching any business type in any location.' },
  { image: previewResults, title: 'Results', desc: 'Instantly see which businesses need a website and add them to your outreach list.' },
  { image: previewOutreach, title: 'Outreach', desc: 'Contact businesses using SMS, WhatsApp or phone and manage conversations in one place.' },
  { image: previewTrack, title: 'Track', desc: 'Track deals, notes and follow-ups so no opportunity gets forgotten.' },
];

const ProductPhoneCarousel = () => {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on('select', onSelect);
    onSelect();
    return () => { carouselApi.off('select', onSelect); };
  }, [carouselApi]);

  const phoneAndControls = (
    <div className="flex flex-col items-center gap-4">
      {/* Phone frame with glow */}
      <div className="relative">
        {/* Background glow */}
        <div
          className="absolute -inset-8 sm:-inset-12 rounded-full opacity-25 blur-3xl -z-10"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.2), transparent 70%)' }}
        />
        <div className="relative w-[230px] sm:w-[260px] md:w-[300px]">
          <div className="rounded-[2rem] sm:rounded-[2.5rem] border-[6px] sm:border-[8px] border-foreground/15 bg-background/80 shadow-2xl overflow-hidden max-h-[440px] sm:max-h-[500px] md:max-h-[560px]">
            {/* Notch */}
            <div className="absolute top-[6px] sm:top-[8px] left-1/2 -translate-x-1/2 w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] bg-foreground/15 rounded-b-xl z-10" />
            <Carousel
              setApi={setCarouselApi}
              opts={{ loop: true }}
              className="w-full"
            >
              <CarouselContent className="-ml-0">
                {productPreviewSlides.map((slide, i) => (
                  <CarouselItem key={i} className="pl-0">
                    <img
                      src={slide.image}
                      alt={`${slide.title} screen`}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              {/* Desktop arrows */}
              {!isMobile && (
                <>
                  <CarouselPrevious className="-left-14 border-foreground/10 bg-background/60 backdrop-blur-sm hover:bg-background/80" />
                  <CarouselNext className="-right-14 border-foreground/10 bg-background/60 backdrop-blur-sm hover:bg-background/80" />
                </>
              )}
            </Carousel>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2.5">
        {productPreviewSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => carouselApi?.scrollTo(i)}
            className={`rounded-full transition-all duration-300 ease-out ${
              i === currentSlide
                ? 'h-2.5 w-7 bg-primary'
                : 'h-2.5 w-2.5 bg-foreground/20 hover:bg-foreground/30'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Mobile swipe hint */}
      {isMobile && (
        <p className="text-[11px] text-muted-foreground/40 tracking-wide">
          ← Swipe to explore →
        </p>
      )}
    </div>
  );

  const textContent = (
    <div className="text-center md:text-left">
      <p className="text-xs font-medium tracking-widest uppercase text-primary/70 mb-2">
        {productPreviewSlides[currentSlide]?.title}
      </p>
      <p className="text-sm sm:text-base text-muted-foreground/70 leading-relaxed max-w-sm mx-auto md:mx-0">
        {productPreviewSlides[currentSlide]?.desc}
      </p>
    </div>
  );

  // Desktop: two-column | Mobile: stacked
  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto] gap-12 items-center">
        <div className="flex flex-col justify-center">{textContent}</div>
        {phoneAndControls}
      </div>
      {/* Mobile layout */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        {phoneAndControls}
        {textContent}
      </div>
    </>
  );
};


interface ToolkitFeature {
  title: string;
  description: string;
  img: string;
}

const ToolkitCarousel = ({ features, onExpand }: { features: ToolkitFeature[]; onExpand: (src: string, title: string) => void }) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    onSelect();
    return () => { api.off('select', onSelect); };
  }, [api]);

  return (
    <ScrollReveal>
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'center' }}
        plugins={[Autoplay({ delay: 4000, stopOnInteraction: true })]}
        className="max-w-xl mx-auto"
      >
        <CarouselContent>
          {features.map((feature, i) => (
            <CarouselItem key={i}>
              <div className="text-center px-2">
                <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-muted-foreground/70 text-sm sm:text-base leading-[1.6] max-w-md mx-auto mb-5 sm:mb-6">
                  {feature.description}
                </p>
                <div 
                  className="relative group cursor-pointer w-full"
                  onClick={() => onExpand(feature.img, feature.title)}
                >
                  <div 
                    className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.01]"
                    style={{ 
                      border: '1px solid hsl(210 100% 50% / 0.2)',
                      boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                    }}
                  >
                    <img src={feature.img} alt={feature.title} loading="lazy" decoding="async" width={640} height={400} className="w-full h-full object-cover" />
                    <div className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm">
                      <Search className="h-3.5 w-3.5 text-foreground/70" />
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {/* Navigation arrows */}
        <div className="flex items-center justify-center gap-4 mt-5">
          <button
            onClick={() => api?.scrollPrev()}
            className="p-2 rounded-full border border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous feature"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>

          <div className="flex items-center gap-1.5">
            <ToolkitDots count={features.length} api={api} />
          </div>

          <button
            onClick={() => api?.scrollNext()}
            className="p-2 rounded-full border border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next feature"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-2">
          {current + 1} / {features.length} · Swipe to explore
        </p>
      </Carousel>
    </ScrollReveal>
  );
};

interface Testimonial {
  name: string;
  initials: string;
  role: string;
  region: string;
  quote: string;
  stars: number;
  photo?: string;
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
    <div className="text-center px-4">
      <div key={current} className="animate-fade-in max-w-[300px] mx-auto">
        <div className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center text-sm font-bold" style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}>
          {t.initials}
        </div>
        <p className="text-foreground/90 text-[13px] font-semibold">{t.name}</p>
        <p className="text-muted-foreground/50 text-[11px] mt-0.5">{t.role} · {t.region}</p>
        <div className="flex gap-0.5 justify-center mt-2 mb-3">
          {[...Array(t.stars)].map((_, si) => (
            <Star key={si} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          ))}
        </div>
        <p className="text-foreground/70 text-[13px] leading-[1.7] italic font-normal">
          "{t.quote}"
        </p>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`rounded-full transition-all duration-300 ${
              index === current
                ? 'w-6 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

const ToolkitDots = ({ count, api }: { count: number; api: any }) => {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActive(api.selectedScrollSnap());
    api.on('select', onSelect);
    onSelect();
    return () => { api.off('select', onSelect); };
  }, [api]);
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => api?.scrollTo(i)}
          className={`rounded-full transition-all duration-300 ${
            i === active
              ? 'w-6 h-2 bg-[hsl(210_100%_50%)]'
              : 'w-2 h-2 bg-muted-foreground/25 hover:bg-muted-foreground/40'
          }`}
        />
      ))}
    </>
  );
};

const Landing = () => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Lock landing page to dark brand theme
  useLandingTheme();

  const handleCTA = useCallback(() => {
    if (user) {
      // Already authenticated — send to checkout, not back into the app
      navigate('/start-free-trial');
    } else {
      navigate('/auth?intent=signup');
    }
  }, [navigate, user]);

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
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.07), transparent 60%)',
          }}
        />
        <div 
          className="absolute top-[40%] left-1/2 -translate-x-1/2 w-full h-[40%]"
          style={{ 
            background: 'radial-gradient(ellipse 90% 50% at 50% 50%, hsl(210 80% 45% / 0.04), transparent 70%)',
          }}
        />
        <div className="absolute inset-0 bg-noise" />
      </div>

      {/* Floating logo icons down the page - desktop only */}
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
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
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

      {/* Header */}
      <header className="relative z-10 backdrop-blur-sm bg-transparent">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8 sm:h-9 sm:w-9" width={36} height={36} />
            <span className="text-base sm:text-lg font-bold tracking-tight">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm px-2 sm:px-4" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
             <Button 
              className="font-semibold text-sm px-3 sm:px-4 btn-premium"
              onClick={handleCTA}
            >
              Try for free
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-6 pb-6 sm:pt-14 sm:pb-16 md:pt-20 md:pb-24 lg:min-h-[calc(100vh-64px)] lg:flex lg:items-center lg:pt-0 lg:pb-0 px-4">
        <div 
          className="hidden lg:block absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[800px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 35%, hsl(210 100% 50% / 0.06), transparent 70%)' }}
        />
        <div className="container mx-auto text-center lg:max-w-[1040px]">
          {/* Mobile: Video at top */}
          <div className="sm:hidden mb-6">
            <MobileHeroVideo />
          </div>

          <div className="max-w-3xl mx-auto lg:max-w-xl">
            <span
              className="hidden sm:inline-block text-xs font-semibold uppercase tracking-widest mb-4 text-muted-foreground/60"
            >
              Built for web devs, agencies & founders
            </span>

            <h1 className="text-3xl sm:text-5xl sm:leading-[1.05] md:text-[3.5rem] lg:text-[3.75rem] font-extrabold lg:font-bold tracking-tight leading-tight">
              <span className="tracking-[0.02em]">Find Businesses</span>
              <br />
              <span className="text-gradient-primary whitespace-nowrap">Without Websites</span>
            </h1>
            
            <p className="text-sm sm:text-lg md:text-lg lg:text-base text-foreground/60 max-w-2xl lg:max-w-[32rem] mx-auto leading-relaxed sm:leading-[1.7] px-2 mt-4 sm:mt-5">
              The all-in-one system to find businesses without websites, contact them instantly, and track every follow-up in one place.
            </p>
            
            {/* CTA */}
            <div className="flex flex-col items-center max-w-[480px] mx-auto w-full px-6 sm:px-0 mt-6 sm:mt-8">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <Button 
                    size="lg" 
                    className="btn-premium text-[13px] sm:text-[16px] font-semibold px-8 sm:px-12 h-[48px] sm:h-[52px] rounded-xl w-auto shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300" 
                    onClick={handleCTA}
                  >
                    Try it free
                  </Button>
                <Button 
                  variant="ghost" 
                  className="hidden sm:inline-flex text-[14px] font-medium text-foreground/40 hover:text-foreground/70 h-[52px] px-5 rounded-xl transition-all duration-200" 
                  asChild
                >
                  <Link to="/auth">
                    Sign in
                  </Link>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-2.5 tracking-wide">
                £0 today • Find leads in seconds
              </p>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-5 md:gap-14 max-w-[260px] sm:max-w-xl mx-auto mt-10">
              <CountUpStat target={80000} suffix="+" label="Businesses" />
              <div className="text-center">
                <div className="text-base sm:text-2xl md:text-3xl font-bold text-gradient-primary tracking-tight">Global</div>
                <div className="text-[8px] sm:text-xs text-foreground/55 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-base sm:text-2xl md:text-3xl font-bold text-gradient-primary tracking-tight">Unlimited</div>
                <div className="text-[8px] sm:text-xs text-foreground/55 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">Searches</div>
              </div>
            </div>

            {/* Feature bullets */}
            <ScrollReveal>
              <div className="flex sm:hidden flex-col items-center justify-center gap-3 mt-5 text-[12px] text-foreground/60 font-medium">
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(142 76% 45%)' }} strokeWidth={2.5} />Get a steady flow of new clients</span>
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(142 76% 45%)' }} strokeWidth={2.5} />Find leads in minutes, not hours</span>
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(142 76% 45%)' }} strokeWidth={2.5} />Start more conversations</span>
              </div>
            </ScrollReveal>
            {/* Scroll down indicator - mobile only */}
            <div className="sm:hidden flex flex-col items-center mt-6 animate-bounce">
              <ChevronDown className="h-5 w-5 text-foreground/30" />
            </div>
          </div>
        </div>
      </section>

      {/* Search Demo Section */}
      <section className="relative z-10 py-12 sm:py-16 md:py-20 px-3 sm:px-4">
        <div className="container mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              Find businesses without websites{' '}
              <span className="text-gradient-primary">in seconds</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground/70 mt-3 sm:mt-4 max-w-2xl mx-auto leading-relaxed">
              Search any business type in any location and instantly see which ones need a website.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-2 gap-3 sm:gap-6 md:gap-8 max-w-2xl mx-auto">
            <ScrollReveal delay={100}>
              <div className="rounded-2xl overflow-hidden border border-border/40 shadow-lg">
                <img 
                  src={demoSearchInput} 
                  alt="Search for electricians in Manchester" 
                  className="w-full h-auto max-h-[340px] sm:max-h-[400px] object-cover object-top" 
                  loading="lazy" 
                />
              </div>
              <p className="text-[10px] sm:text-sm text-muted-foreground/60 text-center mt-2 sm:mt-2.5 font-medium">Search any business type and location</p>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <div className="rounded-2xl overflow-hidden border border-border/40 shadow-lg">
                <img 
                  src={demoSearchResults} 
                  alt="Results showing businesses without websites" 
                  className="w-full h-auto max-h-[340px] sm:max-h-[400px] object-cover object-top" 
                  loading="lazy" 
                />
              </div>
              <p className="text-[10px] sm:text-sm text-muted-foreground/60 text-center mt-2 sm:mt-2.5 font-medium">Instantly see results with hot leads highlighted</p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Video Demo Section - desktop only */}
      <div className="hidden sm:block">
        <VideoSection />
      </div>

      {/* How LeadFinder Works - 4-step section */}
      <section id="how-it-works" className="relative z-10 py-16 sm:py-18 md:py-20 px-3 sm:px-4">
        <div className="container mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-8 sm:mb-10 md:mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              How Lead<span className="text-gradient-primary">Finder</span>
              <br />
              <span className="text-foreground">Works</span>
            </h2>
          </ScrollReveal>

          <div className="space-y-16 sm:space-y-20 md:space-y-20">
            {[
              {
                num: 1,
                title: 'Find Leads',
                body: "Instantly see which businesses don't have a website.",
                img: step2Results,
                alt: 'Find leads results list',
              },
              {
                num: 2,
                title: 'Start Outreach',
                body: 'Call, SMS or WhatsApp businesses in one click and manage every follow-up in one place.',
                img: step3Outreach,
                alt: 'Outreach and contact management',
              },
              {
                num: 3,
                title: 'Track & Close Deals',
                body: 'Track conversations, follow-ups and deals so you never lose track of potential clients.',
                img: step4Dashboard,
                alt: 'Dashboard revenue overview',
              },
            ].map((step) => {
              const isEven = step.num % 2 === 0;
              return (
              <ScrollReveal key={step.num} className="w-full" delay={step.num * 80} direction="up">
                {/* Mobile: stacked centered */}
                <div className="flex flex-col items-center text-center md:hidden">
                  <div className="mb-4 sm:mb-6">
                    <span 
                      className="font-bold text-lg mb-1.5 block"
                      style={{ color: 'hsl(210 100% 60%)' }}
                    >{step.num}.</span>
                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 sm:mb-3">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground/70 text-sm sm:text-base leading-[1.6] max-w-md mx-auto">
                      {step.body}
                    </p>
                  </div>
                  <div 
                    className="relative group cursor-pointer w-full max-w-2xl mx-auto"
                    onClick={() => setExpandedImage({ src: step.img, title: step.title })}
                  >
                    <div 
                      className="absolute -inset-2 rounded-2xl blur-xl opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                      style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                    />
                    <div 
                      className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.01]"
                      style={{ 
                        border: '1px solid hsl(210 100% 50% / 0.2)',
                        boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                      }}
                    >
                      <img src={step.img} alt={step.alt} loading="lazy" decoding="async" width={640} height={400} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                      <div className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm">
                        <Search className="h-3.5 w-3.5 text-foreground/70" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop: alternating layout with large image */}
                <div className={`hidden md:grid grid-cols-12 gap-8 lg:gap-12 items-center`}>
                  {/* Text column */}
                  <div className={`col-span-5 ${isEven ? 'order-2 text-left' : 'order-1 text-left'}`}>
                    <span 
                      className="font-bold text-lg mb-2 block"
                      style={{ color: 'hsl(var(--primary))' }}
                    >{step.num}.</span>
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-3">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground/70 text-sm md:text-base leading-[1.7]">
                      {step.body}
                    </p>
                  </div>
                  {/* Image column */}
                  <div className={`col-span-7 ${isEven ? 'order-1' : 'order-2'}`}>
                    <div 
                      className="relative group cursor-pointer w-full"
                      onClick={() => setExpandedImage({ src: step.img, title: step.title })}
                    >
                      <div 
                        className="absolute -inset-3 rounded-2xl blur-xl opacity-25 group-hover:opacity-40 transition-opacity duration-300"
                        style={{ background: 'linear-gradient(to bottom right, hsl(var(--primary) / 0.2), hsl(220 80% 45% / 0.1))' }}
                      />
                      <div 
                        className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.01]"
                        style={{ 
                          border: '1px solid hsl(var(--primary) / 0.2)',
                          boxShadow: '0 0 24px hsl(var(--primary) / 0.1), 0 0 48px hsl(var(--primary) / 0.05)'
                        }}
                      >
                        <img src={step.img} alt={step.alt} loading="lazy" decoding="async" width={800} height={500} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                        <div className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm">
                          <Search className="h-3.5 w-3.5 text-foreground/70" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
              );
            })}
          </div>



        </div>
      </section>

      {/* Product Preview Section */}
      <section className="relative z-10 py-10 sm:py-14 md:py-16 px-3 sm:px-4">
        <div className="container mx-auto max-w-[1150px]">
          <ScrollReveal className="text-center mb-6 sm:mb-8 md:mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              Your complete{' '}
              <span className="text-gradient-primary">lead generation system</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <ProductPhoneCarousel />
          </ScrollReveal>
        </div>
      </section>

      {/* Section divider */}
      <div className="relative z-10 py-8 sm:py-10 md:py-12">
        <div
          className="mx-auto h-px"
          style={{
            width: '45%',
            background: 'linear-gradient(90deg, transparent 0%, hsl(210 100% 50% / 0.12) 30%, hsl(210 100% 50% / 0.18) 50%, hsl(210 100% 50% / 0.12) 70%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: 'radial-gradient(ellipse 60% 100% at 50% 50%, hsl(220 30% 5% / 0.5), transparent 70%)',
          }}
        />
      </div>

      {/* Your Complete Lead Toolkit */}
      <section className="relative z-10 py-16 sm:py-18 md:py-20 px-3 sm:px-4">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, hsl(220 30% 6% / 0.25) 20%, hsl(220 30% 6% / 0.35) 50%, hsl(220 30% 6% / 0.25) 80%, transparent 100%)',
          }}
        />
        <div className="container mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-8 sm:mb-10 md:mb-12">
            <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              Your Complete
              <br />
              <span className="text-gradient-primary">Lead Toolkit</span>
            </h2>
          </ScrollReveal>

          {(() => {
            const toolkitFeatures = [
              {
                title: 'Templates',
                description: 'WhatsApp, SMS and call scripts ready to send.',
                img: featureTemplates,
              },
              {
                title: 'Smart Dashboard',
                description: 'See your revenue, conversion rate and activity all in one place.',
                img: featureDashboard,
              },
              {
                title: 'Full Customization',
                description: 'Choose your accent colour, switch between themes, and add your profile picture. Make it feel like your app.',
                img: featureCustomization,
              },
              {
                title: 'Lead Management',
                description: 'Track every lead from first message to closed deal so nothing slips through.',
                img: featureLeadManagement,
              },
            ];

            return isMobile ? (
              <ToolkitCarousel features={toolkitFeatures} onExpand={(src, title) => setExpandedImage({ src, title })} />
            ) : (
              <ScrollReveal>
                <div className="grid grid-cols-2 gap-7 lg:gap-8 max-w-5xl mx-auto">
                  {toolkitFeatures.map((feature, i) => (
                    <div key={i} className="flex flex-col group">
                      <div 
                        className="relative cursor-pointer w-full flex-shrink-0 mb-5"
                        onClick={() => setExpandedImage({ src: feature.img, title: feature.title })}
                      >
                        <div 
                          className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm transition-all duration-300 group-hover:scale-[1.015] group-hover:-translate-y-0.5 aspect-[16/10]"
                          style={{ 
                            border: '1px solid hsl(210 100% 50% / 0.15)',
                            boxShadow: '0 0 16px hsl(210 100% 50% / 0.08), 0 4px 12px hsl(220 40% 4% / 0.25)',
                          }}
                        >
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none"
                            style={{
                              boxShadow: '0 0 24px hsl(210 100% 50% / 0.12), 0 6px 24px hsl(220 40% 4% / 0.35)',
                              border: '1px solid hsl(210 100% 50% / 0.25)',
                            }}
                          />
                          <img src={feature.img} alt={feature.title} loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
                          <div className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <Search className="h-3.5 w-3.5 text-foreground/70" />
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <h3 className="text-base lg:text-lg font-extrabold tracking-tight mb-1">{feature.title}</h3>
                        <p className="text-muted-foreground/70 text-sm leading-[1.7] max-w-sm mx-auto">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            );
          })()}
        </div>
      </section>

      {/* Testimonials */}
      <ScrollReveal className="relative z-10 py-16 sm:py-18 md:py-20 px-4">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, hsl(220 30% 6% / 0.2) 20%, hsl(220 30% 6% / 0.3) 50%, hsl(220 30% 6% / 0.2) 80%, transparent 100%)',
          }}
        />
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl md:text-[2.75rem] font-bold tracking-tight leading-[1.2] sm:leading-[1.15] mb-10 sm:mb-12">
            Trusted by freelancers
            <br className="sm:hidden" />
            {' '}and agencies{' '}
            <span className="text-gradient-primary">worldwide</span>
          </h2>

          {(() => {
            const testimonials: Testimonial[] = [
              {
                name: 'Chris P.',
                initials: 'CP',
                role: 'Freelance Designer',
                region: 'UK',
                quote: "Found about 30 businesses without websites in like 10 minutes. Messaged a few straight from the app and already had replies. Pretty mad tool honestly.",
                stars: 5,
                photo: avatarChris,
              },
              {
                name: 'Tom H.',
                initials: 'TH',
                role: 'Web Developer',
                region: 'Australia',
                quote: "The templates save me loads of time. I just tweak the message a bit and send. Way easier than rewriting outreach every time.",
                stars: 5,
                photo: avatarTom,
              },
              {
                name: 'Alex M.',
                initials: 'AM',
                role: 'WordPress Freelancer',
                region: 'Canada',
                quote: "I used to jump between Maps, notes and WhatsApp trying to track outreach. This puts everything in one place. Wish I had it earlier.",
                stars: 5,
                photo: avatarAlex,
              },
              {
                name: 'Daniel S.',
                initials: 'DS',
                role: 'Agency Owner',
                region: 'US',
                quote: "Fair play this is actually really solid. Finding leads fast and keeping outreach organised makes it way easier to stay consistent.",
                stars: 5,
                photo: avatarDaniel,
              },
            ];

            return isMobile ? (
              <MobileTestimonialSlider testimonials={testimonials} />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6 items-start">
                {testimonials.map((r, i) => {
                  const staggerClass = i % 2 === 1 ? 'lg:mt-6' : '';
                  return (
                  <ScrollReveal key={i} delay={i * 100}>
                    <div 
                      className={`flex flex-col text-left px-5 py-6 sm:px-6 sm:py-7 rounded-xl ${staggerClass}`}
                      style={{
                        background: 'hsl(220 30% 8% / 0.6)',
                        border: '1px solid hsl(0 0% 100% / 0.06)',
                        boxShadow: '0 2px 12px hsl(220 40% 4% / 0.3)',
                      }}
                    >
                      {/* Avatar + identity */}
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}
                        >
                          {r.initials}
                        </div>
                        <div>
                          <p className="text-foreground/90 text-sm font-semibold leading-tight">{r.name}</p>
                          <p className="text-muted-foreground/50 text-[11px]">{r.role} · {r.region}</p>
                        </div>
                      </div>
                      {/* Stars */}
                      <div className="flex gap-0.5 mb-3">
                        {[...Array(r.stars)].map((_, si) => (
                          <Star key={si} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      {/* Quote */}
                      <p className="text-foreground/75 text-[14px] leading-[1.7] font-normal">
                        "{r.quote}"
                      </p>
                    </div>
                  </ScrollReveal>
                  );
                })}
              </div>
            );
          })()}

          {/* Leave a Review button */}
          <div className="text-center mt-8 sm:mt-10">
            <Button
              variant="outline"
              className="border-border/30 hover:border-border/50 text-sm rounded-full px-6"
              asChild
            >
              <Link to="/feedback">
                <MessageSquare className="mr-2 h-4 w-4" />
                Leave a Review
              </Link>
            </Button>
          </div>
        </div>
      </ScrollReveal>

      {/* Final CTA - Free Access Card */}
      <section id="pricing" className="relative z-10 py-16 sm:py-18 md:py-20 px-4">
        <div className="container mx-auto max-w-lg text-center">
          <ScrollReveal>
            <div
              className="rounded-2xl px-6 py-9 sm:p-12 text-center"
              style={{
                background: 'linear-gradient(180deg, hsl(220 40% 10%) 0%, hsl(220 45% 7%) 100%)',
                border: '1px solid hsl(210 100% 50% / 0.2)',
                boxShadow: '0 0 60px hsl(210 100% 50% / 0.1), 0 0 90px hsl(210 100% 50% / 0.05), 0 8px 32px hsl(220 40% 4% / 0.5)',
              }}
            >
              <span
                className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-5"
                style={{ background: 'hsl(142 76% 45% / 0.12)', color: 'hsl(142 76% 55%)' }}
              >
                Free Trial
              </span>

              <h3 className="text-[2rem] sm:text-[2.5rem] font-bold tracking-tight mb-3">Lead<span className="text-gradient-primary">Finder</span> Pro</h3>
              <p className="text-sm sm:text-base text-foreground/65 leading-relaxed mb-8 max-w-sm mx-auto font-medium">
                Everything you need to find, contact and close clients - in one system.
              </p>

              <ul className="space-y-2.5 sm:space-y-2.5 mb-10 sm:mb-12 text-left max-w-sm mx-auto">
                {[
                  'Find businesses without websites in seconds',
                  'Add leads to your pipeline in one click',
                  'Message instantly via WhatsApp or SMS',
                  'Track every contact and follow-up',
                  'Built-in templates to move faster',
                  'Smart dashboard to monitor outreach',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[13px] sm:text-sm text-foreground/85 font-medium leading-snug">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 mt-0.5 sm:mt-0" style={{ color: 'hsl(142 76% 50%)' }} strokeWidth={2.5} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="btn-premium font-semibold h-[52px] sm:h-14 px-12 sm:px-16 text-[15px] sm:text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5 transition-all duration-300 w-full sm:w-auto"
                onClick={handleCTA}
              >
                Try for free
              </Button>

              <p className="text-[11px] sm:text-xs text-muted-foreground/70 mt-4">
                5-day free trial · £0 today · Cancel anytime
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Got Questions Section */}
      <section className="relative z-10 py-16 sm:py-18 md:py-20 px-4">
        <div className="container mx-auto">
          <ScrollReveal className="text-center max-w-lg mx-auto">
            <MessageSquare className="h-7 w-7 md:h-8 md:w-8 mx-auto mb-3 text-muted-foreground/60" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-[1.1] mb-3">
              Question About<br className="hidden md:inline" /> <span className="text-gradient-primary">LeadFinder</span>?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground/70 mb-5 leading-[1.6]">
              Message us on WhatsApp and speak to a real person. Usually replies within a few minutes.
            </p>
            <a
              href="https://wa.me/66645468692?text=Hi%2C%20I%20have%20a%20question%20about%20LeadFinder%20Pro"
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
      <footer className="relative z-10 border-t border-white/[0.06] py-10 sm:py-12 md:py-16 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
            <span className="font-bold tracking-tight text-sm sm:text-base">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8 text-xs sm:text-sm text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground transition-colors duration-200">
                Sign In
              </Link>
              <Link to="/start-free-trial" className="hover:text-foreground transition-colors duration-200">
                Try it free
              </Link>
              <Link to="/feedback" className="hover:text-foreground transition-colors duration-200">
                Feedback
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors duration-200">
                Terms & Conditions
              </Link>
            </div>
          </div>
          
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

      {/* Mobile sticky bottom CTA */}
      {isMobile && (
        <div 
          className={`fixed bottom-0 left-0 right-0 z-50 p-3 backdrop-blur-xl border-t border-white/10 transition-all duration-300 ${
            hasScrolled ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}
          style={{ background: 'hsl(220 40% 4% / 0.95)' }}
        >
          <Button size="lg" className="w-full btn-premium font-semibold h-[52px] text-sm rounded-xl" onClick={handleCTA}>
              Try for free
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            5-day free trial · £0 today · Cancel anytime
          </p>
        </div>
      )}

      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
