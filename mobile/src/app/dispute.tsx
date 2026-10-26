import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '../api/client';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme';

const TYPES = [
  { key: 'ownership', label: 'Ownership', hint: 'Someone else claims to own this plot, or it was sold without the owner\'s consent.' },
  { key: 'boundary', label: 'Boundary', hint: 'The plot\'s edges or size are wrong, or overlap with a neighbour.' },
];

// Citizen.flagDispute(parcelId): FR12.
export default function FlagDispute() {
  const { parcelId } = useLocalSearchParams();
  const { user, logout } = useAuth();
  const { t } = useT();
  const [type, setType] = useState('ownership');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await api.post('/disputes', { parcel_id: Number(parcelId), dispute_type: type, description: description.trim() });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace({ pathname: '/login', params: { returnTo: `/dispute?parcelId=${parcelId}` } });
        return;
      }
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <Screen>
        <Muted>{t('You need an account to flag a dispute, so land officers can follow up with you.')}</Muted>
        <Button title={t('Log In')} onPress={() => router.replace({ pathname: '/login', params: { returnTo: `/dispute?parcelId=${parcelId}` } })} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <Banner tone="success" title={t('Dispute flagged')}>
          {t('Parcel #{id} now shows a dispute warning. A land officer will review it.', { id: parcelId })}
        </Banner>
        <Button
          title={t('Back to Record')}
          onPress={() => router.replace({ pathname: '/parcel/[id]', params: { id: String(parcelId) } })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>{t('Flagging parcel #{id}. Anyone who checks this parcel will see that it is disputed.', { id: parcelId })}</Muted>

      <View style={styles.types} accessibilityRole="radiogroup">
        {TYPES.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setType(option.key)}
            style={[styles.type, type === option.key && styles.typeActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === option.key }}
          >
            <Text style={[styles.typeLabel, type === option.key && styles.typeLabelActive]}>{t(option.label)}</Text>
            <Text style={[styles.typeHint, type === option.key && styles.typeLabelActive]}>{t(option.hint)}</Text>
          </Pressable>
        ))}
      </View>

      <Field
        label={t('What is happening?')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('Describe the problem, who is involved, and when it started')}
        multiline
        numberOfLines={5}
        style={styles.textarea}
        maxLength={2000}
      />

      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title={t('Flag Dispute')} onPress={submit} loading={loading} disabled={description.trim().length < 10} />
      {description.trim().length < 10 && <Muted>{t('Please write at least a sentence so the officer can follow up.')}</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  types: { gap: 8 },
  type: {
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 8,
    padding: 12,
    gap: 4,
    backgroundColor: colors.white,
  },
  typeActive: { backgroundColor: colors.navy },
  typeLabel: { fontSize: 16, fontWeight: '700', color: colors.navy },
  typeHint: { fontSize: 14, color: colors.muted },
  typeLabelActive: { color: colors.white },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    textAlignVertical: 'top',
  },
});
