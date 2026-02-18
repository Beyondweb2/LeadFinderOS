

## Fix: Video Not Playing on Landing Page

**Root Cause**: The new video file (`leadfinder-demo-v2.mp4`) that was copied from the user upload appears to be empty or corrupted. The browser loads it without errors but shows a blank player because there's no valid video data to decode.

**Solution**: Re-copy the uploaded video file (`Final_LeadFinderApp_Video-2.mp4`) to `src/assets/leadfinder-demo-v2.mp4`, overwriting the current broken file. The import in `Landing.tsx` already points to this filename, so no code changes are needed -- only the asset file needs to be replaced.

### Steps

1. **Replace the video asset** -- Copy the user-uploaded file (`user-uploads://Final_LeadFinderApp_Video-2.mp4`) to `src/assets/leadfinder-demo-v2.mp4`, ensuring the binary content is fully transferred.

2. **Verify playback** -- Confirm the video plays in both the mobile hero section and the desktop video section on the landing page.

No other files or sections will be modified.

### Technical Details

- File: `src/assets/leadfinder-demo-v2.mp4` (overwrite)
- Import in `src/pages/Landing.tsx` line 29 already correct: `import demoVideo from '@/assets/leadfinder-demo-v2.mp4'`
- Both `MobileHeroVideo` and `VideoSection` components reference `demoVideo` -- no code changes needed
- Video attributes (`autoPlay`, `muted`, `playsInline`, `loop`) are correctly set for autoplay compliance

