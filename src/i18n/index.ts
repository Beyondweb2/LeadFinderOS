import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import ur from './locales/ur.json';

const LANG_STORAGE_KEY = 'leadfinder_language';

function getStoredLanguage(): string {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) || 'en';
  } catch {
    return 'en';
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      ur: { translation: ur },
    },
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export { LANG_STORAGE_KEY };
export default i18n;
