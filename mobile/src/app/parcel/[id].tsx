import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError, errorMessage, NetworkError } from '../../api/client';
import { Banner, Button, Card, List, ListItem, Muted, Row, Screen, SectionTitle } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import ReportPlotButton from '../../components/ReportPlotButton';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { cacheRecord, getCachedRecord } from '../../utils/cache';
import { getDeviceLocation, GPS_THRESHOLD_METRES, haversineMetres } from '../../utils/location';
import type { DeviceLocation } from '../../utils/location';
import { formatDate, formatDateTime } from '../../utils/format';
import { colors } from '../../theme';
import type { ParcelVerification, VerifiedParcel } from '../../types';

type LoadState = 'loading' | 'live' | 'cached' | 'not_found' | 'invalid_qr' | 'error';

type LocationState = { status: 'checking' } | { status: 'unavailable' } | ({ status: 'ok' } & DeviceLocation);

// Sequence Diagram (Figure 5) steps 4–12, plus the offline fallback (FR16).
export default function ParcelRecord() {
  const { id, s: signature } = useLocalSearchParams<{ id: string; s?: string }>();
  const { user } = useAuth();
  const { t, tn } = useT();

  // state: loading | live | cached | not_found | invalid_qr | error
  const [state, setState] = useState<LoadState>('loading');
  const [record, setRecord] = useState<ParcelVerification | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [location, setLocation] = useState<LocationState>({ status: 'checking' });

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await api.get<ParcelVerification>(`/parcels/${id}/verify`, { signature });
      setRecord(data);
      setCachedAt(null);
      setState('live');
      cacheRecord(id, data);
    } catch (err) {
      if (err instanceof NetworkError) {
        const cached = await getCachedRecord(id);
        if (cached) {
          setRecord(cached.record);
          setCachedAt(cached.cachedAt);
          setState('cached');
        } else {
          setMessage(t(err.message));
          setState('error');
        }
      } else if (err instanceof ApiError && err.status === 404) {
        setState('not_found');
      } else if (err instanceof ApiError && err.code === 'QR_INVALID') {
        setState('invalid_qr');
      } else {
        setMessage(errorMessage(err));
        setState('error');
      }
    }
  }, [id, signature, t]);

  useEffect(() => {
    load();
  }, [load]);

  // FR04 location check. It runs alongside the record fetch so it never slows
  // the verification result down.
  useEffect(() => {
    let cancelled = false;
    getDeviceLocation().then((position) => {
      if (!cancelled) setLocation(position ? { status: 'ok', ...position } : { status: 'unavailable' });
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Muted>{t('Checking the DLOVS register…')}</Muted>
        </View>
      </Screen>
    );
  }

  if (state === 'invalid_qr') {
    return (
      <Screen>
        <Banner tone="danger" title={t('This QR code is not genuine')}>
          {t('This code does not match parcel #{id} and may be forged. Do not pay until a land officer has checked it.', { id })}
        </Banner>
        <Button title={t('Search the register instead')} variant="secondary" onPress={() => router.replace('/search')} />
      </Screen>
    );
  }

  if (state === 'not_found') {
    return (
      <Screen>
        <Banner tone="warning" title={t('This parcel is not registered in DLOVS. Proceed with caution.')}>
          {t("No record exists for parcel #{id}. Check the seller's documents with the land office before paying.", { id })}
        </Banner>
        <ReportPlotButton />
        <Button title={t('Search the register')} variant="secondary" onPress={() => router.replace('/search')} />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen>
        <Banner tone="danger" title={t('Could not load this record')}>
          {message}
        </Banner>
        <Button title={t('Try Again')} onPress={load} />
      </Screen>
    );
  }

  const { parcel, ownership_history: history, disputes, documents, qr_check: qrCheck, qr_issued_at: qrIssuedAt } = record!; // set whenever state is live or cached
  const openDisputes = disputes.filter((d) => d.status !== 'resolved');
  const verifiedDocs = documents.filter((d) => d.verification_status === 'verified').length;
  const disputeTypes = [...new Set(openDisputes.map((d) => t(d.dispute_type === 'boundary' ? 'boundary' : 'ownership')))].join(t(' and '));

  return (
    <Screen>
      {state === 'cached' && (
        <Banner tone="warning" title={t('Offline: this is a saved copy, not a live record')}>
          {t('Last checked {time}. Ownership may have changed, so check again online before paying.', { time: formatDateTime(cachedAt) })}
        </Banner>
      )}
      {state === 'live' && qrCheck === 'valid' && (
        <Banner tone="success" title={t('Genuine DLOVS QR code')}>
          {t("This marker's code matches the one issued for parcel #{id}.", { id: parcel.parcel_id })}
        </Banner>
      )}
      {qrCheck === 'superseded' && (
        <Banner tone="danger" title={t('This QR code has been replaced')}>
          {t('Ownership changed on {date}. Whoever shows this old marker may no longer own the plot. The current owner is shown below.', { date: formatDate(qrIssuedAt) })}
        </Banner>
      )}
      {parcel.status === 'deactivated' && (
        <Banner tone="danger" title={t('Record deactivated')}>
          {t('Deactivated as fraudulent. Do not proceed with any sale.')}
        </Banner>
      )}
      {openDisputes.length > 0 && (
        <Banner tone="warning" title={tn('Disputed: {n} open dispute', 'Disputed: {n} open disputes', openDisputes.length)}>
          {t('The {types} of this parcel is contested. Do not pay until a land officer resolves it.', { types: disputeTypes })}
        </Banner>
      )}

      <Card padded={false} style={styles.recordCard}>
        <View style={[styles.stripe, { backgroundColor: STRIPE[parcel.status] || colors.navy }]} />
        <View style={styles.recordBody}>
          <View style={styles.headerRow}>
            <Text style={styles.parcelId}>{t('Parcel #{id}', { id: parcel.parcel_id })}</Text>
            <StatusPill status={parcel.status} />
          </View>
          <Text style={styles.ownerLabel}>{t('Registered owner')}</Text>
          <Text style={styles.ownerName} selectable>{parcel.owner_name}</Text>
          <View style={styles.facts}>
            <Row icon="business-outline" label={t('Neighbourhood')} value={parcel.neighbourhood} />
            <Row icon="calendar-outline" label={t('Registered')} value={formatDate(parcel.registered_date)} />
            {parcel.area_sqm ? <Row icon="resize-outline" label={t('Area')} value={t('{n} m²', { n: Number(parcel.area_sqm) })} /> : null}
            <Row icon="location-outline" label={t('GPS')} value={`${Number(parcel.gps_lat).toFixed(5)}, ${Number(parcel.gps_lng).toFixed(5)}`} />
            <Row
              icon="document-text-outline"
              label={t('Documents verified')}
              value={documents.length === 0 ? t('None uploaded') : t('{n} of {total}', { n: verifiedDocs, total: documents.length })}
            />
          </View>
        </View>
        {state === 'live' && parcel.current_owner_id ? (
          <ListItem
            icon="albums"
            title={t('All parcels owned by {name}', { name: parcel.owner_name })}
            onPress={() => router.push({ pathname: '/owner/[id]', params: { id: String(parcel.current_owner_id) } })}
          />
        ) : null}
      </Card>

      <LocationCheck location={location} parcel={parcel} />

      <SectionTitle>{t('Ownership history')}</SectionTitle>
      <Card>
        {history.length === 0 ? (
          <Muted>{t('No history recorded.')}</Muted>
        ) : (
          [...history].reverse().map((h, i, all) => (
            <View key={h.history_id} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.dot, i === 0 && styles.dotCurrent]} />
                {i < all.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>
                  {h.previous_owner_name
                    ? t('{from} → {to}', { from: h.previous_owner_name, to: h.new_owner_name })
                    : t('Registered to {name}', { name: h.new_owner_name })}
                </Text>
                <Muted>
                  {formatDate(h.transfer_date)}
                  {h.transfer_reason
                    ? ` · ${t(h.transfer_reason)}${h.transfer_reason_details ? `: ${h.transfer_reason_details}` : ''}`
                    : ''}
                </Muted>
              </View>
            </View>
          ))
        )}
      </Card>

      <SectionTitle>{t('Documents')}</SectionTitle>
      {documents.length === 0 ? (
        <Card><Muted>{t('No documents on file.')}</Muted></Card>
      ) : (
        <List>
          {documents.map((d) => (
            <ListItem
              key={d.document_id}
              icon="document-text"
              title={t(d.document_type || 'Other')}
              subtitle={formatDate(d.upload_date)}
              right={<StatusPill status={d.verification_status} />}
            />
          ))}
        </List>
      )}

      <SectionTitle>{t('Disputes')}</SectionTitle>
      {disputes.length === 0 ? (
        <Card><Muted>{t('No disputes on record.')}</Muted></Card>
      ) : (
        <List>
          {disputes.map((d) => (
            <ListItem
              key={d.dispute_id}
              icon={d.status === 'resolved' ? 'checkmark-done' : 'alert-circle'}
              iconColor={d.status === 'resolved' ? colors.success : colors.warning}
              iconBg={d.status === 'resolved' ? colors.successPale : colors.warningPale}
              title={t('{type} dispute: {status}', {
                type: t(d.dispute_type === 'boundary' ? 'Boundary' : 'Ownership'),
                status: t(d.status === 'resolved' ? 'resolved' : d.status === 'under_review' ? 'under review' : 'open'),
              })}
              subtitle={formatDate(d.created_at)}
            />
          ))}
        </List>
      )}

      {state === 'cached' && <Button title={t('Check Again Online')} icon="refresh" onPress={load} />}

      {state === 'live' && parcel.status !== 'deactivated' && (
        user?.role === 'citizen' ? (
          <Button
            title={t('Flag a Dispute on This Parcel')}
            icon="flag"
            variant="ghost"
            onPress={() => router.push({ pathname: '/dispute', params: { parcelId: String(parcel.parcel_id) } })}
          />
        ) : !user ? (
          <Button
            title={t('Log In to Flag a Dispute')}
            icon="flag"
            variant="ghost"
            onPress={() => router.push({ pathname: '/login', params: { returnTo: `/parcel/${parcel.parcel_id}` } })}
          />
        ) : null
      )}
    </Screen>
  );
}

