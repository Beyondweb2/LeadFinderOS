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
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

// Define ScrollReveal locally to pass to lazy loaded component
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
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  useLandingTheme();

  useEffect(() => {
    const onScroll = () => setHasScrolled(window.scrollY > window.innerHeight * 0.35);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  
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
            <Button asChild className="font-semibold text-sm px-3 sm:px-4 btn-premium"><Link to="/auth?intent=upgrade">Try it free</Link></Button>
          </div>
        </div>
      </header>

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
                <Link to="/auth?intent=upgrade">Try it free <ArrowRight className="ml-2 h-5 w-5" /></Link>
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

      <section className="relative z-10 py-10 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4">Stop Manually Scrolling <span className="text-gradient-primary">Google Maps</span></h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-12">There's a faster way to find businesses without websites.</p>
          <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <img src={newWayImage} alt="LeadFinder Pro Interface" className="w-full h-auto" />
          </div>
        </div>
      </section>

      <div id="how-it-works"><Suspense fallback={<div className="py-20" />}><HowItWorksSection ScrollReveal={ScrollReveal} /></Suspense></div>

      <footer className="relative z-10 border-t border-white/[0.06] py-12 mt-12 px-4">
        <div className="container mx-auto text-center space-y-6">
          <div className="flex flex-col items-center gap-4">
            <span className="font-bold tracking-tight text-base">Lead<span className="text-gradient-primary">Finder</span> Pro</span>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground">Sign In</Link>
              <Link to="/auth?intent=upgrade" className="hover:text-foreground">Try it free</Link>
              <Link to="/feedback" className="hover:text-foreground">Feedback</Link>
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} LeadFinder Pro. All rights reserved.</p>
        </div>
      </footer>

      {isMobile && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 p-3 backdrop-blur-xl border-t border-white/10 transition-all duration-300 ${hasScrolled ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`} style={{ background: 'hsl(220 40% 4% / 0.95)' }}>
          <Button size="lg" className="w-full btn-premium font-semibold h-[52px] text-sm rounded-xl" asChild>
            <Link to="/auth?intent=upgrade">Try it free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">No card required · Cancel anytime</p>
        </div>
      )}
      {isMobile && hasScrolled && <div className="h-24" />}
    </div>
  );
};

export default Landing;
