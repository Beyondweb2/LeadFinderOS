
# Fix: Video visible but hidden behind loading overlay

## Root Cause
The loading spinner overlay sits on top of the video (`z-10`, `bg-card/90`) and only disappears when `onCanPlayThrough` fires. This event requires the browser to have buffered enough data to play through without interruption. However:
- Mobile video uses `preload="none"`, so the browser never buffers enough to trigger the event
- Desktop uses `preload="metadata"`, which is also unreliable for this event
- Result: the overlay stays permanently visible, covering the playing video

## Fix
Two changes in `src/pages/Landing.tsx`:

1. **Switch from `onCanPlayThrough` to `onPlaying`** -- this event fires as soon as the video actually starts playing, which is a much more reliable signal that the video is ready to be shown.

2. **Change `preload` to `"auto"`** on both video elements so the browser actually buffers the content.

### MobileHeroVideo (line ~237-247)
- Change `preload="none"` to `preload="auto"`
- Change `onCanPlayThrough` to `onPlaying`

### VideoSection (line ~309-319)
- Change `preload="metadata"` to `preload="auto"`
- Change `onCanPlayThrough` to `onPlaying`

## Files Changed
- `src/pages/Landing.tsx` -- 4 small attribute changes across 2 video elements
