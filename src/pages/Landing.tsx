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
 
 const STEPS = [
   {
     number: '01',
     title: 'Search for businesses',
     description: 'Enter a keyword and location to find businesses without websites in your target area.',
   },
   {
     number: '02',
     title: 'Add hot leads to pipeline',
     description: 'Review the results and add the most promising leads to your outreach pipeline.',
   },
   {
     number: '03',
     title: 'Track outreach & close deals',
     description: 'Contact leads, log your interactions, and move them through your sales funnel.',
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
     <div className="min-h-screen bg-background">
       {/* Background glow */}
       <div
         className="fixed inset-0 pointer-events-none opacity-30"
         style={{ background: 'var(--gradient-glow)' }}
       />
 
       {/* Header */}
       <header className="relative z-10 border-b border-border/50">
         <div className="container mx-auto px-4 py-4 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
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
             <Button asChild>
               <Link to="/auth">Get Started</Link>
             </Button>
           </div>
         </div>
       </header>
 
       {/* Hero Section */}
       <section className="relative z-10 py-20 md:py-32">
         <div className="container mx-auto px-4 text-center">
           <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
             Find Businesses
             <br />
             <span className="text-gradient-primary">Without Websites</span>
           </h1>
           <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
             Discover local businesses that need your web design services. Search any
             location, track your outreach, and close more deals.
           </p>
           <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
             <Button size="lg" className="glow-effect" asChild>
               <Link to="/auth">
                 Start Free Trial
                 <ArrowRight className="ml-2 h-5 w-5" />
               </Link>
             </Button>
             <Button size="lg" variant="outline" asChild>
               <Link to="/auth">Sign In</Link>
             </Button>
           </div>
         </div>
        </section>

        {/* Before/After Comparison Section */}
        <section className="relative z-10 py-20 bg-card/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
              Stop Searching <span className="text-gradient-primary">Manually</span>
            </h2>
            <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
              Finding businesses without websites used to mean hours of manual Google Maps searching. Not anymore.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Old Way */}
              <div className="relative">
                <div className="absolute -top-4 left-4 z-10 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-full font-semibold text-sm shadow-lg">
                  <X className="h-4 w-4" />
                  The Old Way
                </div>
                <div className="rounded-xl overflow-hidden border border-destructive/30 bg-card/50 p-2">
                  <img
                    src={oldWayImage}
                    alt="Manually searching Google Maps for businesses"
                    className="w-full h-auto rounded-lg opacity-80"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Scrolling through Google Maps, clicking each pin, checking for websites one by one...
                </p>
              </div>

              {/* New Way */}
              <div className="relative">
                <div className="absolute -top-4 left-4 z-10 flex items-center gap-2 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full font-semibold text-sm shadow-lg">
                  <CheckCircle className="h-4 w-4" />
                  With LeadFinder
                </div>
                <div className="rounded-xl overflow-hidden border border-primary/30 bg-card/50 p-2 glow-effect">
                  <img
                    src={newWayImage}
                    alt="LeadFinder showing filtered list of businesses without websites"
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Instantly see which businesses don't have websites, sorted and ready to contact.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="relative z-10 py-20">
         <div className="container mx-auto px-4">
           <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
             Everything You Need to
             <span className="text-gradient-primary"> Close More Deals</span>
           </h2>
           <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
             A complete toolkit for finding, tracking, and converting leads into paying clients.
           </p>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {FEATURES.map((feature) => (
               <Card
                 key={feature.title}
                 className="glass-panel hover:border-primary/30 transition-colors"
               >
                 <CardHeader>
                   <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 w-fit mb-2">
                     <feature.icon className="h-6 w-6 text-primary" />
                   </div>
                   <CardTitle className="text-lg">{feature.title}</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <p className="text-muted-foreground text-sm">{feature.description}</p>
                 </CardContent>
               </Card>
             ))}
           </div>
         </div>
       </section>
 
       {/* How It Works Section */}
       <section className="relative z-10 py-20">
         <div className="container mx-auto px-4">
           <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
             How It <span className="text-gradient-primary">Works</span>
           </h2>
           <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
             Get started in minutes and begin finding leads right away.
           </p>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             {STEPS.map((step, index) => (
               <div key={step.number} className="text-center">
                 <div className="text-5xl font-bold text-primary/20 mb-4">{step.number}</div>
                 <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                 <p className="text-muted-foreground text-sm">{step.description}</p>
                 {index < STEPS.length - 1 && (
                   <ArrowRight className="hidden md:block h-6 w-6 text-primary/30 absolute right-0 top-1/2 -translate-y-1/2" />
                 )}
               </div>
             ))}
           </div>
         </div>
       </section>
 
       {/* Pricing Section */}
       <section className="relative z-10 py-20 bg-card/30">
         <div className="container mx-auto px-4">
           <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
             Simple, Transparent <span className="text-gradient-primary">Pricing</span>
           </h2>
           <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
             One plan with everything you need. Cancel anytime.
           </p>
           <Card className="glass-panel max-w-md mx-auto border-primary/30">
             <CardHeader className="text-center pb-2">
               <CardTitle className="text-2xl">LeadFinder Pro</CardTitle>
               <div className="mt-4">
                 <span className="text-5xl font-bold">£19.99</span>
                 <span className="text-muted-foreground">/month</span>
               </div>
             </CardHeader>
             <CardContent className="pt-6">
               <ul className="space-y-3">
                 {PRICING_FEATURES.map((feature) => (
                   <li key={feature} className="flex items-center gap-3">
                     <Check className="h-5 w-5 text-primary shrink-0" />
                     <span>{feature}</span>
                   </li>
                 ))}
               </ul>
             </CardContent>
             <CardFooter>
               <Button size="lg" className="w-full glow-effect" asChild>
                 <Link to="/auth">
                   Get Started
                   <ArrowRight className="ml-2 h-5 w-5" />
                 </Link>
               </Button>
             </CardFooter>
           </Card>
           <p className="text-xs text-muted-foreground text-center mt-4">
             Secure payment via Stripe. Cancel anytime.
           </p>
         </div>
       </section>
 
       {/* Footer */}
       <footer className="relative z-10 border-t border-border/50 py-8">
         <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-2">
             <Target className="h-5 w-5 text-primary" />
             <span className="font-semibold">
               Lead<span className="text-gradient-primary">Finder</span> Pro
             </span>
           </div>
           <div className="flex items-center gap-4 text-sm text-muted-foreground">
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