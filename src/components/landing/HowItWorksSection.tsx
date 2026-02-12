import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import {
  Search,
  ClipboardList,
  MessageSquare,
  Settings,
  Users,
  ArrowRight,
  X,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-outreach-crm.png';
import step4Image from '@/assets/feature-contact-tracking.png';
import step5Image from '@/assets/howto-step4-dashboard.png';

const STEPS = [
  {
    icon: Search,
    title: 'Find Your Leads',
    description: 'Search any location and instantly see businesses without websites — your ideal prospects, ready to contact.',
    image: step1Image,
    badge: '20+ Countries',
  },
  {
    icon: MessageSquare,
    title: 'Reach Out Directly',
    description: 'Message leads via WhatsApp or SMS straight from the app. No copying numbers, no switching tabs — just tap and send.',
    image: step3Image,
    badge: 'Instant Outreach',
  },
  {
    icon: Users,
    title: 'Track & Close',
    description: 'Every lead, follow-up, and status change tracked in one place. See your pipeline, know who to chase, and close more deals.',
    image: step5Image,
    badge: 'Full Pipeline',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

// Mobile step card component
const MobileStepCard = ({ 
  step, 
  index, 
  onImageClick 
}: { 
  step: typeof STEPS[0]; 
  index: number; 
  onImageClick: (src: string, title: string) => void;
}) => (
  <div className="flex flex-col items-center text-center px-1">
    {/* Step number and title inline, centered */}
    <div className="flex items-center justify-center gap-2 mb-2">
      <div 
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-semibold text-sm shrink-0"
        style={{ 
          background: 'hsl(210 100% 50% / 0.15)',
          color: 'hsl(210 100% 60%)',
          border: '1px solid hsl(210 100% 50% / 0.3)'
        }}
      >
        {index + 1}
      </div>
      <h3 className="text-xl font-bold tracking-tight">{step.title}</h3>
    </div>
    
    <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-xs">
      {step.description}
    </p>
    
    {/* Image - larger */}
    <div 
      className="relative group cursor-pointer w-full"
      onClick={() => onImageClick(step.image, step.title)}
    >
      <div 
        className="absolute -inset-2 rounded-2xl blur-xl opacity-40"
        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
      />
      <div 
        className="relative rounded-xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[4/3]"
        style={{ 
          border: '1px solid hsl(210 100% 50% / 0.2)',
          boxShadow: '0 0 20px hsl(210 100% 50% / 0.1)'
        }}
      >
        <img 
          src={step.image} 
          alt={step.title}
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  </div>
);
export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isMobile = useIsMobile();

  return (
    <section className="relative z-10 py-8 sm:py-10 md:py-16 lg:py-20 px-3 sm:px-4">
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
          <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
            Three steps. That's all it takes.
          </p>
        </ScrollReveal>
        
        {/* Mobile Carousel */}
        {isMobile ? (
          <div className="px-1 space-y-12">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                {/* Title with inline number — balanced with invisible spacer */}
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span 
                    className="text-sm font-bold w-6 text-right shrink-0"
                    style={{ color: 'hsl(210 100% 60%)' }}
                  >
                    {index + 1}.
                  </span>
                  <h3 className="text-xl font-bold tracking-tight">{step.title}</h3>
                  <span className="w-6 shrink-0" aria-hidden="true" />
                </div>
                
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-xs">
                  {step.description}
                </p>
                
                {/* Full-width tappable image */}
                <div 
                  className="relative w-full cursor-pointer"
                  onClick={() => setExpandedImage({ src: step.image, title: step.title })}
                >
                  <div 
                    className="relative rounded-lg overflow-hidden bg-card/80 aspect-[16/10]"
                    style={{ 
                      border: '1px solid hsl(210 100% 50% / 0.15)',
                      boxShadow: '0 0 12px hsl(210 100% 50% / 0.08)'
                    }}
                  >
                    <img 
                      src={step.image} 
                      alt={step.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-background/70 backdrop-blur-sm">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Layout - Original */
          <div className="max-w-6xl mx-auto space-y-6 sm:space-y-10 md:space-y-16">
            {STEPS.map((step, index) => {
              const isEven = index % 2 === 0;
              const imageDirection = isEven ? 'left' : 'right';
              const textDirection = isEven ? 'right' : 'left';
              
              return (
                <div key={step.title} className={`flex flex-col-reverse ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-4 sm:gap-6 lg:gap-12`}>
                  {/* Image Side */}
                  <ScrollReveal className="flex-1 w-full lg:flex-[1.2]" delay={(index + 1) * 100} direction={imageDirection}>
                    <div 
                      className="relative group cursor-pointer"
                      onClick={() => setExpandedImage({ src: step.image, title: step.title })}
                    >
                      <div 
                        className="absolute -inset-2 rounded-2xl blur-xl opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                      />
                      <div 
                        className="absolute -inset-px rounded-2xl"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.1), transparent)' }}
                      />
                      <div 
                        className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9] transition-transform duration-300 group-hover:scale-[1.01]"
                        style={{ 
                          border: '1px solid hsl(210 100% 50% / 0.2)',
                          boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                        }}
                      >
                        <img 
                          src={step.image} 
                          alt={step.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
                        </div>
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
                  </ScrollReveal>
                    
                  {/* Content Side */}
                  <ScrollReveal className={`flex-1 w-full ${isEven ? 'lg:pl-4' : 'lg:pr-4'}`} delay={(index + 1) * 100 + 50} direction={textDirection}>
                    <div className="text-center lg:text-left">
                      <div className="flex items-center gap-3 justify-center lg:justify-start mb-3 sm:mb-4 md:mb-5">
                        <span 
                          className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg font-semibold text-sm sm:text-base"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.15)',
                            color: 'hsl(210 100% 60%)',
                            border: '1px solid hsl(210 100% 50% / 0.3)'
                          }}
                        >
                          {index + 1}
                        </span>
                        <h3 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight">{step.title}</h3>
                      </div>
                      
                      <p className="text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
                        {step.description}
                      </p>
                    </div>
                  </ScrollReveal>
                </div>
              );
            })}
          </div>
        )}

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