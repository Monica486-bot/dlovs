// FR19: English / Arabic interface.
// Strings are written in English in the code and looked up in ar.js; anything
// missing falls back to English (and is logged once in development, so gaps
// are easy to find). Arabic switches the whole page to right-to-left.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar';
import { setFormatLanguage } from '../utils/format';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'dlovs_lang';
const reported = new Set();

function initialLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage);

  // set before children render, so dates format correctly on the first pass
  setFormatLanguage(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // private mode: the choice just isn't remembered
    }
  }, [lang]);

  const t = useCallback(
    (text, vars) => {
      let result = text;
      if (lang === 'ar') {
        if (ar[text] !== undefined) result = ar[text];
        else if (import.meta.env.DEV && !reported.has(text)) {
          reported.add(text);
          console.warn(`[i18n] missing Arabic: ${JSON.stringify(text)}`);
        }
      }
      return vars ? result.replace(/\{(\w+)\}/g, (match, key) => (vars[key] ?? match)) : result;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr' }), [lang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