// FR04: the badge only appears when the phone's own GPS accuracy is within
// 10 m AND it is within 10 m of the registered point.
interface LocationCheckProps {
  location: LocationState;
  parcel: VerifiedParcel;
}

function LocationCheck({ location, parcel }: LocationCheckProps) {
  const { t } = useT();
  if (location.status === 'checking') {
    return <Muted>{t('Checking your location…')}</Muted>;
  }
  if (location.status === 'unavailable') {
    return <Muted>{t("Location unavailable. The record is valid, but your position can't be confirmed.")}</Muted>;
  }
  const distance = haversineMetres(location.lat, location.lng, Number(parcel.gps_lat), Number(parcel.gps_lng));
  const rounded = Math.round(distance);
  // unknown accuracy can't prove the 10 m threshold, so no badge
  if (location.accuracy === null) {
    return (
      <Banner tone="warning" title={t('Location accuracy is low - verify parcel boundaries manually.')}>
        {t("Your phone didn't report how accurate its position is ({distance} m from the registered point). Move to open sky and try again.", { distance: rounded })}
      </Banner>
    );
  }
  if (location.accuracy > GPS_THRESHOLD_METRES) {
    return (
      <Banner tone="warning" title={t('Location accuracy is low - verify parcel boundaries manually.')}>
        {t("Your position is accurate to about {accuracy} m ({distance} m from the registered point). Move to open sky and try again.", { accuracy: Math.round(location.accuracy), distance: rounded })}
      </Banner>
    );
  }
  if (distance <= GPS_THRESHOLD_METRES) {
    return (
      <Banner tone="success" title={t('✓ Location confirmed')}>
        {t("You are {distance} m from this parcel's registered GPS point.", { distance: rounded })}
      </Banner>
    );
  }
  return (
    <Banner tone="warning" title={t('You are not at the registered location')}>
      {t('You are about {distance} m from the registered point. Make sure this is the plot in the record.', { distance: rounded })}
    </Banner>
  );
}

// the record card's top stripe shows its status at a glance
const STRIPE: Record<string, string> = { active: colors.success, disputed: colors.warning, deactivated: colors.danger };

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  recordCard: { overflow: 'hidden' },
  stripe: { height: 5 },
  recordBody: { padding: 18, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  parcelId: { fontSize: 14, fontWeight: '700', color: colors.muted },
  ownerLabel: { fontSize: 13, color: colors.muted, marginTop: 6 },
  ownerName: { fontSize: 24, fontWeight: '800', color: colors.navy, lineHeight: 30 },
  facts: { gap: 8, marginTop: 8 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border, marginTop: 4 },
  dotCurrent: { backgroundColor: colors.navy },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepText: { flex: 1, gap: 2, paddingBottom: 14 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
});
