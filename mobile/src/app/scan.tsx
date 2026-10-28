import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { Banner, Button, Muted, Screen } from '../components/ui';
import { parseParcelQr } from '../utils/qr';
import { useT } from '../i18n';
import { colors } from '../theme';

// Sequence Diagram (Figure 5) steps 2–3: open the camera, decode the QR into
// parcelId + version + signature, then hand off to the ownership record
// screen, which checks the signature on the phone (step 4).
export default function Scan() {
  const { t, rtl } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [notDlovs, setNotDlovs] = useState(false);
  const handled = useRef(false);

  if (!permission) return <Screen />;

  if (!permission.granted) {
    return (
      <Screen>
        <Banner tone="info" title={t('Camera access needed')}>
          {t('DLOVS uses the camera only to read the QR code on a plot marker.')}
        </Banner>
        <Button title={t('Allow Camera')} onPress={requestPermission} />
        <Muted>{t('You can also verify without the camera by searching for the parcel ID.')}</Muted>
        <Button title={t('Search Instead')} variant="secondary" onPress={() => router.replace('/search')} />
      </Screen>
    );
  }

  function onScanned({ data }: BarcodeScanningResult) {
    if (handled.current) return;
    const parsed = parseParcelQr(data);
    if (!parsed) {
      setNotDlovs(true);
      return;
    }
    handled.current = true;
    router.replace({ pathname: '/parcel/[id]', params: { id: parsed.parcelId, v: parsed.version, s: parsed.signature } });
  }

  return (
    <View style={[styles.container, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} accessibilityLabel={t('Point the camera at the QR code on the plot marker')} />
        <View style={styles.footer}>
          {notDlovs ? (
            <Banner tone="warning" title={t('Not a DLOVS code')}>
              {t("This QR code wasn't issued by DLOVS. Do not rely on it as proof of ownership.")}
            </Banner>
          ) : (
            <Text style={styles.hint}>{t('Point the camera at the QR code on the plot marker')}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 16,
  },
  footer: { position: 'absolute', bottom: 32, left: 16, right: 16 },
  hint: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 12,
    borderRadius: 8,
  },
});
