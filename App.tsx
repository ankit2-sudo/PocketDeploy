import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from './src/store/appStore';

// ── Screens ──────────────────────────────────────────────
import SplashScreen from './src/screens/SplashScreen';
import SetupScreen from './src/screens/SetupScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AddAppScreen from './src/screens/AddAppScreen';
import AppDetailScreen from './src/screens/AppDetailScreen';
import LogViewerScreen from './src/screens/LogViewerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Suppress non-critical warnings in dev
LogBox.ignoreLogs(['Non-serializable values']);

// ── Navigation Types ─────────────────────────────────────
export type RootStackParamList = {
  Splash: undefined;
  Setup: undefined;
  Dashboard: undefined;
  AddApp: undefined;
  AppDetail: { appId: string };
  LogViewer: { appId: string; appName: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── Dark theme for navigation ────────────────────────────
const DarkTheme = {
  dark: true,
  colors: {
    primary: '#6366f1',
    background: '#0a0a0a',
    card: '#0a0a0a',
    text: '#ffffff',
    border: '#2a2a2a',
    notification: '#6366f1',
  },
};

export default function App() {
  const init = useAppStore(s => s.init);

  // Initialize WebSocket connection and listeners on app start
  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: '#0a0a0a' },
          }}
        >
          {/* ── Auth / Setup Flow ──────────────────────── */}
          <Stack.Screen
            name="Splash"
            component={SplashScreen}
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="Setup"
            component={SetupScreen}
            options={{ animation: 'fade', gestureEnabled: false }}
          />

          {/* ── Main App ───────────────────────────────── */}
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen
            name="AddApp"
            component={AddAppScreen}
          />
          <Stack.Screen
            name="AppDetail"
            component={AppDetailScreen}
          />
          <Stack.Screen
            name="LogViewer"
            component={LogViewerScreen}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
