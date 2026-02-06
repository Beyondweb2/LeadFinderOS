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
  Sparkles,
} from 'lucide-react';
import oldWayImage from '@/assets/old-way-maps.png';
import newWayImage from '@/assets/new-way-leadfinder.png';

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
      {/* Global background effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Hero gradient glow */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[600px]"
          style={{ background: 'var(--gradient-hero)' }}
        />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        {/* Noise texture */}
        <div className="absolute inset-0 bg-noise" />
        {/* Bottom section glow */}
        <div 
          className="absolute bottom-0 right-0 w-[80%] h-[600px]"
          style={{ background: 'var(--gradient-section)' }}
        />
      </div>

      {/* Floating orbs for visual interest */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-20 left-[10%] w-72 h-72 rounded-full blur-[100px] animate-float"
          style={{ background: 'hsl(173 80% 45% / 0.1)' }}
        />
        <div 
          className="absolute top-[60%] right-[5%] w-96 h-96 rounded-full blur-[120px] animate-float"
          style={{ background: 'hsl(173 80% 45% / 0.08)', animationDelay: '-3s' }}
        />
        <div 
          className="absolute bottom-20 left-[20%] w-64 h-64 rounded-full blur-[80px] animate-float"
          style={{ background: 'hsl(200 80% 50% / 0.05)', animationDelay: '-1.5s' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm bg-background/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 glow-effect">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild className="glow-effect">
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-24 md:py-36">
        <div className="container mx-auto px-4 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-8 backdrop-blur-sm">
            <Sparkles className="h-4 w-4" />
            Find leads that need your services
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight tracking-tight">
            Find Businesses
            <br />
            <span className="text-gradient-primary">Without Websites</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Discover local businesses that need your web design services. Search any
            location, track your outreach, and close more deals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="glow-effect text-lg px-8 py-6" asChild>
              <Link to="/auth">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-border/50 bg-card/30 backdrop-blur-sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
          
          {/* Stats bar */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 md:gap-16">
            {[
              { value: '20+', label: 'Countries' },
              { value: 'Global', label: 'Coverage' },
              { value: '∞', label: 'Searches' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gradient-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After Comparison Section */}
      <section className="relative z-10 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Stop Searching <span className="text-gradient-primary">Manually</span>
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16">
            Finding businesses without websites used to mean hours of manual Google Maps searching. Not anymore.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-6xl mx-auto">
            {/* Old Way */}
            <div className="relative group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-destructive/20 to-destructive/10 blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative">
                <div className="absolute -top-4 left-4 z-10 flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full font-semibold text-sm shadow-lg">
                  <X className="h-4 w-4" />
                  The Old Way
                </div>
                <div className="rounded-2xl overflow-hidden border border-destructive/30 bg-card/80 backdrop-blur-sm p-3">
                  <img
                    src={oldWayImage}
                    alt="Manually searching Google Maps for businesses"
                    className="w-full h-auto rounded-xl"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Scrolling through Google Maps, clicking each pin, checking for websites one by one...
                </p>
              </div>
            </div>

            {/* New Way */}
            <div className="relative group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/30 to-primary/10 blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="absolute -top-4 left-4 z-10 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold text-sm shadow-lg">
                  <CheckCircle className="h-4 w-4" />
                  With LeadFinder
                </div>
                <div className="rounded-2xl overflow-hidden border border-primary/30 bg-card/80 backdrop-blur-sm p-3 glow-effect">
                  <img
                    src={newWayImage}
                    alt="LeadFinder showing filtered list of businesses without websites"
                    className="w-full h-auto rounded-xl"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Instantly see which businesses don't have websites, sorted and ready to contact.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Everything You Need to
            <span className="text-gradient-primary"> Close More Deals</span>
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16">
            A complete toolkit for finding, tracking, and converting leads into paying clients.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => (
              <Card
                key={feature.title}
                className="group relative glass-panel border-border/50 hover:border-primary/40 transition-all duration-300 overflow-hidden"
              >
                {/* Hover glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader className="relative">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 w-fit mb-3 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Simple, Transparent <span className="text-gradient-primary">Pricing</span>
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16">
            One plan with everything you need. Cancel anytime.
          </p>
          
          <div className="relative max-w-md mx-auto">
            {/* Glow background */}
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-2xl opacity-60" />
            
            <Card className="relative glass-panel border-primary/30 overflow-hidden">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
              
              <CardHeader className="text-center pb-2 pt-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mx-auto mb-4">
                  <Zap className="h-3 w-3" />
                  Most Popular
                </div>
                <CardTitle className="text-2xl">LeadFinder Pro</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">£19.99</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-4">
                  {PRICING_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="p-1 rounded-full bg-primary/20">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pb-8">
                <Button size="lg" className="w-full glow-effect text-lg py-6" asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          <p className="text-xs text-muted-foreground text-center mt-6">
            Secure payment via Stripe. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-12 mt-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Get Started
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} LeadFinder Pro. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
