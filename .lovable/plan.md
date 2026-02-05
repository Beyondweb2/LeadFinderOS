
# Landing Page Implementation Plan

## Overview
Create a compelling marketing landing page for unauthenticated visitors that showcases LeadFinder Pro's features, pricing, and includes clear calls-to-action to subscribe.

## User Flow
```text
New Visitor
    |
    v
Landing Page (/)
    |
    +-- "Start Free Trial" / "Subscribe" --> /auth (sign up)
    |
    +-- "Sign In" --> /auth (login)
    |
    v
After Auth --> Subscription Check --> /subscribe or App
```

## Design Approach

### Visual Style
- Match the existing dark professional theme with teal/cyan primary color
- Use the existing `glass-panel` and gradient effects from the design system
- Include animated elements for engagement (subtle glow effects, fade-ins)
- Fully responsive for mobile and desktop

### Page Sections

1. **Hero Section**
   - Bold headline: "Find Businesses Without Websites"
   - Subheadline explaining the value proposition
   - Primary CTA: "Get Started" button
   - Secondary CTA: "Sign In" link
   - Optional: Animated mockup or illustration

2. **Features Grid**
   - 6 key features with icons:
     - Lead Search (find businesses without websites)
     - CRM Pipeline (track outreach progress)
     - Contact Tracking (log calls and messages)
     - Templates (email and voice note scripts)
     - Export Tools (CSV export for external use)
     - Smart Classification (AI-powered lead scoring)

3. **How It Works**
   - 3-step process explanation:
     - Step 1: Search for businesses in your target area
     - Step 2: Add hot leads to your pipeline
     - Step 3: Track outreach and close deals

4. **Pricing Card**
   - LeadFinder Pro at 19.99/month
   - Feature list (matching the Subscribe page)
   - CTA button to start subscription

5. **Footer**
   - Simple footer with branding
   - Links to sign in/sign up

---

## Technical Details

### New Components
- `src/pages/Landing.tsx` - The main landing page component

### Route Configuration Changes
Update `src/App.tsx` to:
- Add a new `/landing` route for the landing page (public, no auth required)
- Modify the `/` route logic to redirect unauthenticated users to `/landing`
- Or alternatively, make `/` render Landing for guests and Index for authenticated+subscribed users

### Recommended Approach
Create a wrapper component or modify the existing route structure:
- Unauthenticated users visiting `/` see the Landing page
- Authenticated users are handled by ProtectedRoute + SubscriptionGate as before

### Styling
- Use existing Tailwind classes and CSS variables
- Leverage existing components: Button, Card, Badge
- Add any new animations inline or extend index.css if needed

### Icons Used
From lucide-react (already installed):
- Target (branding)
- Search (lead search feature)
- ClipboardList (CRM feature)
- Phone/MessageSquare (contact tracking)
- FileText (templates)
- Download (export)
- Zap (AI classification)
- Check (feature checkmarks)
- ArrowRight (CTAs)

### Mobile Responsiveness
- Hero: Stack elements vertically on mobile
- Features: 1 column on mobile, 2 on tablet, 3 on desktop
- Pricing: Full-width card on mobile
