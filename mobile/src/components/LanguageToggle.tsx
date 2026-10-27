import { Pressable, StyleSheet, Text } from 'react-native';
import { useT } from '../i18n';
import { colors } from '../theme';

// FR19: switch language from any screen's header
interface LanguageToggleProps {
  color?: string;
}

export default function LanguageToggle({ color = colors.white }: LanguageToggleProps) {
  const { lang, setLang } = useT();
  return (
    <Pressable
      onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      accessibilityRole="button"
      accessibilityLabel={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      hitSlop={8}
      style={styles.button}
    >
      <Text style={[styles.text, { color }]}>{lang === 'ar' ? 'English' : 'العربية'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontWeight: '600', fontSize: 15 },
});
