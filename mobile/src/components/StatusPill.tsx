import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { colors, radius } from '../theme';

const PALETTE: Record<string, [string, string]> = {
  active: [colors.successPale, colors.success],
  verified: [colors.successPale, colors.success],
  completed: [colors.successPale, colors.success],
  disputed: [colors.warningPale, colors.warning],
  pending: [colors.warningPale, colors.warning],
  deactivated: [colors.dangerPale, colors.danger],
  rejected: [colors.dangerPale, colors.danger],
};

const LABELS: Record<string, string> = {
  active: 'Active',
  disputed: 'Disputed',
  deactivated: 'Deactivated',
  verified: 'Verified',
  pending: 'Pending',
  rejected: 'Rejected',
  completed: 'Completed',
};

interface StatusPillProps {
  status: string;
}

export default function StatusPill({ status }: StatusPillProps) {
  const { t } = useT();
  const [bg, fg] = PALETTE[status] || [colors.navyPale, colors.navy];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.text, { color: fg }]}>{t(LABELS[status] || status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
