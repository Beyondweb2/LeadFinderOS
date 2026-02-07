import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search,
  ClipboardList,
  MessageSquare,
  Users,
  ArrowRight,
  X,
  Expand,
} from 'lucide-react';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-bulksender.png';
import step4Image from '@/assets/howto-step4-track.png';

const STEPS = [
  {
    icon: Search,
    title: 'Find Leads',
    description: 'Search by business type and location to find companies without websites',
    image: step1Image,
    badge: '20+ Countries',
  },
  {
    icon: ClipboardList,
    title: 'View Lead Details',
    description: 'See business names, phone numbers, ratings, reviews, addresses, and direct Google Maps links. Filter by classification, check for websites, and add promising leads to your CRM.',
    image: step2Image,
    badge: '10+ Data Points',
  },
  {
    icon: MessageSquare,
    title: 'Copy Numbers & Send',
    description: 'Bulk-copy phone numbers in one click to paste into a bulk messenger app, or cold call businesses directly from the list.',
    image: step3Image,
    badge: 'One-Click Copy',
  },
  {
    icon: Users,
    title: 'Track Outreach',
    description: 'Manage responses and track interested leads through your sales pipeline',
    image: step4Image,
    cropStyle: 'object-[42%_58%] scale-[1.6]',
    badge: 'Full Pipeline',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);

  return (
    <section className="relative z-10 py-10 sm:py-14 md:py-20 lg:py-28 px-3 sm:px-4">
      {/* Image Modal */}
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

      <div className="container mx-auto">
        <ScrollReveal className="text-center mb-8 sm:mb-12 md:mb-20">
          <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold mb-2 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-xs sm:text-sm md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-10 md:space-y-16">
          {STEPS.map((step, index) => {
            const isEven = index % 2 === 0;
            return (
              <ScrollReveal key={step.title} delay={(index + 1) * 100}>
                <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-4 sm:gap-6 lg:gap-12`}>
                  {/* Image Side - Larger images */}
                  <div className="flex-1 w-full lg:flex-[1.2]">
                    <div 
                      className="relative group cursor-pointer"
                      onClick={() => setExpandedImage({ src: step.image, title: step.title })}
                    >
                      {/* Glow effect */}
                      <div 
                        className="absolute -inset-2 rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                      />
                      <div 
                        className="absolute -inset-px rounded-2xl"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.1), transparent)' }}
                      />
                      <div 
                        className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9] transition-transform duration-300 group-hover:scale-[1.02]"
                        style={{ 
                          border: '1px solid hsl(210 100% 50% / 0.2)',
                          boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                        }}
                      >
                        <img 
                          src={step.image} 
                          alt={step.title}
                          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${step.cropStyle || ''}`}
                        />
                        {/* Expand icon overlay */}
                        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Expand className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
                        </div>
                        {/* Badge */}
                        <div 
                          className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold backdrop-blur-md"
                          style={{ 
                            background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.9), hsl(220 80% 45% / 0.9))',
                            color: 'white',
                            boxShadow: '0 4px 12px hsl(210 100% 50% / 0.3)'
                          }}
                        >
                          {step.badge}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Content Side */}
                  <div className={`flex-1 w-full ${isEven ? 'lg:pl-4' : 'lg:pr-4'}`}>
                  <div className="text-center lg:text-left">
                      {/* Step number badge */}
                      <div 
                        className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg md:text-xl mb-3 sm:mb-4 md:mb-6"
                        style={{ 
                          background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
                          color: 'hsl(220 40% 4%)',
                          boxShadow: '0 0 30px hsl(210 100% 50% / 0.4)'
                        }}
                      >
                        {index + 1}
                      </div>
                      
                      {/* Icon and title row */}
                      <div className="flex items-center gap-2 sm:gap-3 justify-center lg:justify-start mb-2 sm:mb-3 md:mb-4">
                        <div 
                          className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.1)',
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <step.icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" style={{ color: 'hsl(210 100% 50%)' }} />
                        </div>
                        <h3 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">{step.title}</h3>
                      </div>
                      
                      <p className="text-muted-foreground text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Link to full guide */}
        <ScrollReveal delay={500} className="text-center mt-12 sm:mt-16">
          <Button variant="outline" size="lg" className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06]" asChild>
            <Link to="/guide">
              View Detailed Guide
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </ScrollReveal>
      </div>
    </section>
  );
};
