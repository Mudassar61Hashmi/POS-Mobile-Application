import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="customers" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="orders"    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings"  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="taxes"     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="users"     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="coupons"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="payments"    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="datamanager" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="modal"     options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </AuthProvider>
  );
}
