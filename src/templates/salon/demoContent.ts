import type { SiteContent } from "../shared/content";

/**
 * Realistic placeholder content for previewing the salon template. Stands in for
 * what the AI generator will produce per business. Image fields are intentionally
 * omitted so the bundled stock photography is exercised.
 */
export const demoContent: SiteContent = {
  businessName: "Aveline",
  category: "Hair salon",
  tagline:
    "A light-filled boutique salon in the heart of Notting Hill. Considered colour, soft tailored cuts, and an unhurried chair.",
  heroHeadline: "Beauty, made effortless.",
  about:
    "A neighbourhood salon for colour, cutting and care — balayage and gloss, soft lived-in layers, and treatments that leave hair looking like itself, only better. Settle in, and let it be an easy hour that's all about you.",
  services: [
    {
      name: "Cut & Finish",
      description: "Consultation, precision cut and a smooth blow-dry finish.",
      price: "£55",
      durationMins: 60,
    },
    {
      name: "Balayage",
      description: "Hand-painted, sun-soft colour blended through the lengths.",
      price: "from £140",
      durationMins: 150,
    },
    {
      name: "Full Head Colour",
      description: "Even, glossy colour root to tip, finished with a gloss.",
      price: "from £95",
      durationMins: 120,
    },
    {
      name: "Gloss & Toner",
      description: "A shine-boosting refresh to neutralise and revive tone.",
      price: "£40",
      durationMins: 45,
    },
    {
      name: "Blow-Dry",
      description: "A bouncy, polished finish for any occasion.",
      price: "£38",
      durationMins: 45,
    },
    {
      name: "Bridal & Occasion",
      description: "Styling for the day that matters, trial included.",
      price: "from £85",
      durationMins: 90,
    },
  ],
  hours: [
    { day: "Monday", open: "Closed" },
    { day: "Tuesday", open: "9:30 – 18:00" },
    { day: "Wednesday", open: "9:30 – 18:00" },
    { day: "Thursday", open: "9:30 – 20:00" },
    { day: "Friday", open: "9:30 – 20:00" },
    { day: "Saturday", open: "9:00 – 17:30" },
    { day: "Sunday", open: "Closed" },
  ],
  phone: "020 7946 0188",
  address: "12 Lonsdale Road, Notting Hill, London W11 2BY",
  googleRating: 4.9,
  reviewCount: 248,
  // heroImageUrl + galleryImageUrls omitted on purpose → bundled stock is used.
};
