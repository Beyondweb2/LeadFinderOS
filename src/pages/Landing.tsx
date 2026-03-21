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



import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingTheme } from '@/hooks/useLandingTheme';

import step1Search from '@/assets/howto-step1-search.png';
import step2Results from '@/assets/howto-step2-results.png';
import step3Outreach from '@/assets/howto-step3-outreach-crm.png';
import step4Dashboard from '@/assets/howto-step4-dashboard.png';


import previewDashboard from '@/assets/preview-dashboard.jpg';
import previewSearch from '@/assets/preview-search.jpg';
import previewOutreach from '@/assets/preview-outreach.jpg';
import previewTrack from '@/assets/preview-track.jpg';
import previewResults from '@/assets/preview-results.jpg';



import avatarChris from '@/assets/avatar-chris.jpg';
import avatarTom from '@/assets/avatar-tom.jpg';
import avatarAlex from '@/assets/avatar-alex.jpg';
import avatarDaniel from '@/assets/avatar-daniel.jpg';



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
      <div className="text-lg sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-[9px] sm:text-xs text-foreground/60 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">{label}</div>
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
        <p className="text-center text-xs sm:text-sm text-muted-foreground/60 mt-6 sm:mt-10 sm:hidden">
          See the difference for yourself.
        </p>
      </div>
    </ScrollReveal>
  );
};

const productPreviewSlides = [
  {
    image: previewDashboard,
    title: 'Dashboard',
    desc: 'See your entire pipeline at a glance — revenue, active leads and what needs attention today.',
    points: ['Track total revenue & deals won', 'See pipeline by stage', 'Upcoming follow-ups listed'],
  },
  {
    image: previewSearch,
    title: 'Search',
    desc: 'Search any business type in any location and instantly find businesses that need your service.',
    points: ['Search by business type', 'Pick any location', 'Switch countries instantly'],
  },
  {
    image: previewResults,
    title: 'Results',
    desc: 'Instantly see which businesses have no website and add them to your outreach in one click.',
    points: ['Green badge = no website', 'Phone numbers included', 'One-tap add to outreach'],
  },
  {
    image: previewOutreach,
    title: 'Outreach',
    desc: 'Contact businesses via SMS, WhatsApp or phone and manage all conversations in one place.',
    points: ['Track contact status per lead', 'Send SMS & WhatsApp directly', 'Scheduled follow-up reminders'],
  },
  {
    image: previewTrack,
    title: 'Track',
    desc: 'Track deals, notes and follow-ups so no opportunity gets forgotten.',
    points: ['See deal stage at a glance', 'Add notes & history', 'Set next actions with dates'],
  },
];

