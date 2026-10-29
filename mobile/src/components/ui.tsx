import { Children, cloneElement, isValidElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { colors, radius } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface ScreenProps {
  children?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}

// FR19: Arabic lays the screen out right-to-left. `direction` flips rows and
// start/end for everything inside the screen.
export function Screen({ children, scroll = true, padded = true }: ScreenProps) {
  const { rtl } = useT();
  const direction: ViewStyle = { direction: rtl ? 'rtl' : 'ltr' };
  const content = [styles.screen, !padded && styles.unpadded];
  if (!scroll) return <View style={[...content, direction, styles.fill]}>{children}</View>;
  return (
    <ScrollView style={[styles.scroll, direction]} contentContainerStyle={content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

// An Ionicons name; arrows and chevrons point the other way in Arabic
export function Icon({ name, size = 20, color = colors.navy, style }: IconProps) {
  const { rtl } = useT();
  const flips = rtl && /(chevron|arrow)-(forward|back)/.test(name);
  return <Ionicons name={name} size={size} color={color} style={[flips && styles.flip, style]} />;
}

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

// variant: primary | secondary | danger | ghost. Text only: `icon` is accepted
// but not drawn, to keep screens uncluttered.
export function Button({ title, onPress, variant = 'primary', disabled, loading, accessibilityHint }: ButtonProps) {
  const textColor = variant === 'primary' || variant === 'danger' ? colors.white : variant === 'ghost' ? colors.navy : colors.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({ children, style, padded = true }: CardProps) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

type Tone = 'danger' | 'warning' | 'success' | 'info';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  danger: { bg: colors.dangerPale, fg: colors.danger },
  warning: { bg: colors.warningPale, fg: colors.warning },
  success: { bg: colors.successPale, fg: colors.success },
  info: { bg: colors.navyPale, fg: colors.navy },
};

interface BannerProps {
  tone?: Tone;
  title?: string | null;
  children?: ReactNode;
}

// tone: 'danger' | 'warning' | 'success' | 'info'
export function Banner({ tone = 'info', title, children }: BannerProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderStartColor: t.fg }]} accessibilityRole="alert">
      <View style={styles.bannerText}>
        {title ? <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text> : null}
        {children ? <Text style={[styles.bannerBody, { color: t.fg }]}>{children}</Text> : null}
      </View>
    </View>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
}

export function Field({ label, style, hint, ...inputProps }: FieldProps) {
  const { rtl } = useT();
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, { textAlign: rtl ? 'right' : 'left' }, inputProps.multiline && styles.multiline, style]}
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

interface RowProps {
  label: string;
  value?: string | number | null;
  icon?: IconName;
}

// A label/value pair (`icon` is accepted but not drawn)
export function Row({ label, value }: RowProps) {
  const { rtl } = useT();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { textAlign: rtl ? 'left' : 'right' }]} selectable>{value ?? '-'}</Text>
    </View>
  );
}

// A tappable list row: icon, title, subtitle, something on the end, chevron
interface ListItemProps {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  // set by List on its first row
  first?: boolean;
  accessibilityLabel?: string;
  fullTitle?: boolean;
}

// fullTitle: show the whole title (e.g. a notification) instead of two lines.
// The icon props are accepted but not drawn, to keep lists plain.
export function ListItem({ title, subtitle, right, onPress, first, accessibilityLabel, fullTitle }: ListItemProps) {
  const body = (
    <View style={[styles.item, !first && styles.itemDivider]}>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={fullTitle ? undefined : 2}>{title}</Text>
        {subtitle ? <Text style={styles.itemSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && styles.itemPressed}>
      {body}
    </Pressable>
  );
}

interface ListProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// A card holding ListItems
export function List({ children, style }: ListProps) {
  // the first row has no divider above it
  const items = Children.toArray(children).filter((child): child is ReactElement<ListItemProps> => isValidElement(child));
  return (
    <Card padded={false} style={[styles.list, style]}>
      {items.map((child, i) => (i === 0 ? cloneElement(child, { first: true }) : child))}
    </Card>
  );
}

interface SectionTitleProps {
  children?: ReactNode;
  action?: ReactNode;
}

export function SectionTitle({ children, action }: SectionTitleProps) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>
      {action}
    </View>
  );
}

interface MutedProps {
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
}

export function Muted({ children, style }: MutedProps) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

interface EmptyProps {
  icon: IconName;
  title?: string;
  children?: ReactNode;
}

// A centred message for empty lists
export function Empty({ title, children }: EmptyProps) {
  return (
    <View style={styles.empty}>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      {children ? <Text style={styles.emptyBody}>{children}</Text> : null}
    </View>
  );
}

export interface ChipOption<K extends string | number> {
  key: K;
  label: string;
  icon?: IconName;
}

interface ChipsProps<K extends string | number> {
  options: ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  label?: string;
}

// A row of selectable chips (search mode, filters, document type…)
export function Chips<K extends string | number>({ options, value, onChange, label }: ChipsProps<K>) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, selected && styles.chipActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 16, paddingBottom: 32, gap: 14, backgroundColor: colors.bg, flexGrow: 1 },
  unpadded: { padding: 0, paddingBottom: 32 },
  flip: { transform: [{ scaleX: -1 }] },

  button: { minHeight: 52, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  button_primary: { backgroundColor: colors.navy },
  button_secondary: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy },
  button_danger: { backgroundColor: colors.danger },
  button_ghost: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy },
  buttonPressed: { opacity: 0.85 },
  buttonDim: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '700' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardPadded: { padding: 18, gap: 10 },

  banner: { flexDirection: 'row', borderRadius: radius.md, padding: 16, borderStartWidth: 5 },
  bannerText: { flex: 1, gap: 3 },
  bannerTitle: { fontSize: 16, fontWeight: '700' },
  bannerBody: { fontSize: 15, lineHeight: 21 },

  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.text,
  },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
  rowLabel: { color: colors.muted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },

  list: { overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.white },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemPressed: { opacity: 0.7 },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSubtitle: { fontSize: 13, color: colors.muted, lineHeight: 18 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.navy, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: colors.white },
});
