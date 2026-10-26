import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider, useT } from '../i18n';
import LanguageToggle from '../components/LanguageToggle';
import { onNotificationTap, screenForLink } from '../utils/push';
import { colors } from '../theme';

// The tabs (Home, Search, Saved, Account) live in (tabs)/; everything else
// opens on top of them with a back button.
function AppStack() {
  const { t } = useT();
  // FR15: tapping a push notification opens the screen it is about
  useEffect(() => onNotificationTap((link) => router.push(screenForLink(link))), []);
  const screens = [
    ['scan', 'Scan Parcel QR'],
    ['parcel/[id]', 'Ownership Record'],
    ['owner/[id]', 'Owner Portfolio'],
    ['mine', 'My Parcels'],
    ['my-parcel/[id]', 'My Parcel'],
    ['dispute', 'Flag a Dispute'],
    ['report-plot', 'Report a Plot'],
    ['notifications', 'Notifications'],
    ['login', 'Log In'],
    ['register', 'Create Account'],
    ['verify-phone', 'Confirm Phone'],
    ['forgot-password', 'Reset Password'],
  ];
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerRight: () => <LanguageToggle />,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {screens.map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title: t(title) }} />
      ))}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppStack />
      </AuthProvider>
    </LanguageProvider>
  );
}
