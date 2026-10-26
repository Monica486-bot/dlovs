import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ar from './ar';
import { setFormatLanguage } from '../utils/format';

interface LanguageContextValue {
  lang: string;
  setLang: (lang: string) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
  tn: (one: string, other: string, n: number, vars?: Record<string, string | number>) => string;
  rtl: boolean;
}

const STORAGE_KEY = 'dlovs_lang';
const LanguageContext = createContext<LanguageContextValue | null>(null);
const reported = new Set<string>();

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (saved === 'ar') setLangState('ar'); })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  setFormatLanguage(lang);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>): string => {
      let result = text;
      if (lang === 'ar') {
        if ((ar as Record<string, string>)[text] !== undefined) result = (ar as Record<string, string>)[text];
        else if (__DEV__ && !reported.has(text)) {
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

  const value = useMemo(() => ({ lang, setLang, t, tn, rtl: lang === 'ar' }), [lang, setLang, t, tn]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used inside LanguageProvider');
  return ctx;
}
