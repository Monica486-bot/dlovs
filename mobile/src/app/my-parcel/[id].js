import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, ApiError } from '../../api/client';
import { Banner, Button, Card, Chips, Field, Muted, Row, Screen, SectionTitle } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { formatBytes, formatDate } from '../../utils/format';
import { colors } from '../../theme';

const MAX_BYTES = 5 * 1024 * 1024; // FR10 / NFR10
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
// The buyer becomes the registered owner, so all four names are needed, as on
// a South Sudanese national ID or passport.
const NAME_PARTS = ['First name', 'Middle name', 'Second middle name', 'Surname'];
const EMPTY_REQUEST = { names: ['', '', '', ''], buyer_national_id: '', buyer_contact: '', notes: '', reason: '', reason_details: '' };

// The owner's view of one of their parcels: FR10 document upload (stored
// encrypted, visible to others only once a land officer verifies it) and the
// "Initiate Transfer Request" use case.
export default function MyParcel() {
  const { id } = useLocalSearchParams();
  const { user, ready, logout } = useAuth();
  const { t } = useT();
  const [parcel, setParcel] = useState(undefined); // undefined = loading, null = not yours
  const [documents, setDocuments] = useState([]);
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [mine, docs, docTypes, myRequests, transferReasons] = await Promise.all([
        api.get('/parcels/mine'),
        api.get(`/parcels/${id}/documents`).catch(() => []),
        api.get('/documents/types'),
        api.get('/transfer-requests', { status: 'all' }),
        api.get('/parcels/transfer-reasons'),
      ]);
      setParcel(mine.parcels.find((p) => String(p.parcel_id) === String(id)) || null);
      setDocuments(docs);
      setTypes(docTypes);
      setReasons(transferReasons);
      setRequests(myRequests.filter((r) => String(r.parcel_id) === String(id)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace({ pathname: '/login', params: { returnTo: `/my-parcel/${id}` } });
        return;
      }
      setError(t(err.message));
    }
  }, [id, logout, t]);

  // wait until the saved login has loaded, or the first request goes out
  // without the token (cold start, or opened from a notification)
  useFocusEffect(useCallback(() => { if (ready && user) load(); }, [ready, user, load]));

  if (ready && !user) {
    return (
      <Screen>
        <Button title={t('Log In')} onPress={() => router.replace({ pathname: '/login', params: { returnTo: `/my-parcel/${id}` } })} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <Banner tone="danger">{error}</Banner>
        <Button title={t('Try Again')} onPress={load} />
      </Screen>
    );
  }
  if (parcel === undefined) return <Screen><ActivityIndicator size="large" color={colors.navy} /></Screen>;
  if (parcel === null) {
    return (
      <Screen>
        <Banner tone="warning">{t('This parcel is not registered to your confirmed national ID.')}</Banner>
        <Button title={t('View Public Record')} variant="secondary" onPress={() => router.replace({ pathname: '/parcel/[id]', params: { id: String(id) } })} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <View style={styles.top}>
          <Text style={styles.title}>{t('Parcel #{id}', { id: parcel.parcel_id })} · {parcel.neighbourhood}</Text>
          <StatusPill status={parcel.status} />
        </View>
        <Row label={t('Registered')} value={formatDate(parcel.registered_date)} />
        {parcel.area_sqm ? <Row label={t('Area')} value={t('{n} m²', { n: Number(parcel.area_sqm) })} /> : null}
        <Row label={t('GPS')} value={`${Number(parcel.gps_lat).toFixed(6)}, ${Number(parcel.gps_lng).toFixed(6)}`} />
        <Button
          title={t('View Public Record')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: String(parcel.parcel_id) } })}
        />
      </Card>

      <SectionTitle>{t('My documents')}</SectionTitle>
      <Muted>{t('A secure copy of your paper documents. Others see a document only after a land officer verifies it.')}</Muted>
      {documents.length === 0 && <Muted>{t('No documents uploaded yet.')}</Muted>}
      {documents.map((d) => (
        <Card key={d.document_id}>
          <View style={styles.top}>
            <Text style={styles.docTitle}>{t(d.document_type || 'Other')}</Text>
            <StatusPill status={d.verification_status} />
          </View>
          <Muted>{d.original_name} · {formatBytes(d.size_bytes)} · {formatDate(d.upload_date)}</Muted>
          {d.verification_status === 'rejected' && d.rejection_reason ? (
            <Banner tone="danger" title={t('Reason')}>{d.rejection_reason}</Banner>
          ) : null}
        </Card>
      ))}
      {parcel.status !== 'deactivated' && <UploadDocument parcelId={parcel.parcel_id} types={types} onUploaded={load} />}

      <SectionTitle>{t('Transfer to a buyer')}</SectionTitle>
      {requests.map((r) => (
        <Card key={r.request_id}>
          <View style={styles.top}>
            <Text style={styles.docTitle}>{t('Request to transfer to {name}', { name: r.buyer_full_name })}</Text>
            <StatusPill status={r.status} />
          </View>
          <Muted>
            {t('Sent {date}', { date: formatDate(r.created_at) })}
            {r.transfer_reason ? ` · ${t(r.transfer_reason)}${r.transfer_reason_details ? ` — ${r.transfer_reason_details}` : ''}` : ''}
          </Muted>
          {r.response_notes ? <Muted>{t('Officer: {notes}', { notes: r.response_notes })}</Muted> : null}
        </Card>
      ))}
      <TransferRequest parcel={parcel} reasons={reasons} pending={requests.some((r) => r.status === 'pending')} onSent={load} />
    </Screen>
  );
}

