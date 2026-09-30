import '../src/global.css';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { ToastProvider } from '@/components/ui';

export default function RootLayout() {
  const pathname = usePathname();
  const fullScreenFlow = pathname.startsWith('/auth/') || pathname.startsWith('/create/');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ToastProvider>
        <StatusBar barStyle="dark-content" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(user)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(map)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(marketplace)" />
        </Stack>
        {!fullScreenFlow && <BottomNavigationBar />}
        </ToastProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
