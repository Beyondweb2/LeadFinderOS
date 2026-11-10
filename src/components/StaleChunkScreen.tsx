/* "A NEW VERSION OF THE APP IS OUT" (2026-11-07; the on-call wording 2026-11-10). What the page error screen in App.tsx shows
   when a lazy page from an older deploy will not load and the one automatic reload (src/lib/staleChunk.ts) did not, or
   could not, cure it.
   ⛔ ON A CALL NOTHING RELOADS BY ITSELF: a reload destroys the Twilio device and hangs up on the prospect. The screen says
      so, Go back returns to the page they were on (it is already loaded), and the reload button names what it costs.
   Inline styles on purpose: this must draw even when the stylesheet of the new deploy has not loaded. */
export function StaleChunkScreen({ onCall }: { onCall: boolean }) {
  const text = { fontSize: 13, color: '#aaa', maxWidth: 480, textAlign: 'center' as const };
  const button = { padding: onCall ? '10px 16px' : '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' };
  return (
    <div data-testid="stale-chunk" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui', gap: 12, padding: 16 }}>
      <p style={{ fontSize: 16, color: '#888' }}>A new version of the app is out.</p>
      {onCall ? (
        <p data-testid="stale-chunk-on-call" style={text}>
          This page needs a reload before it will open, and a reload would end your call. Go back and carry on with the call. The app reloads by itself on the next page you open after it.
        </p>
      ) : (
        <p style={text}>Reload the page to carry on. Anything already saved is kept.</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {onCall && <button data-testid="stale-chunk-back" onClick={() => window.history.back()} style={{ ...button, fontWeight: 600 }}>Go back</button>}
        <button onClick={() => window.location.reload()} style={button}>{onCall ? 'Reload and end the call' : 'Reload'}</button>
      </div>
    </div>
  );
}
