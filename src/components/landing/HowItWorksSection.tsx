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
import {
  Search,
  ClipboardList,
  MessageSquare,
  Users,
  ArrowRight,
  X,
  Expand,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-outreach.png';
import step4Image from '@/assets/howto-step4-dashboard.png';

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
    title: 'Review Results',
    description: 'See business details, ratings, reviews, and addresses. Filter by classification and add promising leads to your CRM.',
    image: step2Image,
    badge: '100,000+ Businesses',
  },
  {
    icon: MessageSquare,
    title: 'Reach Out & Track',
    description: 'Copy numbers to text or call directly. Mark leads as contacted, then click "Interested" when they respond positively.',
    image: step3Image,
    badge: 'Direct Outreach',
  },
  {
    icon: Users,
    title: 'Monitor Your Stats',
    description: 'Track your outreach performance on the dashboard. See conversion rates, pipeline value, and activity metrics to optimise your sales process.',
    image: step4Image,
    badge: 'Full Analytics',
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
    {/* Step number badge */}
    <div 
      className="inline-flex items-center justify-center w-12 h-12 rounded-xl font-bold text-lg mb-3"
      style={{ 
        background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
        color: 'hsl(220 40% 4%)',
        boxShadow: '0 0 30px hsl(210 100% 50% / 0.4)'
      }}
    >
      {index + 1}
    </div>
    
    {/* Title only - no icon on mobile */}
    <h3 className="text-xl font-bold tracking-tight mb-2">{step.title}</h3>
    
    <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-xs">
      {step.description}
    </p>
    
    {/* Bigger Image - no badge on mobile */}
    <div 
      className="relative group cursor-pointer w-full"
      onClick={() => onImageClick(step.image, step.title)}
    >
      <div 
        className="absolute -inset-2 rounded-2xl blur-xl opacity-40"
        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
      />
      <div 
        className="relative rounded-xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9]"
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
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        {/* Mobile Carousel */}
        {isMobile ? (
          <div className="max-w-sm mx-auto">
            <Carousel
              opts={{ loop: true }}
              className="w-full"
              setApi={(api) => {
                api?.on('select', () => {
                  setActiveIndex(api.selectedScrollSnap());
                });
              }}
            >
              <CarouselContent>
                {STEPS.map((step, index) => (
                  <CarouselItem key={step.title}>
                    <MobileStepCard 
                      step={step} 
                      index={index}
                      onImageClick={(src, title) => setExpandedImage({ src, title })}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              
              {/* Custom navigation arrows */}
              <CarouselPrevious className="left-0 bg-background/80 border-primary/30 hover:bg-primary/20" />
              <CarouselNext className="right-0 bg-background/80 border-primary/30 hover:bg-primary/20" />
            </Carousel>
            
            {/* Dot indicators */}
            <div className="flex justify-center gap-2 mt-6">
              {STEPS.map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    activeIndex === index 
                      ? 'w-6 bg-primary' 
                      : 'bg-muted-foreground/30'
                  }`}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>
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
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Expand className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
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
                      <div 
                        className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl font-bold text-lg sm:text-xl md:text-2xl mb-4 sm:mb-5 md:mb-6"
                        style={{ 
                          background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
                          color: 'hsl(220 40% 4%)',
                          boxShadow: '0 0 30px hsl(210 100% 50% / 0.4)'
                        }}
                      >
                        {index + 1}
                      </div>
                      
                      <div className="flex items-center gap-2.5 sm:gap-3 justify-center lg:justify-start mb-3 sm:mb-4 md:mb-5">
                        <div 
                          className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.1)',
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <step.icon className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" style={{ color: 'hsl(210 100% 50%)' }} />
                        </div>
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