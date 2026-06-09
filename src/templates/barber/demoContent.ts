import type { BarberSiteContent } from "./types";

/**
 * Realistic placeholder content for previewing the template. Stands in for what
 * the AI generator will produce per business. Image fields are intentionally
 * omitted so the bundled stock photography is exercised.
 */
export const demoContent: BarberSiteContent = {
  businessName: "Sharps & Co.",
  tagline:
    "An independent barbershop in the heart of Shoreditch. Traditional craft, modern finish — no fuss, just a proper cut.",
  heroHeadline: "Look sharp. Feel sharper.",
  about:
    "A neighbourhood barbershop focused on sharp cuts, skin fades, and beard work, with a relaxed chair and an easy booking experience. Whether you're after a quick trim or the full treatment, it's no fuss — just a proper cut and a finish you'll want to show off.",
  services: [
    {
      name: "Signature Cut",
      description: "Consultation, cut, hot-towel finish and styling.",
      price: "£28",
      durationMins: 45,
    },
    {
      name: "Skin Fade",
      description: "Precision taper, blended by hand from the skin up.",
      price: "£30",
      durationMins: 45,
    },
    {
      name: "Cut & Beard",
      description: "Full cut paired with a sculpted, razored beard line.",
      price: "£40",
      durationMins: 60,
    },
    {
      name: "Beard Trim & Shape",
      description: "Tidy-up, line-out and hot-towel conditioning.",
      price: "£18",
      durationMins: 30,
    },
    {
      name: "Hot-Towel Wet Shave",
      description: "Traditional cut-throat shave, oils and balm.",
      price: "£32",
      durationMins: 45,
    },
    {
      name: "Under 12s",
      description: "Patient, friendly cuts for the next generation.",
      price: "£16",
      durationMins: 30,
    },
  ],
  hours: [
    { day: "Monday", open: "Closed" },
    { day: "Tuesday", open: "9:00 – 18:30" },
    { day: "Wednesday", open: "9:00 – 18:30" },
    { day: "Thursday", open: "9:00 – 20:00" },
    { day: "Friday", open: "9:00 – 20:00" },
    { day: "Saturday", open: "8:30 – 18:00" },
    { day: "Sunday", open: "10:00 – 16:00" },
  ],
  phone: "020 7946 0123",
  address: "47 Redchurch Street, Shoreditch, London E2 7DJ",
  googleRating: 4.9,
  reviewCount: 312,
  // heroImageUrl + galleryImageUrls omitted on purpose → bundled stock is used.
};
