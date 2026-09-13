import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Validation helpers
function validateName(name: string): { valid: boolean; error?: string } {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters" };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: "Name must be less than 100 characters" };
  }
  return { valid: true };
}

function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email?.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!trimmed || !emailRegex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address" };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: "Email must be less than 255 characters" };
  }
  return { valid: true };
}

function validateMessage(message: string): { valid: boolean; error?: string } {
  const trimmed = message?.trim();
  if (!trimmed || trimmed.length < 10) {
    return { valid: false, error: "Message must be at least 10 characters" };
  }
  if (trimmed.length > 2000) {
    return { valid: false, error: "Message must be less than 2000 characters" };
  }
  return { valid: true };
}

function validateRating(rating: number | undefined, feedbackType: string): { valid: boolean; error?: string } {
  if (feedbackType === "review") {
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return { valid: false, error: "Rating must be between 1 and 5" };
    }
  }
  return { valid: true };
}

function validateFeedbackType(type: string): { valid: boolean; error?: string } {
  const validTypes = ["review", "feature_request", "general"];
  if (!type || !validTypes.includes(type)) {
    return { valid: false, error: "Invalid feedback type" };
  }
  return { valid: true };
}

interface FeedbackRequest {
  name: string;
  email: string;
  feedbackType: "review" | "feature_request" | "general";
  message: string;
  rating?: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client identifier for rate limiting (use IP or a hash)
    const clientId = req.headers.get("x-forwarded-for") || 
                     req.headers.get("cf-connecting-ip") || 
                     "anonymous";
    
    // Rate limit: 5 requests per minute
    const rateLimit = checkRateLimit(`feedback:${clientId}`, 5, 60000);
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
        { 
          status: 429, 
          headers: { 
            "Content-Type": "application/json", 
            ...corsHeaders,
            ...rateLimitHeaders(rateLimit, 5)
          } 
        }
      );
    }

    const body: FeedbackRequest = await req.json();
    const { name, email, feedbackType, message, rating } = body;

    // Validate all inputs
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return new Response(
        JSON.stringify({ error: nameValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: emailValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const typeValidation = validateFeedbackType(feedbackType);
    if (!typeValidation.valid) {
      return new Response(
        JSON.stringify({ error: typeValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const messageValidation = validateMessage(message);
    if (!messageValidation.valid) {
      return new Response(
        JSON.stringify({ error: messageValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const ratingValidation = validateRating(rating, feedbackType);
    if (!ratingValidation.valid) {
      return new Response(
        JSON.stringify({ error: ratingValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Format the subject line based on feedback type
    const typeLabels: Record<string, string> = {
      review: "Review",
      feature_request: "Feature Request",
      general: "Feedback",
    };
    
    const firstName = name.trim().split(" ")[0];
    const subject = `[LeadFinder] New ${typeLabels[feedbackType]} from ${firstName}`;

    // Build rating stars for reviews
    const ratingHtml = feedbackType === "review" && rating 
      ? `<p><strong>Rating:</strong> ${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5)</p>`
      : "";

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      /* findable.live, not lead-finder-app.com: the old product's domain is not verified on this
         Resend account and every send from it is refused 403 (see stripe-webhook FROM_OPERATOR). */
      from: "Findable alerts <alerts@findable.live>",
      to: ["beyondwebcraft@outlook.com"],
      subject: subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 20px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New ${typeLabels[feedbackType]}</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; width: 100px;">From:</td>
                <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${name.trim()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Email:</td>
                <td style="padding: 8px 0;">
                  <a href="mailto:${email.trim()}" style="color: #3b82f6; text-decoration: none;">${email.trim()}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Type:</td>
                <td style="padding: 8px 0; color: #1e293b;">${typeLabels[feedbackType]}</td>
              </tr>
              ${feedbackType === "review" && rating ? `
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Rating:</td>
                <td style="padding: 8px 0; color: #f59e0b; font-size: 18px;">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</td>
              </tr>
              ` : ""}
            </table>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; margin: 0 0 8px 0; font-size: 14px;">Message:</p>
              <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <p style="color: #1e293b; margin: 0; white-space: pre-wrap; line-height: 1.6;">${message.trim()}</p>
              </div>
            </div>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px;">
            Sent from LeadFinder Pro Feedback Form
          </p>
        </div>
      `,
    });

    console.log("Feedback email sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders,
          ...rateLimitHeaders(rateLimit, 5)
        } 
      }
    );
  } catch (error: any) {
    console.error("Error sending feedback:", error);
    
    return new Response(
      JSON.stringify({ error: "Failed to send feedback. Please try again later." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
