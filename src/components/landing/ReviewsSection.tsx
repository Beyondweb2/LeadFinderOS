import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

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
    content: "honestly was wasting so much time on maps before this. found like 3 clients first month which basically paid for itself. the whatsapp integration is what sold me tbh",
    avatar: 'JT',
    stars: 5,
  },
  {
    name: 'Marcus L.',
    role: 'Web Designer',
    content: "we were doing this manually before and it took AGES. now my team just copies the numbers and sends bulk messages. probably 5x more outreach than before, no joke",
    avatar: 'ML',
    stars: 5,
  },
  {
    name: 'David R.',
    role: 'WordPress Developer',
    content: "the hot lead thing actually works?? thought it'd be useless but its pretty accurate. saves me calling businesses that already have sites. worth it for that alone",
    avatar: 'DR',
    stars: 4,
  },
  {
    name: 'Ryan K.',
    role: 'Freelance Web Designer',
    content: "been using this for a few weeks now. super simple, does what it says. tracking potential clients from first text to payment is nice. definitely recommend giving it a go",
    avatar: 'RK',
    stars: 5,
  },
];

const StarRating = ({ count }: { count: number }) => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <Star 
        key={i} 
        className={`h-4 w-4 ${i < count ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} 
      />
    ))}
  </div>
);

export const ReviewsSection = () => {
  return (
    <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            What <span className="text-gradient-primary">Real Users</span> Are Saying
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            Hear from web designers and developers already using LeadFinder Pro
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {REVIEWS.map((review, index) => (
            <Card 
              key={index}
              className="relative glass-panel-strong border-white/[0.06] overflow-hidden transition-all duration-300 hover:border-[hsl(210_100%_50%_/_0.2)]"
            >
              {/* Subtle glow on hover */}
              <div 
                className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.03), transparent)' }}
              />
              
              <CardContent className="p-5 sm:p-6">
                <StarRating count={review.stars} />
                
                <p className="mt-4 mb-5 text-foreground/90 text-sm sm:text-base leading-relaxed">
                  "{review.content}"
                </p>
                
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                    style={{ 
                      background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.2), hsl(210 100% 50% / 0.1))',
                      border: '1px solid hsl(210 100% 50% / 0.2)',
                      color: 'hsl(210 100% 60%)'
                    }}
                  >
                    {review.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{review.name}</p>
                    <p className="text-muted-foreground text-xs">{review.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-8 sm:mt-10">
          <Button variant="outline" className="border-white/10 hover:border-white/20 text-sm" asChild>
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
