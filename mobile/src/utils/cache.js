// Offline cache (FR16 / NFR09): keeps the last 50 viewed parcel records on the
// device so a verification can still be shown without a connection — always
// labelled as cached, with the time it was last verified online.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dlovs_parcel_cache_v1';
const MAX_RECORDS = 50;

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

// Most recently viewed first.
export async function listCachedRecords() {
  return readAll();
}

export async function getCachedRecord(parcelId) {
  const all = await readAll();
  return all.find((entry) => String(entry.parcelId) === String(parcelId)) || null;
}

export async function cacheRecord(parcelId, record) {
  const all = await readAll();
  const rest = all.filter((entry) => String(entry.parcelId) !== String(parcelId));
  const next = [{ parcelId: String(parcelId), cachedAt: new Date().toISOString(), record }, ...rest].slice(0, MAX_RECORDS);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    // cache is best-effort; a full device shouldn't break verification
  }
}
