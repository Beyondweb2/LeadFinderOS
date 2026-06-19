import type { SiteContent } from "../shared/content";

/**
 * Realistic placeholder content for previewing the plumber template (e.g. /p/demo).
 * Stands in for what the generator produces per business. Image fields are
 * omitted so the bundled SVG placeholders are exercised. Reviews are represented
 * by a real rating + Google link only — never fabricated quotes (honesty rule).
 */
export const demoContent: SiteContent = {
  businessName: "Riverside Plumbing & Heating",
  category: "Plumber",
  tagline:
    "Reliable plumbing and heating across the local area — from emergency leaks and blocked drains to bathroom installs and boiler work.",
  heroHeadline: "Your trusted local plumber",
  about:
    "Riverside Plumbing & Heating is a plumbing service in Manchester focused on fixing it right — bathroom & kitchen plumbing, blocked drains, leaks & repairs. Call for a quote or emergency support. Rated 4.9 from 11 Google reviews.",
  services: [
    { name: "Bathroom & kitchen plumbing", description: "Taps, toilets, showers and pipework fitted and repaired." },
    { name: "Blocked toilets, sinks & drains", description: "Toilets, sinks and external drains cleared with minimal disruption." },
    { name: "Leak detection & repairs", description: "Hidden leaks located and fixed, plus reliable everyday repairs." },
    { name: "Boilers & central heating", description: "Boiler repairs, servicing and heating work to keep you warm." },
    { name: "Emergency call-outs", description: "Burst pipes and major leaks — fast response when it can't wait." },
    { name: "General plumbing & maintenance", description: "Day-to-day upkeep, inspections and non-emergency fixes." },
  ],
  whyUsPoints: [
    "Clear pricing options before we start",
    "Expert, guaranteed workmanship",
    "Fast, friendly local service",
  ],
  processSteps: [
    { title: "Call or message", description: "Tell us the problem — we'll arrange a convenient visit or emergency attendance." },
    { title: "Assess & quote", description: "We diagnose on site and agree the price before work begins where possible." },
    { title: "Repair & test", description: "Quality parts and proven methods, with checks before we leave." },
    { title: "Invoice & guarantee", description: "Clear paperwork and a warranty on our labour." },
  ],
  faqs: [
    { question: "How quickly can you attend an emergency?", answer: "We prioritise urgent jobs such as major leaks and loss of water. Availability depends on your location — call us for the soonest slot." },
    { question: "Do you charge a call-out fee?", answer: "We explain any call-out or diagnostic charges before work starts, and give a clear quote for the repair wherever possible." },
    { question: "Which areas do you cover?", answer: "We serve homeowners and landlords across the local area. Contact us with your postcode to confirm coverage." },
    { question: "Can I use chemical drain cleaners?", answer: "They may work temporarily but can damage pipes with repeated use. For stubborn blockages a professional clear is safer and more effective." },
  ],
  serviceArea: "Manchester & surrounding areas",
  hours: [
    { day: "Monday", open: "8:00 – 18:00" },
    { day: "Tuesday", open: "8:00 – 18:00" },
    { day: "Wednesday", open: "8:00 – 18:00" },
    { day: "Thursday", open: "8:00 – 18:00" },
    { day: "Friday", open: "8:00 – 18:00" },
    { day: "Saturday", open: "9:00 – 14:00" },
    { day: "Sunday", open: "Emergency call-outs only" },
  ],
  phone: "0161 496 0123",
  address: "12 Canal Street, Manchester M1 3HE, United Kingdom",
  googleRating: 4.9,
  reviewCount: 11,
  googleReviewsUrl: "https://www.google.com/maps",
};
