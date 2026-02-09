import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Star, Send, MessageSquare, Lightbulb, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import appLogo from "@/assets/logo.png";

// Validation schemas
const baseSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email must be less than 255 characters"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message must be less than 2000 characters"),
});

const reviewSchema = baseSchema.extend({
  rating: z.number().min(1, "Please select a rating").max(5),
});

type ReviewFormData = z.infer<typeof reviewSchema>;
type GeneralFormData = z.infer<typeof baseSchema>;

// Star Rating Component
const StarRating = ({ 
  value, 
  onChange, 
  disabled = false 
}: { 
  value: number; 
  onChange: (rating: number) => void; 
  disabled?: boolean;
}) => {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className={`transition-all duration-150 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-110"}`}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => !disabled && onChange(star)}
        >
          <Star
            className={`h-8 w-8 transition-colors ${
              star <= (hovered || value)
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
};

// Review Form
const ReviewForm = () => {
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
      rating: 0,
    },
  });

  const onSubmit = async (data: ReviewFormData) => {
    setIsSubmitting(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke("send-feedback", {
        body: {
          name: data.name,
          email: data.email,
          feedbackType: "review",
          message: data.message,
          rating: data.rating,
        },
      });

      if (error) throw error;

      setIsSuccess(true);
      toast({
        title: "Thank you! 🌟",
        description: "Your review has been submitted successfully.",
      });
      form.reset();
      setRating(0);
    } catch (error: any) {
      console.error("Error submitting review:", error);
      toast({
        title: "Submission failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
          <Star className="h-8 w-8 text-green-500" style={{ fill: "currentColor" }} />
        </div>
        <h3 className="text-xl font-semibold mb-2">Thank you for your review!</h3>
        <p className="text-muted-foreground mb-4">We really appreciate your feedback.</p>
        <Button variant="outline" onClick={() => setIsSuccess(false)}>
          Submit Another Review
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label>Your Rating</Label>
        <StarRating
          value={rating}
          onChange={(r) => {
            setRating(r);
            form.setValue("rating", r);
          }}
          disabled={isSubmitting}
        />
        {form.formState.errors.rating && (
          <p className="text-sm text-destructive">{form.formState.errors.rating.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="review-name">Name</Label>
          <Input
            id="review-name"
            placeholder="John Doe"
            {...form.register("name")}
            disabled={isSubmitting}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-email">Email</Label>
          <Input
            id="review-email"
            type="email"
            placeholder="john@example.com"
            {...form.register("email")}
            disabled={isSubmitting}
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-message">Your Review</Label>
        <Textarea
          id="review-message"
          placeholder="Tell us about your experience with LeadFinder Pro..."
          className="min-h-[120px] resize-none"
          {...form.register("message")}
          disabled={isSubmitting}
        />
        {form.formState.errors.message && (
          <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit Review
          </>
        )}
      </Button>
    </form>
  );
};

// General Feedback Form (reused for feature requests and general feedback)
const GeneralFeedbackForm = ({ 
  type, 
  placeholder 
}: { 
  type: "feature_request" | "general";
  placeholder: string;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<GeneralFormData>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  const onSubmit = async (data: GeneralFormData) => {
    setIsSubmitting(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke("send-feedback", {
        body: {
          name: data.name,
          email: data.email,
          feedbackType: type,
          message: data.message,
        },
      });

      if (error) throw error;

      setIsSuccess(true);
      toast({
        title: "Thank you! 🎉",
        description: type === "feature_request" 
          ? "Your feature request has been submitted." 
          : "Your feedback has been submitted.",
      });
      form.reset();
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      toast({
        title: "Submission failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const successIcon = type === "feature_request" ? Lightbulb : MessageSquare;
  const SuccessIcon = successIcon;

  if (isSuccess) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <SuccessIcon className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">
          {type === "feature_request" ? "Feature request received!" : "Feedback received!"}
        </h3>
        <p className="text-muted-foreground mb-4">We'll review your submission soon.</p>
        <Button variant="outline" onClick={() => setIsSuccess(false)}>
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${type}-name`}>Name</Label>
          <Input
            id={`${type}-name`}
            placeholder="John Doe"
            {...form.register("name")}
            disabled={isSubmitting}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${type}-email`}>Email</Label>
          <Input
            id={`${type}-email`}
            type="email"
            placeholder="john@example.com"
            {...form.register("email")}
            disabled={isSubmitting}
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${type}-message`}>
          {type === "feature_request" ? "Describe your idea" : "Your message"}
        </Label>
        <Textarea
          id={`${type}-message`}
          placeholder={placeholder}
          className="min-h-[120px] resize-none"
          {...form.register("message")}
          disabled={isSubmitting}
        />
        {form.formState.errors.message && (
          <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit {type === "feature_request" ? "Request" : "Feedback"}
          </>
        )}
      </Button>
    </form>
  );
};

const Feedback = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/landing" className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8" />
            <span className="font-semibold tracking-tight">
              Lead<span className="text-primary">Finder</span> Pro
            </span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/landing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">We'd Love Your Feedback</h1>
            <p className="text-muted-foreground text-lg">
              Help us make LeadFinder Pro even better for you.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <Tabs defaultValue="review" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="review" className="text-xs sm:text-sm">
                    <Star className="h-4 w-4 mr-1.5 hidden sm:inline" />
                    Review
                  </TabsTrigger>
                  <TabsTrigger value="feature" className="text-xs sm:text-sm">
                    <Lightbulb className="h-4 w-4 mr-1.5 hidden sm:inline" />
                    Feature Request
                  </TabsTrigger>
                  <TabsTrigger value="general" className="text-xs sm:text-sm">
                    <HelpCircle className="h-4 w-4 mr-1.5 hidden sm:inline" />
                    General
                  </TabsTrigger>
                </TabsList>

                <CardContent className="pt-6 px-0">
                  <TabsContent value="review" className="mt-0">
                    <ReviewForm />
                  </TabsContent>
                  <TabsContent value="feature" className="mt-0">
                    <GeneralFeedbackForm
                      type="feature_request"
                      placeholder="What feature would make LeadFinder Pro more useful for you? Describe your idea in detail..."
                    />
                  </TabsContent>
                  <TabsContent value="general" className="mt-0">
                    <GeneralFeedbackForm
                      type="general"
                      placeholder="Have a question, found a bug, or just want to say hi? We're all ears..."
                    />
                  </TabsContent>
                </CardContent>
              </Tabs>
            </CardHeader>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Your feedback helps us improve. We read every submission!
          </p>
        </div>
      </main>
    </div>
  );
};

export default Feedback;
