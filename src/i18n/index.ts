import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/* ⛔ ENGLISH ONLY SINCE 2026-09-09. The Hindi and Urdu bundles were shipped for the
   barber-reseller product and were selectable from a language menu no Findable operator
   has ever needed; only ~22 strings (the sidebar labels) are translated at all. The
   i18next machinery stays because those 22 t() calls read through it — deleting the
   library would mean rewriting every nav label for no gain. Adding a language back is
   one JSON file plus one line here. */
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
