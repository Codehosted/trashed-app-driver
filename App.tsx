import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '@/types/navigation';
import { WebViewScreen } from '@/screens/WebViewScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { WalkthroughScreen } from '@/screens/WalkthroughScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { MapDashboard } from '@/components/MapDashboard';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PreferencesProvider, usePreferences } from '@/context/PreferencesContext';
import { ThemedView } from '@/components/ThemedView';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const Stack = createNativeStackNavigator<RootStackParamList>();
SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { user, loading, needsWalkthrough, isAuthEnabled } = useAuth();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAppReady(true);
    }
  }, [loading]);

  const onReady = useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) {
    return <View style={{ flex: 1 }} />;
  }

  // WebView is now the default view
  return (
    <NavigationContainer onReady={onReady}>
      <Stack.Navigator initialRouteName="WebView">
        <Stack.Screen name="WebView" component={WebViewScreen} options={{ headerShown: false }} />
        {/* Keep all existing screens available for navigation */}
        {!isAuthEnabled ? (
          <>
            <Stack.Screen name="Home" component={MapDashboard} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            {!user ? (
              <>
                <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Reset" component={ResetPasswordScreen} options={{ headerShown: false }} />
              </>
            ) : (
              <>
                <Stack.Screen name="Walkthrough" component={WalkthroughScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Home" component={MapDashboard} options={{ headerShown: false }} />
                <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
              </>
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppContent() {
  const { theme } = usePreferences();
  return (
    <ThemedView>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Navigator />
    </ThemedView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}
