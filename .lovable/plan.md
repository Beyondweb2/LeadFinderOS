

# Use LeadFinder Branded Image for WhatsApp Link Preview

## What We'll Do
Replace the current social media preview image with your LeadFinder branded image (dark blue background with "LeadFinder" text) so it shows when you share your app link on WhatsApp and other platforms.

## Steps

### 1. Copy your image to the project
Copy the uploaded LeadFinder image to `public/og-image.png`, replacing the current one.

### 2. Update meta tags with cache-busting
Add a version parameter (`?v=3`) to force WhatsApp to fetch the new image instead of using its cached version:

```html
<meta property="og:image" content="https://leadfinderapp.lovable.app/og-image.png?v=3">
<meta name="twitter:image" content="https://leadfinderapp.lovable.app/og-image.png?v=3">
```

## After Publishing
- Wait a few minutes after publishing for changes to take effect
- Test by sharing in a **new** WhatsApp conversation (existing chats may show cached version)
- If still showing old image, WhatsApp may take up to 24-48 hours to fully refresh its cache

## Technical Note
WhatsApp caches link previews aggressively. The `?v=3` parameter makes it treat this as a "new" URL and fetch the fresh image.

