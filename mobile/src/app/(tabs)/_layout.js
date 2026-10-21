import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import LanguageToggle from '../../components/LanguageToggle';
import { colors } from '../../theme';

// The app's four main places, in a bottom tab bar
const TABS = [
  ['index', 'Home', 'home'],
  ['search', 'Search', 'search'],
  ['recent', 'Saved', 'bookmark'],
  ['account', 'Account', 'person-circle'],
];

export default function TabsLayout() {
  const { t, rtl } = useT();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerRight: () => <LanguageToggle />,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.faint,
        // the navigator adds the phone's safe area below this height
        tabBarStyle: { borderTopColor: colors.border, height: 64, direction: rtl ? 'rtl' : 'ltr' },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(title),
            // the home screen draws its own navy header
            headerShown: name !== 'index',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? icon : `${icon}-outline`} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
