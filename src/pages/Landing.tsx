import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Target,
  Search,
  ClipboardList,
  Phone,
  FileText,
  Download,
  Zap,
  Check,
  ArrowRight,
  X,
  CheckCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';
import appLogo from '@/assets/logo.png';

const FEATURES = [
  {
    icon: Search,
    title: 'Lead Search',
    description: 'Find businesses without websites in any location using Google Maps data.',
  },
  {
    icon: ClipboardList,
    title: 'CRM Pipeline',
    description: 'Track your outreach progress with a full-featured sales pipeline.',
  },
  {
    icon: Phone,
    title: 'Contact Tracking',
    description: 'Log calls, messages, and outcomes for every lead you contact.',
  },
  {
    icon: FileText,
    title: 'Templates',
    description: 'Use pre-built email and voice note scripts to speed up outreach.',
  },
  {
    icon: Download,
    title: 'Export Tools',
    description: 'Export your leads to CSV for use in external tools and campaigns.',
  },
  {
    icon: Zap,
    title: 'Smart Classification',
    description: 'Automatically classify leads as hot, directory-only, or has website.',
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
      <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
};

// Video section component with sound toggle
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
    <section className="relative z-10 pb-16 md:pb-24 px-4">
      <div className="container mx-auto">
        <div className="relative max-w-4xl mx-auto">
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
      </div>
    </section>
  );
};

