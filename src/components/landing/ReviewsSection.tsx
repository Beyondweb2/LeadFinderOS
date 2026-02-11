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
    content: "i was manually searching google maps for about an hour every morning. now i get 20-25 businesses in 15 minutes and can message them straight away. genuinely saves me so much time.",
    avatar: 'CP',
    stars: 5,
  },
  {
    name: 'Tom H.',
    role: 'Web Developer',
    content: "the tracking is what keeps me using it. i know exactly who i've messaged, who replied, and who to follow up with. before this i was losing leads in my notes app.",
    avatar: 'TH',
    stars: 4,
  },
  {
    name: 'Alex M.',
    role: 'WordPress Freelancer',
    content: "got my first paying client about two and a half weeks in. the outreach templates helped me send messages without overthinking what to say every time.",
    avatar: 'AM',
    stars: 5,
  },
  {
    name: 'Daniel S.',
    role: 'Agency Owner',
    content: "we were spending ages on prospecting admin. now the whole team uses it and we're getting consistent replies because follow ups actually happen on time.",
    avatar: 'DS',
    stars: 5,
  },
];

const ReviewCard = ({ review }: { review: Review }) => (
  <div className="h-full flex flex-col justify-between text-center px-2 py-5">
    <div>
      <div className="flex gap-0.5 mb-3 justify-center">
        {[...Array(review.stars)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
      <p className="text-foreground/80 text-sm leading-relaxed italic font-normal">
        "{review.content}"
      </p>
    </div>
    <p className="text-muted-foreground/70 text-xs mt-4">{review.name} · {review.role}</p>
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
      <div className="flex items-center justify-center gap-1.5 mt-4">
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
          <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
            See how freelancers and agencies are landing more clients with LeadFinder Pro
          </p>
        </div>

        {isMobile ? (
          <MobileReviewsCarousel />
        ) : (
          <div className="grid grid-cols-4 gap-6 max-w-5xl mx-auto">
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
