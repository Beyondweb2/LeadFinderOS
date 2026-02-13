

## Add Loading Spinner to Video Components

A simple spinning ring animation will display while the video is buffering/loading, then disappear once the video is ready to play. This is pure CSS -- zero performance impact on the video itself.

### How it works

1. Add a `videoLoaded` state (starts `false`) to both `MobileHeroVideo` and `VideoSection` components
2. Listen for the video's `onCanPlayThrough` event to flip `videoLoaded` to `true`
3. While `videoLoaded` is false, show a centered spinning ring overlay on top of the video container
4. Once loaded, the spinner fades out and the video is fully visible

### Changes

**`src/pages/Landing.tsx`** (both `MobileHeroVideo` and `VideoSection` components):

- Add `const [videoLoaded, setVideoLoaded] = useState(false);` state
- Add `onCanPlayThrough={() => setVideoLoaded(true)}` to the `<video>` element
- Add a loading overlay inside the video container div (positioned absolute, centered):
  - A spinning ring using Tailwind's `animate-spin` on a bordered circle
  - Fades out with a transition when `videoLoaded` becomes true
  - Uses `pointer-events-none` so it doesn't block interaction

### Visual

- Dark semi-transparent background matching the card
- A subtle blue spinning ring (matching the brand blue glow already used)
- Smooth fade-out transition when video is ready

No new files, no new dependencies -- just a small state + conditional overlay in the two existing video components.

