
# Contact & Feedback Page Implementation Plan

## Overview
Build a dedicated feedback page where users can submit reviews, feature requests, and general feedback. The form will send submissions via email using Resend to your verified domain (`lead-finder-app.com`).

---

## What We'll Build

### 1. Feedback Page (`/feedback`)
A clean, accessible page with a tabbed form for different feedback types:
- **Reviews** - User testimonials (name, rating, review text)
- **Feature Requests** - Suggestions for new features
- **General Feedback** - Bug reports, questions, other feedback

### 2. Backend Edge Function
A new `send-feedback` edge function that:
- Validates all input with Zod
- Rate limits submissions (5/minute per user)
- Sends formatted emails via Resend
- Returns success/error responses

---

## Implementation Steps

### Step 1: Securely Add Resend API Key
Request your Resend API key using Lovable's secret management system, which stores it securely in your backend environment.

### Step 2: Create Edge Function
Build `supabase/functions/send-feedback/index.ts` with:
- CORS handling for web requests
- Input validation (name, email, feedback type, message)
- Rate limiting (5 requests/minute)
- Resend email delivery
- Error handling that doesn't expose internal details

### Step 3: Create Feedback Page
Build `src/pages/Feedback.tsx` with:
- Tabbed interface (Reviews / Feature Requests / General)
- Form fields with validation
- Star rating component for reviews
- Loading states and success/error toasts
- Mobile-responsive design matching existing app style

### Step 4: Add Route & Navigation
- Add `/feedback` route in App.tsx
- Add link in landing page footer
- Optionally add link in app sidebar for logged-in users

---

## Technical Details

### Edge Function Structure
```text
supabase/functions/send-feedback/index.ts
├── CORS headers (matching existing pattern)
├── Rate limiting (5 req/min using shared rate-limiter)
├── Zod validation schema
├── Resend email sending
└── Error handling (generic client messages)
```

### Email Format
Sends to your specified email with:
- Clear subject line (e.g., "[LeadFinder] New Review from John D.")
- Formatted HTML body with all submission details
- From address: `noreply@lead-finder-app.com`

### Form Validation
- Name: Required, 2-100 characters
- Email: Valid email format
- Rating: 1-5 stars (reviews only)
- Message: Required, 10-2000 characters

---

## Security Measures
- Server-side input validation
- Rate limiting to prevent spam
- No sensitive data logging
- Generic error messages to clients

---

## What I Need From You
1. **Your Resend API key** (I'll request it securely)
2. **Your email address** where feedback should be sent

---

## Files to Create/Modify
| File | Action |
|------|--------|
| `supabase/functions/send-feedback/index.ts` | Create |
| `supabase/config.toml` | Add function config |
| `src/pages/Feedback.tsx` | Create |
| `src/App.tsx` | Add route |
| `src/pages/Landing.tsx` | Add footer link |
