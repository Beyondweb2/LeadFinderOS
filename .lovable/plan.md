

# Fix: Remove Free Trial Messaging

## Problem
The landing page has a "Start Free Trial" button that's misleading since you don't offer a free trial. Users must subscribe at £19.99/month to access the app.

## Solution
Update the button text to accurately reflect your offering.

## Changes

### 1. Update Hero Section CTA Button
**File:** `src/pages/Landing.tsx`

Change the primary call-to-action button from:
```
Start Free Trial
```
To:
```
Get Started
```

This matches the existing "Get Started" button in the header and pricing section, creating consistent messaging throughout the page.

## Summary
- Single file change
- Updates one button label
- Creates consistent CTA messaging across the landing page
- No functionality changes needed - the button already correctly links to `/auth`

