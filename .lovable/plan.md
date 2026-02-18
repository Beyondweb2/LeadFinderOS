

# Fix: Video audible but invisible — nuclear approach

## Root Cause (most likely)
The video file may use a codec (like HEVC/H.265) that the browser can decode audio for but cannot render visually. Alternatively, the `<source>` child element pattern can sometimes cause rendering quirks. The decorative gradient overlay divs may also interfere in some browsers.

## Solution: Strip everything to bare minimum
Remove all decorative wrappers and use the simplest possible video implementation to eliminate every possible cause:

### Changes in `src/pages/Landing.tsx`

**1. Use `src` attribute directly on `<video>` instead of `<source>` child**
Some browsers handle `src` on the video element more reliably than nested `<source>` tags.

**2. Add explicit `display: block` and minimum height**
Prevents the video from collapsing to zero dimensions.

**3. Remove all decorative gradient divs wrapping the video**
These absolute-positioned gradient overlays could interfere with rendering in some browsers. Strip them completely.

**4. Simplify both MobileHeroVideo and VideoSection to bare-bones:**

```tsx
const MobileHeroVideo = () => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <video
        ref={videoRef}
        src={demoVideo}
        className="w-full h-auto block"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      <button
        onClick={toggleMute}
        className="absolute bottom-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
};
```

Same simplification for `VideoSection` (desktop version).

**Key differences from current code:**
- `src={demoVideo}` on `<video>` directly (no `<source>` child)
- Added `block` class to prevent inline rendering gaps
- Removed all 3 decorative gradient wrapper divs
- Removed `bg-card/80` and `backdrop-blur-sm` from container (these can interfere with video compositing)
- Removed `width`/`height` attributes (let CSS handle sizing via `w-full h-auto`)

## Files Changed
- `src/pages/Landing.tsx` — simplify both video components to bare-minimum markup