const ProductPhoneCarousel = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isMobile = useIsMobile();

  // Preload all slide images on mount for smooth swiping
  useEffect(() => {
    productPreviewSlides.forEach((slide) => {
      const img = new Image();
      img.src = slide.image;
    });
  }, []);

  const goNext = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev + 1) % productPreviewSlides.length);
    setTimeout(() => setIsTransitioning(false), 350);
  }, [isTransitioning]);

  const goPrev = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev - 1 + productPreviewSlides.length) % productPreviewSlides.length);
    setTimeout(() => setIsTransitioning(false), 350);
  }, [isTransitioning]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
  };

  const slide = productPreviewSlides[currentSlide];

  return (
    <div className="flex flex-col items-center gap-5 sm:gap-6">
      {/* Slide title + description */}
      <div className="text-center max-w-lg mx-auto px-4">
        <p className="text-sm sm:text-base font-bold tracking-widest uppercase text-primary mb-1.5">
          {slide.title}
        </p>
        <p className="text-sm sm:text-base text-muted-foreground/80 leading-relaxed">
          {slide.desc}
        </p>
      </div>

      {/* Phone + feature boxes + arrows */}
      <div className="relative flex items-center justify-center w-full max-w-[900px]">
        {/* Left arrow */}
        {!isMobile && (
          <button
            onClick={goPrev}
            className="absolute left-0 z-40 p-2.5 sm:p-3 rounded-full border border-border/40 bg-background/70 backdrop-blur-sm hover:bg-background hover:border-primary/40 transition-all text-muted-foreground hover:text-primary"
            aria-label="Previous slide"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}

        {/* Layout: boxes - phone - boxes */}
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch justify-center gap-4 sm:gap-8 w-full">
          {/* Left feature box (desktop) */}
          <div className="hidden sm:flex flex-col justify-center gap-3 flex-1 max-w-[200px]" key={`left-${currentSlide}`} style={{ animation: `fadeSlideIn 0.5s ease 200ms both` }}>
            <FeaturePoint text={slide.points[0]} align="right" delay={0} />
            <FeaturePoint text={slide.points[1]} align="right" delay={150} />
          </div>

          {/* Phone - 20% bigger on desktop */}
          <div
            className="relative w-[220px] sm:w-[310px] flex-shrink-0"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="absolute -inset-10 rounded-full opacity-20 blur-3xl -z-10" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)' }} />
            <div className="rounded-[2rem] sm:rounded-[2.5rem] border-[6px] sm:border-[8px] border-foreground/15 bg-background/80 shadow-2xl overflow-hidden">
              <div className="absolute top-[6px] sm:top-[8px] left-1/2 -translate-x-1/2 w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] bg-foreground/15 rounded-b-xl z-10" />
              <img
                src={slide.image}
                alt={`${slide.title} screen`}
                className="w-full h-auto block transition-opacity duration-300"
                style={{ opacity: isTransitioning ? 0.6 : 1 }}
                draggable={false}
              />
            </div>
          </div>

          {/* Right feature box (desktop) */}
          <div className="hidden sm:flex flex-col justify-center gap-3 flex-1 max-w-[200px]" key={`right-${currentSlide}`} style={{ animation: `fadeSlideIn 0.5s ease 350ms both` }}>
            <FeaturePoint text={slide.points[2]} align="left" delay={300} />
          </div>

          {/* Mobile: all points below phone, centered */}
          <div className="flex sm:hidden flex-col items-center gap-2.5 w-full max-w-[280px]">
            {slide.points.map((pt, i) => (
              <FeaturePoint key={i} text={pt} align="center" delay={i * 100} />
            ))}
          </div>
        </div>

        {/* Right arrow */}
        {!isMobile && (
          <button
            onClick={goNext}
            className="absolute right-0 z-40 p-2.5 sm:p-3 rounded-full border border-border/40 bg-background/70 backdrop-blur-sm hover:bg-background hover:border-primary/40 transition-all text-muted-foreground hover:text-primary"
            aria-label="Next slide"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        )}
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2.5">
        {productPreviewSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={`rounded-full transition-all duration-300 ease-out ${
              i === currentSlide
                ? 'h-3 w-8 bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]'
                : 'h-3 w-3 bg-foreground/20 hover:bg-foreground/30'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Nav hint */}
      <div className="flex items-center gap-2 text-muted-foreground/40">
        {isMobile ? (
          <>
            <ChevronDown className="h-5 w-5 rotate-90 animate-pulse" />
            <span className="text-base font-bold tracking-tight">Swipe</span>
            <ChevronDown className="h-5 w-5 rotate-[-90deg] animate-pulse" />
          </>
        ) : (
          <span className="text-sm text-muted-foreground/30">Use arrow keys or click arrows</span>
        )}
      </div>
    </div>
  );
};

const FeaturePoint = ({ text, align, delay }: { text: string; align: 'left' | 'right' | 'center'; delay: number }) => (
  <div
    className={`flex items-start gap-2 ${
      align === 'right' ? 'justify-end text-right' :
      align === 'center' ? 'justify-center text-center' :
      'justify-start text-left'
    }`}
    style={{ animation: `fadeSlideIn 0.4s ease ${delay + 200}ms both` }}
  >
    {align === 'right' && (
      <span className="text-xs sm:text-sm text-muted-foreground/90 leading-snug">{text}</span>
    )}
    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0 shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
    {(align === 'left' || align === 'center') && (
      <span className="text-xs sm:text-sm text-muted-foreground/90 leading-snug">{text}</span>
    )}
  </div>
);

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
    if (!sessionStorage.getItem('fb_lead_fired')) {
      trackLead();
      sessionStorage.setItem('fb_lead_fired', '1');
    }
    if (user) {
      navigate('/start-free-trial');
    } else {
      navigate('/auth?mode=signup');
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
    <div className="min-h-screen bg-background overflow-hidden" style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
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
              <Link to="/auth?mode=signin">Sign In</Link>
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

            <h1 className="text-3xl sm:text-5xl sm:leading-[1.05] md:text-[3.5rem] lg:text-[3.75rem] font-extrabold lg:font-bold tracking-tight leading-tight">
              <span className="tracking-[0.02em]">Find Businesses</span>
              <br />
              <span className="text-gradient-primary whitespace-nowrap">Without Websites</span>
            </h1>
            
            <p className="text-sm sm:text-lg md:text-lg lg:text-base text-foreground/60 max-w-2xl lg:max-w-[32rem] mx-auto leading-relaxed sm:leading-[1.7] px-2 mt-4 sm:mt-5">
              No clients this month? Find businesses without websites in seconds, contact them instantly, and start closing deals today.
            </p>
            
            {/* CTA */}
            <div className="flex flex-col items-center max-w-[480px] mx-auto w-full px-6 sm:px-0 mt-6 sm:mt-8">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <Button 
                    size="lg" 
                    className="btn-premium text-[13px] sm:text-[16px] font-semibold px-8 sm:px-12 h-[48px] sm:h-[52px] rounded-xl w-full sm:w-auto shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300" 
                    onClick={handleCTA}
                  >
                    Try it free
                  </Button>
                <Button 
                  variant="ghost" 
                  className="hidden sm:inline-flex text-[14px] font-medium text-foreground/40 hover:text-foreground/70 h-[52px] px-5 rounded-xl transition-all duration-200" 
                  asChild
                >
                  <Link to="/auth?mode=signin">
                    Sign in
                  </Link>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-2.5 tracking-wide">
                £0 today • Find leads in seconds
              </p>
              <p className="text-[11px] text-muted-foreground/40 mt-1.5 tracking-wide">
                Join 1,200+ freelancers and agencies already using LeadFinder
              </p>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-5 md:gap-14 max-w-[260px] sm:max-w-xl mx-auto mt-10">
              <CountUpStat target={2300} suffix="+" label="Found this week" />
              <div className="text-center">
                <div className="text-lg sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight">Global</div>
                <div className="text-[9px] sm:text-xs text-foreground/60 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight">Unlimited</div>
                <div className="text-[9px] sm:text-xs text-foreground/60 mt-1 sm:mt-1.5 font-medium uppercase tracking-wider">Searches</div>
              </div>
            </div>

            {/* Scroll down indicator - mobile only */}
            <div className="sm:hidden flex flex-col items-center mt-6 animate-bounce">
              <ChevronDown className="h-5 w-5 text-foreground/30" />
            </div>
          </div>
        </div>
      </section>


      {/* How LeadFinder Works - 4-step section */}
      <section id="how-it-works" className="relative z-10 py-16 sm:py-20 md:py-28 px-3 sm:px-4">
        <div className="container mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-8 sm:mb-10 md:mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              From Search To Client
              <br />
              In <span className="text-gradient-primary">3 Steps</span>
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

      {/* Video Demo Section - desktop only */}
      <div className="hidden sm:block">
        <VideoSection />
      </div>

      {/* Product Preview Section */}
      <section className="relative z-10 py-10 sm:py-16 md:py-24 px-3 sm:px-4">
        <div className="container mx-auto max-w-[1150px]">
          <div className="text-center mb-6 sm:mb-8 md:mb-10">
            <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[1.15]">
              Your Complete
              <br />
              <span className="text-gradient-primary">Lead Toolkit</span>
            </h2>
          </div>

          <ProductPhoneCarousel />
        </div>
      </section>



      {/* Testimonials */}
      <ScrollReveal className="relative z-10 py-10 sm:py-20 md:py-28 px-4">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, hsl(220 30% 6% / 0.2) 20%, hsl(220 30% 6% / 0.3) 50%, hsl(220 30% 6% / 0.2) 80%, transparent 100%)',
          }}
        />
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl md:text-[2.75rem] font-bold tracking-tight leading-[1.2] sm:leading-[1.15] mb-10 sm:mb-12">
            What freelancers and agencies
            <br />
            are <span className="text-gradient-primary">saying</span>
          </h2>

          {(() => {
            const testimonials: Testimonial[] = [
              {
                name: 'Chris P.',
                initials: 'CP',
                role: 'Freelance Web Designer',
                region: 'Manchester',
                quote: "Found 30 businesses without websites in my area in about 10 minutes. Messaged 8 of them, got 3 replies same day. Closed one the next week.",
                stars: 5,
                photo: avatarChris,
              },
              {
                name: 'Tom H.',
                initials: 'TH',
                role: 'Web Developer',
                region: 'Sydney',
                quote: "I used to rewrite cold messages every time. Now I just tweak the template and send. Saves me at least an hour a week.",
                stars: 5,
                photo: avatarTom,
              },
              {
                name: 'Alex M.',
                initials: 'AM',
                role: 'WordPress Freelancer',
                region: 'Toronto',
                quote: "Went from zero leads to a full pipeline in two days. The outreach tracker means I never forget who I messaged.",
                stars: 5,
                photo: avatarAlex,
              },
              {
                name: 'Daniel S.',
                initials: 'DS',
                role: 'Agency Owner',
                region: 'Austin',
                quote: "We use it as a team now. Finding leads fast and keeping outreach organised has made our whole prospecting process tighter.",
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
      <section id="pricing" className="relative z-10 py-16 sm:py-20 md:py-28 px-4">
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

              <h3 className="text-[2rem] sm:text-[2.5rem] font-bold tracking-tight mb-3">Land your next client <span className="text-gradient-primary">this week</span></h3>
              <p className="text-sm sm:text-base text-foreground/65 leading-relaxed mb-8 max-w-sm mx-auto font-medium">
                Everything you need to find, contact and close clients - in one system.
              </p>

              <ul className="space-y-2.5 sm:space-y-2.5 mb-10 sm:mb-12 text-left max-w-sm mx-auto">
                {[
                  'Find businesses with no website in your area in 60 seconds',
                  'Get their phone number and contact them instantly',
                  'Track every follow-up so nothing slips through',
                  'Templates ready to send — no writing from scratch',
                  'See your pipeline and revenue in one dashboard',
                  'Works for any service — web design, SEO, marketing, AI tools',
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

              <p className="text-[11px] sm:text-xs text-muted-foreground/70 mt-4 sm:hidden">
                5-day free trial · £0 today · Cancel anytime
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Got Questions Section */}
      <section className="relative z-10 py-16 sm:py-20 md:py-24 px-4">
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

      {/* Final CTA Section */}
      <section className="relative z-10 py-16 sm:py-20 md:py-28 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1] mb-6">
              Ready to find your
              <br />
              <span className="text-gradient-primary">next client</span>?
            </h2>
            <Button
              size="lg"
              className="btn-premium font-semibold h-14 sm:h-16 px-10 sm:px-14 text-base sm:text-lg rounded-xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 hover:-translate-y-0.5 transition-all duration-300"
              asChild
            >
              <Link to="/auth?mode=signup">
                Start finding leads free →
              </Link>
            </Button>
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
              <Link to="/auth?mode=signin" className="hover:text-foreground transition-colors duration-200">
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
          <Button size="lg" className="w-full btn-premium font-semibold h-[52px] text-sm rounded-2xl" onClick={handleCTA}>
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
