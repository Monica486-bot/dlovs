import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ar from './ar';
import { setFormatLanguage } from '../utils/format';

const STORAGE_KEY = 'dlovs_lang';
const LanguageContext = createContext(null);
const reported = new Set();

// FR19: English / Arabic, as in the web app. Arabic is right-to-left.
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (saved === 'ar') setLangState('ar'); })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  // set before children render, so dates format in the right language
  setFormatLanguage(lang);

  const t = useCallback(
    (text, vars) => {
      let result = text;
      if (lang === 'ar') {
        if (ar[text] !== undefined) result = ar[text];
        else if (__DEV__ && !reported.has(text)) {
          reported.add(text);
          console.warn(`[i18n] missing Arabic: ${JSON.stringify(text)}`);
        }
      }
      return vars ? result.replace(/\{(\w+)\}/g, (match, key) => String(vars[key] ?? match)) : result;
    },
    [lang]
  );

  // tn('{n} parcel', '{n} parcels', n): English needs a different string for
  // one; the Arabic translations use a neutral "label: n" form for both.
  const tn = useCallback((one, other, n, vars) => t(n === 1 ? one : other, { n, ...vars }), [t]);
  const value = useMemo(() => ({ lang, setLang, t, tn, rtl: lang === 'ar' }), [lang, setLang, t, tn]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
