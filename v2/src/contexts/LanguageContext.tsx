// CREATED: 2026-03-17 IST (Jerusalem)
// LanguageContext - 3-language i18n with RTL support (Hebrew primary)
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '@/i18n';

export type Language = 'he' | 'ar' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  direction: 'ltr' | 'rtl';
}

const VALID_LANGUAGES: Language[] = ['he', 'ar', 'en'];

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  const [fallbackLanguage, setFallbackLanguage] = useState<Language>(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('lexdoc-language')) as string | null;
    return saved && VALID_LANGUAGES.includes(saved as Language) ? (saved as Language) : 'he';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = fallbackLanguage === 'en' ? 'ltr' : 'rtl';
      document.documentElement.lang = fallbackLanguage;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('lexdoc-language', fallbackLanguage);
    }
  }, [fallbackLanguage]);

  const fallbackDirection: 'ltr' | 'rtl' = fallbackLanguage === 'en' ? 'ltr' : 'rtl';

  const fallbackT = (key: string): string => {
    return (
      translations[fallbackLanguage]?.[key] ||
      translations['he']?.[key] ||
      translations['en']?.[key] ||
      key
    );
  };

  if (context) return context;

  return {
    language: fallbackLanguage,
    setLanguage: setFallbackLanguage,
    t: fallbackT,
    direction: fallbackDirection,
  };
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('lexdoc-language') as string;
    if (saved && VALID_LANGUAGES.includes(saved as Language)) {
      document.documentElement.dir = saved === 'en' ? 'ltr' : 'rtl';
      document.documentElement.lang = saved;
      return saved as Language;
    }
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'he';
    return 'he';
  });

  useEffect(() => {
    localStorage.setItem('lexdoc-language', language);
    document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
    document.documentElement.lang = language;
  }, [language]);

  const direction: 'ltr' | 'rtl' = language === 'en' ? 'ltr' : 'rtl';

  const t = (key: string): string => {
    return (
      translations[language]?.[key] ||
      translations['he']?.[key] ||
      translations['en']?.[key] ||
      key
    );
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, direction }}>
      {children}
    </LanguageContext.Provider>
  );
};
