import { useT } from '../i18n';

// Each language's name is written in that language, so someone who can't read
// the current one can still find theirs.
export default function LanguageToggle({ className = '' }) {
  const { lang, setLang } = useT();
  return (
    <button
      type="button"
      className={`lang-toggle ${className}`}
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      lang={lang === 'ar' ? 'en' : 'ar'}
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}
