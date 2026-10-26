import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { api, NetworkError } from '../../api/client';
import { Banner, Button, Card, Chips, Empty, Field, List, ListItem, Muted, Screen } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import ReportPlotButton from '../../components/ReportPlotButton';
import { useT } from '../../i18n';
import { getDeviceLocation } from '../../utils/location';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme';

// Verification pathways 2–3 (FR06): parcel ID, and owner name / neighbourhood /
// GPS location. (Pathway 1, the QR code, is Scan. Pathway 4, national ID, is
// for land officers only, since a national ID is private.)
const MODES = [
  { key: 'any', label: 'Any', icon: 'search', placeholder: 'Parcel ID, owner name, or area' },
  { key: 'parcel_id', label: 'Parcel ID', icon: 'pricetag', placeholder: 'e.g. 12', keyboard: 'number-pad' },
  { key: 'owner_name', label: 'Owner', icon: 'person', placeholder: 'e.g. Akoi Deng' },
  { key: 'neighbourhood', label: 'Area', icon: 'business', placeholder: 'e.g. Munuki' },
  { key: 'near', label: 'Near me', icon: 'locate' },
];
const RADII = [50, 100, 200, 500];

// FR17 filters, applied to the results on the phone (same as the web app)
const NO_FILTERS = { status: '', documents: '', from: '', to: '' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function applyFilters(results, filters) {
  return results.filter((p) => {
    if (filters.status && p.status !== filters.status) return false;
    const registered = String(p.registered_date).slice(0, 10);
    if (DATE.test(filters.from) && registered < filters.from) return false;
    if (DATE.test(filters.to) && registered > filters.to) return false;
    if (filters.documents === 'verified' && !(p.verified_documents > 0)) return false;
    if (filters.documents === 'pending' && !(p.pending_documents > 0)) return false;
    if (filters.documents === 'none' && p.verified_documents > 0) return false;
    return true;
  });
}

export default function Search() {
  const { t } = useT();
  const [mode, setMode] = useState('any');
  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState(200);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);

  const current = MODES.find((m) => m.key === mode);
  const near = mode === 'near';

  async function search() {
    if (!near && !query.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (near) {
        const position = await getDeviceLocation();
        if (!position) {
          setResults(null);
          setError(t('Could not get your location. Allow location access and try again outdoors.'));
          return;
        }
        setResults(await api.get('/parcels/search', { by: 'near', lat: position.lat, lng: position.lng, radius }));
      } else {
        setResults(await api.get('/parcels/search', { query: query.trim(), by: mode }));
      }
    } catch (err) {
      setResults(null);
      setError(
        err instanceof NetworkError
          ? t('Could not reach the DLOVS server. Records you viewed before are under Saved.')
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  const shown = results ? applyFilters(results, filters) : null;
  const filtersOn = Object.values(filters).some(Boolean);
  const setFilter = (key) => (value) => setFilters({ ...filters, [key]: value });

  return (
    <Screen>
      <Chips
        label={t('Search by')}
        options={MODES.map((m) => ({ key: m.key, label: t(m.label), icon: m.icon }))}
        value={mode}
        onChange={(key) => { setMode(key); setResults(null); setError(''); }}
      />

      {near ? (
        <>
          <Muted>{t('Find registered parcels around where you are standing.')}</Muted>
          <Chips
            label={t('Distance')}
            options={RADII.map((r) => ({ key: r, label: t('Within {n} m', { n: r }) }))}
            value={radius}
            onChange={setRadius}
          />
          <Button title={t('Search Near Me')} icon="locate" onPress={search} loading={loading} />
        </>
      ) : (
        <>
          <Field
            label={mode === 'any' ? t('Search the register') : t('Search by {what}', { what: t(current.label) })}
            value={query}
            onChangeText={setQuery}
            placeholder={t(current.placeholder)}
            keyboardType={current.keyboard || 'default'}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <Button title={t('Search')} icon="search" onPress={search} loading={loading} disabled={!query.trim()} />
        </>
      )}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {results && results.length > 0 && (
        <Button
          title={showFilters ? t('Hide Filters') : filtersOn ? t('Filters (on)') : t('Filter Results')}
          variant="ghost"
          icon="options"
          onPress={() => setShowFilters(!showFilters)}
        />
      )}
      {results && results.length > 0 && showFilters && (
        <Card>
          <Text style={styles.filterLabel}>{t('Status')}</Text>
          <Chips
            label={t('Status')}
            options={[
              { key: '', label: t('Any') },
              { key: 'active', label: t('Active') },
              { key: 'disputed', label: t('Disputed') },
              { key: 'deactivated', label: t('Deactivated') },
            ]}
            value={filters.status}
            onChange={setFilter('status')}
          />
          <Text style={styles.filterLabel}>{t('Documents')}</Text>
          <Chips
            label={t('Documents')}
            options={[
              { key: '', label: t('Any') },
              { key: 'verified', label: t('Has verified documents') },
              { key: 'pending', label: t('Awaiting review') },
              { key: 'none', label: t('No verified documents') },
            ]}
            value={filters.documents}
            onChange={setFilter('documents')}
          />
          <Field label={t('Registered from (YYYY-MM-DD)')} value={filters.from} onChangeText={setFilter('from')} placeholder="2026-01-01" keyboardType="numbers-and-punctuation" />
          <Field label={t('Registered until (YYYY-MM-DD)')} value={filters.to} onChangeText={setFilter('to')} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" />
          {filtersOn && <Button title={t('Clear Filters')} variant="secondary" onPress={() => setFilters(NO_FILTERS)} />}
        </Card>
      )}

      {results && results.length === 0 && (
        <>
          <Banner tone="warning" title={t('This parcel is not registered in DLOVS. Proceed with caution.')}>
            {near
              ? t("No registered parcel within {n} m. Check any seller's documents with the land office before paying.", { n: radius })
              : t("Check the seller's documents with the land office before paying.")}
          </Banner>
          <ReportPlotButton />
        </>
      )}
      {results && results.length > 0 && shown.length === 0 && <Muted>{t('No results match these filters.')}</Muted>}
      {shown && shown.length > 0 && filtersOn && <Muted>{t('Showing {n} of {total} results', { n: shown.length, total: results.length })}</Muted>}

      {!results && !error && !loading && (
        <Empty icon="document-text" title={t('Check any plot in Juba')}>
          {t('Search by parcel ID, owner or neighbourhood, or find registered parcels near you.')}
        </Empty>
      )}

      {shown && shown.length > 0 && (
        <List>
          {shown.map((p) => (
            <ListItem
              key={p.parcel_id}
              icon="map"
              title={`${t('Parcel #{id}', { id: p.parcel_id })} · ${p.neighbourhood}`}
              subtitle={`${p.owner_name} · ${p.distance_m != null ? t('{n} m away', { n: p.distance_m }) : t('Registered {date}', { date: formatDate(p.registered_date) })}`}
              right={<StatusPill status={p.status} />}
              onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: String(p.parcel_id) } })}
              accessibilityLabel={t('Parcel {id}, {area}, owned by {name}', { id: p.parcel_id, area: p.neighbourhood, name: p.owner_name })}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
});
