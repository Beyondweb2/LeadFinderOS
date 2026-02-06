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
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';
import demoVideo from '@/assets/leadfinder-demo.mp4';

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
        {/* Cyan accent glow - top center */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px]"
          style={{ 
            background: 'radial-gradient(ellipse 100% 70% at 50% 0%, hsl(195 100% 50% / 0.08), transparent 70%)',
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
          style={{ background: 'hsl(195 100% 50% / 0.06)', animationDelay: '-4s' }}
        />
        <div 
          className="absolute bottom-[10%] left-[30%] w-[400px] h-[400px] rounded-full blur-[140px] animate-float opacity-25"
          style={{ background: 'hsl(200 100% 45% / 0.05)', animationDelay: '-2s' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] backdrop-blur-md bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 glow-effect">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild className="btn-premium font-medium">
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-32 md:pt-32 md:pb-40">
        <div className="container mx-auto px-4 text-center">
          {/* Tagline badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-8 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" />
            <span>Lead generation for web professionals</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
            <span className="text-gradient-subtle">Find Businesses</span>
            <br />
            <span className="text-gradient-primary">Without Websites</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Discover local businesses that need your web design services. 
            Search any location, track your outreach, and close more deals.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="btn-premium text-base font-semibold px-8 py-6 h-auto" asChild>
              <Link to="/auth">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-base px-8 py-6 h-auto border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-muted-foreground hover:text-foreground backdrop-blur-sm" 
              asChild
            >
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
          
          {/* Stats bar */}
          <div className="mt-20 flex flex-wrap justify-center gap-12 md:gap-20">
            {[
              { value: '10,000+', label: 'Businesses' },
              { value: 'Global', label: 'Coverage' },
              { value: '∞', label: 'Searches' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gradient-primary tracking-tight">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <section className="relative z-10 pb-16 md:pb-24">
        <div className="container mx-auto px-4">
          <div className="relative max-w-4xl mx-auto">
            {/* Glow effect behind video */}
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/10 to-primary/10 blur-2xl opacity-40" />
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/30 via-primary/15 to-transparent" />
            
            <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-card/80 backdrop-blur-sm glow-effect">
              <video 
                className="w-full h-auto"
                autoPlay 
                loop 
                muted 
                playsInline
              >
                <source src={demoVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Before/After Comparison Section */}
      <section className="relative z-10 py-24 md:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
              Stop Searching <span className="text-gradient-primary">Manually</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Finding businesses without websites used to mean hours of manual searching. Not anymore.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-6xl mx-auto">
            {/* Old Way */}
            <div className="relative group">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-destructive/30 via-destructive/10 to-transparent opacity-60" />
              <div className="relative rounded-2xl overflow-hidden border border-destructive/20 bg-card/80 backdrop-blur-sm p-4">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-destructive/90 text-white px-3 py-1.5 rounded-full font-semibold text-xs uppercase tracking-wide shadow-lg">
                  <X className="h-3.5 w-3.5" />
                  The Old Way
                </div>
                <div className="rounded-xl overflow-hidden">
                  <img
                    src={oldWayImage}
                    alt="Manually searching Google Maps for businesses"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4 px-2">
                  Scrolling through Google Maps, clicking each pin, checking for websites one by one...
                </p>
              </div>
            </div>

            {/* New Way */}
            <div className="relative group">
              {/* Glow effect */}
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-primary/25 via-primary/10 to-accent/10 blur-xl opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/40 via-primary/20 to-transparent" />
              <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-card/90 backdrop-blur-sm p-4 glow-effect">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-semibold text-xs uppercase tracking-wide shadow-lg">
                  <CheckCircle className="h-3.5 w-3.5" />
                  With LeadFinder
                </div>
                <div className="rounded-xl overflow-hidden">
                  <img
                    src={newWayImage}
                    alt="LeadFinder showing filtered list of businesses without websites"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4 px-2">
                  Instantly see which businesses don't have websites, sorted and ready to contact.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-24 md:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
              Everything You Need to
              <span className="text-gradient-primary"> Close More Deals</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              A complete toolkit for finding, tracking, and converting leads into paying clients.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="group relative glass-panel-strong border-white/[0.06] hover:border-primary/30 transition-all duration-500 overflow-hidden"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <CardHeader className="relative pb-2">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 w-fit mb-4 group-hover:border-primary/25 transition-colors duration-500">
                    <feature.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <CardTitle className="text-lg font-semibold tracking-tight">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="relative pt-0">
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 py-24 md:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
              Simple, Transparent <span className="text-gradient-primary">Pricing</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              One plan with everything you need. Cancel anytime.
            </p>
          </div>
          
          <div className="relative max-w-md mx-auto">
            {/* Glow background */}
            <div className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/10 to-primary/10 blur-3xl opacity-50" />
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/40 via-primary/20 to-accent/20" />
            
            <Card className="relative glass-panel-strong border-0 overflow-hidden">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
              
              <CardHeader className="text-center pb-2 pt-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wide mx-auto mb-4">
                  <Zap className="h-3 w-3" />
                  Most Popular
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">LeadFinder Pro</CardTitle>
                <div className="mt-6">
                  <span className="text-5xl font-bold tracking-tight">£19.99</span>
                  <span className="text-muted-foreground ml-1">/month</span>
                </div>
              </CardHeader>
              
              <CardContent className="pt-8">
                <ul className="space-y-4">
                  {PRICING_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="flex-shrink-0 p-1 rounded-full bg-primary/10 border border-primary/20">
                        <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
                      </div>
                      <span className="text-foreground/90 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter className="pt-6 pb-8 flex-col gap-4">
                <Button size="lg" className="w-full btn-premium text-base font-semibold py-6 h-auto" asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Secure payment via Stripe. Cancel anytime.
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-12 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold tracking-tight">
                Lead<span className="text-gradient-primary">Finder</span> Pro
              </span>
            </div>
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
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
          <div className="border-t border-white/[0.04] pt-8 text-center space-y-3">
            <p className="text-xs text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed">
              Disclaimer: LeadFinder Pro uses AI classification and third-party data sources. 
              Results are not guaranteed to be 100% accurate and may contain errors. 
              Please verify business information independently before taking action.
            </p>
            <p className="text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} LeadFinder Pro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
