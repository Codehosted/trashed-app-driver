import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '@/types/navigation';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { WalkthroughScreen } from '@/screens/WalkthroughScreen';
import { MapDashboard } from '@/components/MapDashboard';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
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

  // If auth is disabled, go directly to the dashboard (skip walkthrough too)
  if (!isAuthEnabled) {
    return (
      <NavigationContainer onReady={onReady}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={MapDashboard} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Auth enabled - use normal flow
  return (
    <NavigationContainer onReady={onReady}>
      <Stack.Navigator initialRouteName={user ? (needsWalkthrough ? 'Walkthrough' : 'Home') : 'Login'}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Reset" component={ResetPasswordScreen} options={{ headerShown: false }} />
          </>
        ) : needsWalkthrough ? (
          <Stack.Screen name="Walkthrough" component={WalkthroughScreen} options={{ headerShown: false }} />
        ) : (
          <Stack.Screen name="Home" component={MapDashboard} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <AuthProvider>
          <ThemedView>
            <StatusBar style="light" />
            <Navigator />
          </ThemedView>
        </AuthProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}
