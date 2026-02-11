import { Star, MessageSquare } from 'lucide-react';
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
    name: 'Chris P.',
    role: 'Freelance Designer',
    content: "Been using it for about 3 weeks now and already closed two small jobs from leads i found. the whatsapp feature makes it so easy to just reach out without overthinking it. defintely worth the money.",
    avatar: 'CP',
    stars: 5,
  },
  {
    name: 'Tom H.',
    role: 'Web Developer',
    content: "I was skeptical at first but the search results are genuinely good. found a bunch of local businesses near me that had no website at all. the crm keeps everthing organised which is a bonus.",
    avatar: 'TH',
    stars: 4,
  },
  {
    name: 'Alex M.',
    role: 'WordPress Freelancer',
    content: "Saves me so much time compared to scrolling through google maps manually. i just search, filter the ones without sites, and start messaging. simple but it works really well.",
    avatar: 'AM',
    stars: 5,
  },
  {
    name: 'Daniel S.',
    role: 'Agency Owner',
    content: "We use it across the team now for finding new clients. the dashboard tracking is clean and the outreach tools make follow ups way easier. wish i found it sooner honestly.",
    avatar: 'DS',
    stars: 5,
  },
];

// Pair reviews into groups of 2
const REVIEW_PAIRS: Review[][] = [];
for (let i = 0; i < REVIEWS.length; i += 2) {
  REVIEW_PAIRS.push(REVIEWS.slice(i, i + 2));
}

const ReviewCard = ({ review }: { review: Review }) => (
  <div className="h-full py-4 sm:py-6 text-center">
    <div className="flex gap-1 mb-3 justify-center">
      {[...Array(review.stars)].map((_, i) => (
        <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
      ))}
    </div>
    <p className="text-foreground/80 text-base sm:text-lg leading-relaxed mb-4 italic font-normal">
      "{review.content}"
    </p>
    <p className="text-muted-foreground/70 text-sm">{review.name} · {review.role}</p>
  </div>
);

const ReviewsCarousel = () => {
  const isMobile = useIsMobile();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const autoplayPlugin = useRef(Autoplay({ delay: 5000, stopOnInteraction: true }));
  const slides = isMobile ? REVIEWS : REVIEW_PAIRS;

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div className="max-w-5xl mx-auto">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'center' }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {isMobile
            ? REVIEWS.map((review, index) => (
                <CarouselItem key={index} className="pl-4">
                  <ReviewCard review={review} />
                </CarouselItem>
              ))
            : REVIEW_PAIRS.map((pair, index) => (
                <CarouselItem key={index} className="pl-4">
                  <div className="grid grid-cols-2 gap-10 max-w-4xl mx-auto">
                    {pair.map((review, ri) => (
                      <ReviewCard key={ri} review={review} />
                    ))}
                  </div>
                </CarouselItem>
              ))}
        </CarouselContent>
      </Carousel>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {slides.map((_, index) => (
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
    </div>
  );
};

export const ReviewsSection = () => {
  return (
    <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            Real Results from <span className="text-gradient-primary">Real Users</span>
          </h2>
          <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
            See how freelancers and agencies are landing more clients with LeadFinder Pro
          </p>
        </div>

        <ReviewsCarousel />

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
