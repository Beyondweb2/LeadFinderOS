import { useBarberBranding } from "@/hooks/useBarberBranding";
import "@/templates/barber/fonts.css";

/**
 * Minimal holding page for the bare bookmybarber.uk root (no slug). Booking pages
 * live at /<slug>; this is just a clean placeholder until we build a real landing.
 */
export default function BookingHome() {
  // Title + the barber favicon, so the bookmybarber.uk root never shows LeadFinder's.
  useBarberBranding("Online booking");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-zinc-200">
      <h1 className="font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">Online booking</h1>
      <p className="max-w-md text-sm text-zinc-400">
        Booking pages for barbers &amp; salons. If you were sent a booking link, open it to book your appointment.
      </p>
    </div>
  );
}
