import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import ar from './ar';
import { setFormatLanguage } from '../utils/format';

interface LanguageContextValue {
  lang: string;
  setLang: (lang: string) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
  tn: (one: string, other: string, n: number, vars?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'dlovs_lang';
const reported = new Set<string>();

function initialLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState(initialLanguage);

  setFormatLanguage(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // private mode
    }
  }, [lang]);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>): string => {
      let result = text;
      if (lang === 'ar') {
        if ((ar as Record<string, string>)[text] !== undefined) result = (ar as Record<string, string>)[text];
        else if (import.meta.env.DEV && !reported.has(text)) {
          reported.add(text);
          console.warn(`[i18n] missing Arabic: ${JSON.stringify(text)}`);
        }
      }
      return vars ? result.replace(/\{(\w+)\}/g, (match, key) => String(vars[key] ?? match)) : result;
    },
    [lang]
  );

  const tn = useCallback(
    (one: string, other: string, n: number, vars?: Record<string, string | number>) => t(n === 1 ? one : other, { n, ...vars }),
    [t]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, tn, dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'ltr' | 'rtl' }),
    [lang, t, tn]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used inside LanguageProvider');
  return ctx;
}
