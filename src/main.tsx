import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Register the minimal service worker so the dashboard is installable as an app
// (Android "Install app" + desktop address-bar install). Pass-through SW (no
// caching) — safe for the SPA. Best-effort; never blocks the app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

/* ── VERSION-FRESHNESS CHECK (2026-08-18) — end the "fixes ship but I still see the old app"
   problem. A tab left open across a deploy keeps running its old bundle until reloaded, and Coverage
   fixes kept looking "not shipped" for exactly this reason. This compares the ENTRY-CHUNK hash the
   tab is running (import.meta.url = /assets/index-<hash>.js) against the hash the freshly-fetched
   index.html references. On a mismatch a new deploy exists → one unobtrusive "reload" bar, so the
   operator picks the moment (never an auto-reload mid-action). PROD only: dev has no hashed entry
   chunk, and touches nothing in Coverage or anywhere else. */
if (import.meta.env.PROD) {
  const running = import.meta.url.match(/index-[\w-]+\.js/)?.[0] ?? null;
  let shown = false;
  const check = async () => {
    if (shown || !running) return;
    try {
      const html = await fetch("/index.html", { cache: "no-store" }).then((r) => r.text());
      const latest = html.match(/assets\/(index-[\w-]+\.js)/)?.[1] ?? null;
      if (!latest || latest === running) return;
      shown = true;
      const bar = document.createElement("div");
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1a3d7c;color:#fff;padding:10px 16px;font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;box-shadow:0 -2px 12px rgba(0,0,0,.25)";
      bar.textContent = "A new version of the app is available.";
      const btn = document.createElement("button");
      btn.textContent = "Reload";
      btn.style.cssText = "background:#fff;color:#1a3d7c;border:0;border-radius:6px;padding:4px 14px;font-weight:600;cursor:pointer";
      btn.onclick = () => window.location.reload();
      bar.appendChild(btn);
      document.body.appendChild(bar);
    } catch { /* offline/transient — the interval retries */ }
  };
  window.setTimeout(check, 5000);
  window.setInterval(check, 3 * 60 * 1000);
}
