import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Search,
  ClipboardList,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  ZoomIn,
  Play,
  UserPlus,
} from 'lucide-react';
import step1Search from '@/assets/howto-step1-search.png';
import step2Results from '@/assets/howto-step2-results.png';
import step3Crm from '@/assets/howto-step3-crm.png';
import step4TrackLeads from '@/assets/howto-step4-trackleads.png';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const STEPS = [
  {
    number: 1,
    icon: Search,
    title: 'Search for Businesses',
    description: 'Enter a business type (e.g., "plumber", "restaurant") and select a country and city. Set your search radius and hit "Search" to instantly find businesses in that area — those without websites are highlighted as hot leads.',
    image: step1Search,
    tip: 'Be specific with your business type for better results. Try niches like "dental clinic" or "auto repair" to find less competitive leads.',
  },
  {
    number: 2,
    icon: ClipboardList,
    title: 'Save Leads to Your Outreach List',
    description: 'Browse your results and look for green "No Website" badges — these are businesses most likely to need your services. Tap "Add to Outreach" to save them to your pipeline ready for contacting.',
    image: step2Results,
    tip: 'Businesses with high ratings and lots of reviews are established and earning — they just need a website to match.',
  },
  {
    number: 3,
    icon: MessageSquare,
    title: 'Contact Leads via WhatsApp, SMS or Call',
    description: 'Head to your Outreach page to see all saved leads. Tap the WhatsApp, SMS or Call button to reach out directly. Use message templates to send personalised pitches in seconds. Once contacted, mark the lead and move interested ones to Track Leads.',
    image: step3Crm,
    tip: 'A quick phone call often gets the best response. Keep your pitch short, friendly, and focused on how you can help their business.',
  },
  {
    number: 4,
    icon: CheckCircle,
    title: 'Track Interested Leads to Closing',
    description: 'When a lead shows interest, they move to Track Leads — your pipeline tracker. Set deal stages like "Sent Quote" or "Call Booked", schedule follow-ups, add notes, and manage each lead through to payment. Everything auto-saves as you go.',
    image: step4TrackLeads,
    tip: 'Use next actions and dates to stay on top of follow-ups. Leads with clear next steps are far more likely to convert.',
  },
];

const HowToUse = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const { resetWalkthrough } = useDemoChecklist();
  const { isAdmin } = useSubscription();
  const { user } = useAuth();
  // If accessed via /guide (public route), show sign-up CTA
  const isPublicGuide = location.pathname === '/guide';

  const handleRestartWalkthrough = () => {
    resetWalkthrough();
    navigate('/find-leads');
  };

  const handleSimulateNewUser = async () => {
    if (!user?.id) return;
    // Clear all walkthrough/first-time localStorage keys
    const keysToRemove = [
      `demo_walkthrough_dismissed_${user.id}`,
      `walkthrough_completed_${user.id}`,
      `demo_checklist_v4_${user.id}`,
      `leadfinder_first_login_completed_${user.id}`,
      `post_walkthrough_tips_dismissed_${user.id}`,
    ];
    keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    // Set simulate flag
    localStorage.setItem(`simulate_new_user_${user.id}`, 'true');
    // Reset DB walkthrough prompt flag
    try {
      await supabase.functions.invoke('ensure-trial', {
        body: { action: 'reset_walkthrough_prompt' },
      });
    } catch {}
    // Hard reload to /find-leads so all state re-initializes
    window.location.href = '/find-leads';
  };
  
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
      {/* Expanded image dialog */}
      <Dialog open={!!expandedImage} onOpenChange={() => setExpandedImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-background/95 backdrop-blur-sm">
          {expandedImage && (
            <img 
              src={expandedImage} 
              alt="Expanded view"
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="mb-8 md:mb-12 text-center sm:text-left">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight mb-3">
          How to Use Lead<span className="text-primary">Finder</span> Pro
        </h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-2xl mx-auto sm:mx-0 mb-4">
          Follow this step-by-step guide to find businesses without websites, 
          reach out via WhatsApp, SMS or calls, track interested leads, and close deals.
        </p>
        {!isPublicGuide && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRestartWalkthrough} variant="outline" size="sm" className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Run Interactive Walkthrough
            </Button>
            {isAdmin && (
              <Button onClick={handleSimulateNewUser} variant="outline" size="sm" className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                <UserPlus className="h-3.5 w-3.5" />
                Simulate New User
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-6 md:space-y-8">
        {STEPS.map((step, index) => (
          <div key={step.number}>
            <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 text-center sm:text-left">
                  {/* Step number */}
                  <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="text-lg md:text-xl font-bold text-primary">{step.number}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg md:text-xl flex items-center justify-center sm:justify-start gap-2 mb-2">
                      {step.title}
                    </CardTitle>
                    <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Screenshot - clickable to expand */}
                <div 
                  className="rounded-lg overflow-hidden border border-border/30 mb-4 cursor-pointer group relative"
                  onClick={() => setExpandedImage(step.image)}
                >
                  <img 
                    src={step.image} 
                    alt={step.title}
                    className="w-full h-auto transition-opacity group-hover:opacity-90"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <div className="p-2 rounded-full bg-background/80 backdrop-blur-sm">
                      <ZoomIn className="h-5 w-5 text-foreground" />
                    </div>
                  </div>
                </div>
                
                {/* Tip */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-center sm:text-left">
                  <span className="text-primary text-xs font-semibold uppercase tracking-wide flex-shrink-0">
                    💡 Tip:
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {step.tip}
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {/* Arrow between steps */}
            {index < STEPS.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowDown className="h-6 w-6 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <Card className="mt-8 md:mt-12 border-primary/20 bg-primary/5">
        <CardContent className="py-6 md:py-8 text-center sm:text-left">
          <h2 className="text-lg md:text-xl font-semibold mb-3">
            🎉 That's the Complete Workflow!
          </h2>
          <p className="text-muted-foreground text-sm md:text-base mb-4 max-w-2xl mx-auto sm:mx-0">
            You've learned how to find leads, reach out via calls or texts, 
            and manage prospects from first contact to paid client. Now start finding your next client!
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center sm:justify-start">
            {isPublicGuide ? (
              <>
                <Button asChild className="w-full sm:w-auto">
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <Link to="/landing">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="w-full sm:w-auto">
                  <Link to="/">
                    Start Finding Leads
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <Link to="/templates">
                    View Message Templates
                  </Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HowToUse;