const Landing = () => {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
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
              Lead<span className="text-gradient-primary">Finder</span> <span className="hidden xs:inline">Pro</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm px-2 sm:px-4" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild className="btn-premium font-medium text-sm px-3 sm:px-4">
              <Link to="/auth">
                <span className="hidden sm:inline">Get Started</span>
                <span className="sm:hidden">Start</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-8 pb-12 sm:pt-16 sm:pb-24 md:pt-24 md:pb-32 lg:pt-32 lg:pb-40 px-4">
        <div className="container mx-auto text-center">
          {/* Tagline badge - hidden on mobile */}
          <div 
            className="hidden sm:inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 backdrop-blur-sm"
            style={{ 
              border: '1px solid hsl(210 100% 50% / 0.2)', 
              background: 'hsl(210 100% 50% / 0.05)',
              color: 'hsl(210 100% 50%)'
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Lead generation for web professionals</span>
          </div>
          
          <h1 className="text-[2rem] leading-[1.15] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-3 sm:mb-6 tracking-tight px-2 sm:px-0">
            <span className="text-gradient-subtle">Find Businesses</span>
            <br />
            <span className="text-gradient-primary">Without Websites</span>
          </h1>
          
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-10 leading-relaxed px-4 sm:px-2">
            Discover local businesses that need your web design services.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4 px-2 sm:px-0">
            <Button size="lg" className="btn-premium text-sm sm:text-base font-semibold px-6 sm:px-8 py-4 sm:py-6 h-auto w-full sm:w-auto" asChild>
              <Link to="/auth">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-sm sm:text-base px-6 sm:px-8 py-4 sm:py-6 h-auto border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-muted-foreground hover:text-foreground backdrop-blur-sm w-full sm:w-auto" 
              asChild
            >
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
          
          {/* Stats bar - more compact on mobile */}
          <div className="mt-8 sm:mt-16 md:mt-20 flex flex-wrap justify-center gap-6 sm:gap-12 md:gap-20">
            <CountUpStat target={10000} suffix="+" label="Businesses" />
            <div className="text-center">
              <div className="text-xl sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">Global</div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">∞</div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Searches</div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <VideoSection />

      {/* Before/After Comparison Section */}
      <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Stop Searching <span className="text-gradient-primary">Manually</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              Finding businesses without websites used to mean hours of manual searching. Not anymore.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 max-w-6xl mx-auto">
            {/* Old Way */}
            <div className="relative group">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-destructive/30 via-destructive/10 to-transparent opacity-60" />
              <div className="relative rounded-2xl overflow-hidden border border-destructive/20 bg-card/80 backdrop-blur-sm p-3 sm:p-4">
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 flex items-center gap-1.5 sm:gap-2 bg-destructive/90 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-semibold text-[10px] sm:text-xs uppercase tracking-wide shadow-lg">
                  <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  The Old Way
                </div>
                <div className="rounded-xl overflow-hidden">
                  <img
                    src={oldWayImage}
                    alt="Manually searching Google Maps for businesses"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-muted-foreground text-xs sm:text-sm text-center mt-3 sm:mt-4 px-1 sm:px-2">
                  Scrolling through Google Maps, clicking each pin, checking for websites one by one...
                </p>
              </div>
            </div>

            {/* New Way */}
            <div className="relative group">
              {/* Glow effect - fixed brand blue */}
              <div 
                className="absolute -inset-2 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition-opacity duration-500"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.25), hsl(210 100% 50% / 0.1), hsl(220 80% 45% / 0.1))' }}
              />
              <div 
                className="absolute -inset-px rounded-2xl"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.4), hsl(210 100% 50% / 0.2), transparent)' }}
              />
              <div 
                className="relative rounded-2xl overflow-hidden bg-card/90 backdrop-blur-sm p-3 sm:p-4"
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
                <div className="rounded-xl overflow-hidden">
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
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Everything You Need to
              <span className="text-gradient-primary"> Close More Deals</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              A complete toolkit for finding, tracking, and converting leads into paying clients.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="group relative glass-panel-strong border-white/[0.06] transition-all duration-500 overflow-hidden"
                style={{ ['--hover-border' as string]: 'hsl(210 100% 50% / 0.3)' }}
              >
                {/* Hover glow - fixed brand blue */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.03), transparent)' }}
                />
                
                <CardHeader className="relative pb-2 p-4 sm:p-6 sm:pb-2">
                  <div 
                    className="p-2.5 sm:p-3 rounded-xl w-fit mb-3 sm:mb-4 transition-colors duration-500"
                    style={{ 
                      background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.15), hsl(210 100% 50% / 0.05))',
                      border: '1px solid hsl(210 100% 50% / 0.1)'
                    }}
                  >
                    <feature.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: 'hsl(210 100% 50%)' }} strokeWidth={1.5} />
                  </div>
                  <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="relative pt-0 p-4 sm:p-6 sm:pt-0">
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
              Simple, Transparent <span className="text-gradient-primary">Pricing</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
              One plan with everything you need. Cancel anytime.
            </p>
          </div>
          
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
                <div 
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold uppercase tracking-wide mx-auto mb-3 sm:mb-4"
                  style={{ 
                    background: 'hsl(210 100% 50% / 0.1)', 
                    border: '1px solid hsl(210 100% 50% / 0.2)',
                    color: 'hsl(210 100% 50%)'
                  }}
                >
                  <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  Most Popular
                </div>
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Lead<span className="text-gradient-primary">Finder</span> Pro</CardTitle>
                <div className="mt-4 sm:mt-6">
                  <span className="text-4xl sm:text-5xl font-bold tracking-tight">£19.99</span>
                  <span className="text-muted-foreground ml-1 text-sm sm:text-base">/month</span>
                </div>
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
                <Button size="lg" className="w-full btn-premium text-sm sm:text-base font-semibold py-5 sm:py-6 h-auto" asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                  Secure payment via Stripe. Cancel anytime.
                </p>
              </CardFooter>
            </Card>
          </div>
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
                Get Started
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors duration-200">
                Terms & Conditions
              </Link>
            </div>
          </div>
          
          {/* Disclaimer + Copyright */}
          <div className="border-t border-white/[0.04] pt-6 sm:pt-8 text-center space-y-2 sm:space-y-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed px-2">
              Disclaimer: LeadFinder Pro uses AI classification and third-party data sources. 
              Results are not guaranteed to be 100% accurate and may contain errors. 
              Please verify business information independently before taking action.
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} LeadFinder Pro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