function UploadDocument({ parcelId, types, onUploaded }) {
  const { t } = useT();
  const [type, setType] = useState('Allocation Letter');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function pick() {
    setError('');
    setDone(false);
    const result = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size > MAX_BYTES) {
      setFile(null);
      setError(t('The file is larger than 5 MB. Scan or photograph it at a lower quality and try again.'));
      return;
    }
    setFile(asset);
  }

  async function upload() {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('document_type', type);
      // the browser preview gives a File; phones give a file URI
      if (Platform.OS === 'web' && file.file) form.append('file', file.file, file.name);
      else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      await api.upload(`/parcels/${parcelId}/documents`, form);
      setFile(null);
      setDone(true);
      onUploaded();
    } catch (err) {
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <Text style={styles.docTitle}>{t('Upload a document')}</Text>
      <Chips label={t('Document type')} options={types.map((k) => ({ key: k, label: t(k) }))} value={type} onChange={setType} />
      <Button title={file ? t('Choose a Different File') : t('Choose File')} variant="secondary" onPress={pick} />
      <Muted>{file ? `${file.name} · ${formatBytes(file.size)}` : t('PDF, JPG or PNG · up to 5 MB')}</Muted>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {done ? <Banner tone="success">{t('Uploaded. A land officer will review it.')}</Banner> : null}
      <Button title={t('Upload')} onPress={upload} loading={loading} disabled={!file} />
    </Card>
  );
}

function TransferRequest({ parcel, reasons, pending, onSent }) {
  const { t } = useT();
  const [form, setForm] = useState(EMPTY_REQUEST);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (key) => (value) => setForm({ ...form, [key]: value });

  if (sent && pending) {
    return (
      <Banner tone="success" title={t('✓ Transfer request sent')}>
        {t('A land officer will contact you and the buyer before transferring.')}
      </Banner>
    );
  }
  if (parcel.status !== 'active') {
    return <Muted>{t('This parcel is {status} and cannot be transferred until a land officer resolves it.', { status: t(parcel.status) })}</Muted>;
  }
  if (pending) {
    return <Muted>{t('Waiting for a land officer, who will contact you and the buyer.')}</Muted>;
  }

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await api.post(`/parcels/${parcel.parcel_id}/transfer-requests`, {
        buyer_full_name: form.names.map((n) => n.trim()).join(' '),
        buyer_national_id: form.buyer_national_id.trim(),
        buyer_contact: form.buyer_contact.trim() || undefined,
        notes: form.notes.trim() || undefined,
        reason: form.reason,
        reason_details: form.reason === 'Other' ? form.reason_details.trim() : undefined,
      });
      setForm(EMPTY_REQUEST);
      setSent(true);
      onSent();
    } catch (err) {
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <Muted>{t('Ask a land officer to transfer this parcel. Ownership changes only after the officer has checked both of you.')}</Muted>
      <Text style={styles.docTitle}>{t("Buyer's full name")}</Text>
      <Muted>{t('As on the national ID or passport.')}</Muted>
      {NAME_PARTS.map((label, i) => (
        <Field
          key={label}
          label={t(label)}
          value={form.names[i]}
          onChangeText={(value) => setForm({ ...form, names: form.names.map((n, j) => (j === i ? value : n)) })}
          autoCapitalize="words"
        />
      ))}
      <Field label={t("Buyer's national ID")} value={form.buyer_national_id} onChangeText={set('buyer_national_id')} autoCapitalize="characters" />
      <Field label={t("Buyer's phone (optional)")} value={form.buyer_contact} onChangeText={set('buyer_contact')} keyboardType="phone-pad" placeholder="+211900000000" />
      <Text style={styles.docTitle}>{t('Reason for transfer')}</Text>
      <Chips
        label={t('Reason for transfer')}
        options={reasons.map((r) => ({ key: r, label: t(r) }))}
        value={form.reason}
        onChange={(reason) => setForm({ ...form, reason })}
      />
      {form.reason === 'Other' && (
        <Field label={t('Describe the reason')} value={form.reason_details} onChangeText={set('reason_details')} />
      )}
      <Field label={t('Notes for the officer (optional)')} value={form.notes} onChangeText={set('notes')} multiline />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button
        title={t('Request Transfer')}
        onPress={submit}
        loading={loading}
        disabled={
          form.names.some((n) => !n.trim()) || !form.buyer_national_id.trim() || !form.reason
          || (form.reason === 'Other' && form.reason_details.trim().length < 3)
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  docTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
});
