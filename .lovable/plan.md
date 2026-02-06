

# Plan: Speed Up Video Loading on Landing Page

## Current Implementation

The video is currently implemented as a simple `<video>` tag with:
- `autoPlay`, `loop`, `muted`, `playsInline` attributes
- Direct import of the MP4 file from `src/assets/leadfinder-demo.mp4`
- No loading optimization or preloading strategy

## Recommended Optimizations

### 1. Add `preload="auto"` Attribute
Tell the browser to start downloading the video immediately when the page loads, rather than waiting.

### 2. Add Poster Image (Loading Placeholder)
Display a static image while the video loads, so users see content immediately instead of a blank space.

### 3. Add `fetchpriority="high"` 
Signal to the browser that this video is high priority for loading.

### 4. Consider Video Hosting (Future Enhancement)
For even faster loading, the video could be moved to a CDN like Cloudflare or Supabase Storage. This is optional but worth mentioning.

---

## Technical Changes

### File: `src/pages/Landing.tsx`

Update the `VideoSection` component's video element:

```tsx
<video 
  ref={videoRef}
  className="w-full h-auto"
  autoPlay 
  loop 
  muted
  playsInline
  preload="auto"
  poster="/placeholder.svg"  // Or create a video thumbnail
>
  <source src={demoVideo} type="video/mp4" />
  Your browser does not support the video tag.
</video>
```

### Optional: Create a Video Poster Image
For the best user experience, we can extract the first frame of your video as a poster image. This shows users something immediately while the video downloads.

---

## Summary

| Change | Impact |
|--------|--------|
| Add `preload="auto"` | Browser starts loading video immediately |
| Add poster image | Shows placeholder while video loads |
| Keep video bundled | Vite already optimizes the import |

These changes will make the video appear to load faster by:
1. Starting the download earlier
2. Showing a placeholder so the space isn't blank

