import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search,
  ClipboardList,
  MessageSquare,
  BarChart3,
  X,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-outreach-crm.png';
import step4aImage from '@/assets/feature-contact-tracking.png';
import step4bImage from '@/assets/howto-step4-dashboard.png';

interface StepData {
  icon: typeof Search;
  title: string;
  description: string;
  images: string[];
  badge: string;
}

const STEPS: StepData[] = [
  {
    icon: Search,
    title: 'Find Leads',
    description: 'Search any location and instantly see which businesses don\'t have a website.',
    images: [step1Image],
    badge: '20+ Countries',
  },
  {
    icon: ClipboardList,
    title: 'Add to CRM',
    description: 'Save promising leads in one click and organise them into your pipeline.',
    images: [step2Image],
    badge: '100,000+ Businesses',
  },
  {
    icon: MessageSquare,
    title: 'Start Outreach',
    description: 'Message instantly via WhatsApp or SMS — no copying numbers, no switching tabs.',
    images: [step3Image],
    badge: 'Direct Outreach',
  },
  {
    icon: BarChart3,
    title: 'Track & Close',
    description: 'See who replied, who needs follow-up, and exactly where your revenue is coming from — all in one dashboard.',
    images: [step4bImage],
    badge: 'Full Pipeline',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

const StepImage = ({ 
  src, 
  alt, 
  onClick 
}: { 
  src: string; 
  alt: string; 
  onClick: () => void;
}) => (
  <div 
    className="relative group cursor-pointer w-full"
    onClick={onClick}
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
        src={src} 
        alt={alt}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
      </div>
    </div>
  </div>
);

export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const isMobile = useIsMobile();

  return (
    <section className="relative z-10 py-8 sm:py-18 md:py-24 lg:py-28 px-3 sm:px-4">
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

      <div className="container mx-auto max-w-[1200px]">
        <ScrollReveal className="text-center mb-8 sm:mb-8 md:mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        {/* Mobile Layout */}
        {isMobile ? (
          <div className="px-1 space-y-10">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span 
                    className="text-sm font-bold w-6 text-right shrink-0"
                    style={{ color: 'hsl(210 100% 60%)' }}
                  >
                    {index + 1}.
                  </span>
                  <h3 className="text-2xl font-bold tracking-tight">{step.title}</h3>
                  <span className="w-6 shrink-0" aria-hidden="true" />
                </div>
                
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-xs">
                  {step.description}
                </p>
                
                {/* Images - stack vertically for multi-image steps */}
                <div className="w-full space-y-3">
                  {step.images.map((img, imgIdx) => (
                    <div 
                      key={imgIdx}
                      className="relative w-full cursor-pointer"
                      onClick={() => setExpandedImage({ src: img, title: step.title })}
                    >
                      <div 
                        className="relative rounded-lg overflow-hidden bg-card/80 aspect-[16/10]"
                        style={{ 
                          border: '1px solid hsl(210 100% 50% / 0.15)',
                          boxShadow: '0 0 12px hsl(210 100% 50% / 0.08)'
                        }}
                      >
                        <img 
                          src={img} 
                          alt={`${step.title} ${step.images.length > 1 ? imgIdx + 1 : ''}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-background/70 backdrop-blur-sm">
                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Layout — Alternating rows */
          <div className="flex flex-col gap-20 lg:gap-24 max-w-[1100px] mx-auto">
            {STEPS.map((step, index) => {
              const isReversed = index % 2 === 1;
              
              return (
                <ScrollReveal key={step.title} delay={index * 100}>
                  <div className={`flex items-center gap-12 lg:gap-16 ${isReversed ? 'flex-row-reverse' : ''}`}>
                    {/* Text side */}
                    <div className="w-[42%] flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <span 
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl font-bold text-lg"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.15)',
                            color: 'hsl(210 100% 60%)',
                            border: '1px solid hsl(210 100% 50% / 0.3)'
                          }}
                        >
                          {index + 1}
                        </span>
                        <h3 className="text-xl lg:text-2xl font-bold tracking-tight">{step.title}</h3>
                      </div>
                      
                      <p className="text-muted-foreground/80 text-sm lg:text-base leading-relaxed max-w-sm">
                        {step.description}
                      </p>
                    </div>
                    
                    {/* Image side */}
                    <div className="w-[58%]">
                      <div 
                        className="relative group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                        onClick={() => setExpandedImage({ src: step.images[0], title: step.title })}
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
                          className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.01]"
                          style={{ 
                            border: '1px solid hsl(210 100% 50% / 0.2)',
                            boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                          }}
                        >
                          <img 
                            src={step.images[0]} 
                            alt={step.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                          <div className="absolute top-3 left-3 z-20 p-1.5 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <Search className="h-4 w-4 text-foreground" />
                          </div>
                          <div 
                            className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md"
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
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
};