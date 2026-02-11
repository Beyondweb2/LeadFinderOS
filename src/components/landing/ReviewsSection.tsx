import { Star, MessageSquare, Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useRef } from 'react';

interface Review {
  name: string;
  role: string;
  content: string;
  avatar: string;
  stars: number;
}

const REVIEWS: Review[] = [
  {
    name: 'James T.',
    role: 'Freelance Web Developer',
    content: "used to spend hours on maps trying to find leads. ran my first search and had 30+ businesses without websites ready to contact. landed 3 clients in month one — paid for itself straight away.",
    avatar: 'JT',
    stars: 5,
  },
  {
    name: 'Marcus L.',
    role: 'Web Designer',
    content: "we used to do this all manually — scrolling, checking, noting numbers. now we search, message directly, and actually get replies. reaching 5x more businesses and saving hours every week.",
    avatar: 'ML',
    stars: 5,
  },
  {
    name: 'David R.',
    role: 'WordPress Developer',
    content: "stopped wasting time on businesses that already have websites. the classification tells me instantly who to contact. everything stays organised in the dashboard — really solid for the price.",
    avatar: 'DR',
    stars: 5,
  },
  {
    name: 'Ryan K.',
    role: 'Freelance Web Designer',
    content: "the one click whatsapp outreach is what sold me. no messing around — just find leads, message them, and track everything in one place. tried the trial and kept it.",
    avatar: 'RK',
    stars: 5,
  },
];

const StarRating = ({ count }: { count: number }) => (
  <div className="flex gap-0.5 justify-center sm:justify-start">
    {[...Array(5)].map((_, i) => (
      <Star 
        key={i} 
        className={`h-3.5 w-3.5 ${i < count ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/20'}`} 
      />
    ))}
  </div>
);

const ReviewCard = ({ review }: { review: Review }) => (
  <div 
    className="relative group rounded-2xl p-[1px] transition-all duration-300"
    style={{
      background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15), hsl(220 40% 15% / 0.3), hsl(210 100% 50% / 0.08))',
    }}
  >
    <div 
      className="relative rounded-2xl p-5 sm:p-6 h-full transition-all duration-300"
      style={{
        background: 'linear-gradient(180deg, hsl(220 40% 9% / 0.98), hsl(220 40% 6% / 0.99))',
      }}
    >
      <Quote 
        className="absolute top-4 right-4 h-8 w-8 opacity-[0.06]" 
        style={{ color: 'hsl(210 100% 50%)' }}
      />
      
      <div className="text-center sm:text-left">
        <StarRating count={review.stars} />
      </div>
      
      <p className="mt-4 mb-5 text-foreground/85 text-sm sm:text-base leading-relaxed text-center sm:text-left">
        "{review.content}"
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2" style={{ borderTop: '1px solid hsl(220 30% 15% / 0.6)' }}>
        <div 
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold tracking-wide"
          style={{ 
            background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.2), hsl(210 100% 50% / 0.08))',
            border: '1px solid hsl(210 100% 50% / 0.15)',
            color: 'hsl(210 100% 60%)'
          }}
        >
          {review.avatar}
        </div>
        <div className="text-center sm:text-left">
          <p className="font-semibold text-sm text-foreground/90">{review.name}</p>
          <p className="text-muted-foreground text-xs">{review.role}</p>
        </div>
      </div>
    </div>
  </div>
);

const MobileReviewsCarousel = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const autoplayPlugin = useRef(Autoplay({ delay: 5000, stopOnInteraction: true }));

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div className="max-w-md mx-auto">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'center' }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-3">
          {REVIEWS.map((review, index) => (
            <CarouselItem key={index} className="pl-3">
              <ReviewCard review={review} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {REVIEWS.map((_, index) => (
          <button
            key={index}
            onClick={() => api?.scrollTo(index)}
            className={`rounded-full transition-all duration-300 ${
              index === current
                ? 'w-6 h-2 bg-[hsl(210_100%_50%)]'
                : 'w-2 h-2 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>
      <p className="text-center text-muted-foreground/50 text-xs mt-2">Swipe to read more</p>
    </div>
  );
};

export const ReviewsSection = () => {
  const isMobile = useIsMobile();

  return (
    <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            Real Results from <span className="text-gradient-primary">Real Users</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            See how freelancers and agencies are landing more clients with LeadFinder Pro
          </p>
        </div>

        {isMobile ? (
          <MobileReviewsCarousel />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-5xl mx-auto">
            {REVIEWS.map((review, index) => (
              <ReviewCard key={index} review={review} />
            ))}
          </div>
        )}

        <div className="text-center mt-8 sm:mt-10">
          <Button variant="outline" className="border-white/10 hover:border-white/20 text-sm rounded-full px-6" asChild>
            <Link to="/feedback">
              <MessageSquare className="mr-2 h-4 w-4" />
              Leave a Review
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
