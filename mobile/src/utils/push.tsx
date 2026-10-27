import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type { NotificationResponse } from 'expo-notifications';

// FR15: Expo Go has no push module, so it's only loaded in the installed app
// 'storeClient' is Expo Go (and expo-dev-client builds); the APK is 'standalone'
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;

// expo-notifications, or null where push isn't available
function notifications(): NotificationsModule | null {
  if (Platform.OS === 'web' || inExpoGo) return null;
  if (!Notifications) {
    const N = require('expo-notifications') as NotificationsModule;
    Notifications = N;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return Notifications;
}

export async function getPushToken(): Promise<string | null> {
  const N = notifications();
  if (!N || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'DLOVS alerts',
        importance: N.AndroidImportance.HIGH,
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return null;
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    return null; // push is optional, never block the user
  }
}

// Calls open(link) when the user taps a push notification, including the one
// that launched the app. Returns an unsubscribe function.
export function onNotificationTap(open: (link: unknown) => void): () => void {
  const N = notifications();
  if (!N) return () => {};
  const handle = (response: NotificationResponse | null) => open(response?.notification?.request?.content?.data?.link);
  N.getLastNotificationResponseAsync()
    .then((response) => { if (response) handle(response); })
    .catch(() => {});
  const subscription = N.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}

// The API's notification links are web-app paths; map them to app screens.
export function screenForLink(link: unknown): string {
  if (typeof link !== 'string') return '/notifications';
  let match = link.match(/^\/my\/parcels\/(\d+)/);
  if (match) return `/my-parcel/${match[1]}`;
  match = link.match(/^\/(?:verify|parcels)\/(\d+)/);
  if (match) return `/parcel/${match[1]}`;
  if (link === '/my' || link.startsWith('/my/requests')) return '/mine';
  return '/notifications';
}
