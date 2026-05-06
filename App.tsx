import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, View } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '@/types/navigation';
import { SplashScreen } from '@/screens/SplashScreen';
import { WebViewScreen } from '@/screens/WebViewScreen';
import { LoginWebViewScreen } from '@/screens/LoginWebViewScreen';
import { DashboardWebViewScreen } from '@/screens/DashboardWebViewScreen';
import { LoginHtmlViewScreen } from '@/screens/LoginHtmlViewScreen';
import { DashboardHtmlViewScreen } from '@/screens/DashboardHtmlViewScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { NativeLoginScreen } from '@/screens/NativeLoginScreen';
import { NativeRegisterScreen } from '@/screens/NativeRegisterScreen';
import { NativeResetPasswordScreen } from '@/screens/NativeResetPasswordScreen';
import { WalkthroughScreen } from '@/screens/WalkthroughScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { RoutesScreen } from '@/screens/RoutesScreen';
import { RouteDetailScreen } from '@/screens/RouteDetailScreen';
import { OrderDetailScreen } from '@/screens/OrderDetailScreen';
import { MapDashboard } from '@/components/MapDashboard';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DriverLocationProvider } from '@/context/DriverLocationContext';
import { PreferencesProvider, usePreferences } from '@/context/PreferencesContext';
import { ThemedView } from '@/components/ThemedView';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import * as dispatchService from '@/services/dispatch';

const Stack = createNativeStackNavigator<RootStackParamList>();
ExpoSplashScreen.preventAutoHideAsync();

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
      await ExpoSplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) {
    return <View style={{ flex: 1 }} />;
  }

  // Always start with Splash screen - it will navigate to the appropriate screen after animation
  return (
    <NavigationContainer onReady={onReady}>
      <Stack.Navigator initialRouteName="Splash">
        {/* Splash screen - always shown first */}
        <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
        
        {/* Native auth screens - match web app design */}
        {isAuthEnabled && (
          <>
            <Stack.Screen name="NativeLogin" component={NativeLoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="NativeRegister" component={NativeRegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="NativeReset" component={NativeResetPasswordScreen} options={{ headerShown: false }} />
          </>
        )}
        {/* HtmlView screens for backend routes - renders HTML as native views */}
        {isAuthEnabled ? (
          <>
            <Stack.Screen name="DashboardHtmlView" component={DashboardHtmlViewScreen} options={{ headerShown: false }} />
            {/* Keep WebView screens as fallback */}
            <Stack.Screen name="LoginWebView" component={LoginWebViewScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DashboardWebView" component={DashboardWebViewScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LoginHtmlView" component={LoginHtmlViewScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="WebView" component={WebViewScreen} options={{ headerShown: false }} />
        )}
        {/* Keep all existing screens available for navigation */}
        {!isAuthEnabled ? (
          <>
            <Stack.Screen name="RoutesHome" component={RoutesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Home" component={MapDashboard} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            {!user ? (
              <>
                {/* Legacy screens - kept for compatibility */}
                <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Reset" component={ResetPasswordScreen} options={{ headerShown: false }} />
              </>
            ) : (
              <>
                <Stack.Screen name="Walkthrough" component={WalkthroughScreen} options={{ headerShown: false }} />
                <Stack.Screen name="RoutesHome" component={RoutesScreen} options={{ headerShown: false }} />
                <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={{ headerShown: false }} />
                <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ headerShown: false }} />
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
  const { theme, notificationPreferences } = usePreferences();
  const { user, isAuthEnabled } = useAuth();
  const pushRegistration = usePushRegistration(Boolean(user) && notificationPreferences.routeAlerts);

  usePushNotifications();

  useEffect(() => {
    if (!user || !pushRegistration.pushToken || !notificationPreferences.routeAlerts) {
      return;
    }

    dispatchService
      .registerPushToken(pushRegistration.pushToken, notificationPreferences, Platform.OS)
      .catch((error) => {
        console.warn('Failed to register push token', error);
      });
  }, [notificationPreferences, pushRegistration.pushToken, user]);
  
  return (
    <ThemedView>
      {/* Hide status bar for WebView screens */}
      <StatusBar 
        style={theme === 'dark' ? 'light' : 'dark'} 
        hidden={isAuthEnabled}
        translucent={isAuthEnabled}
      />
      <Navigator />
    </ThemedView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <AuthProvider>
          <DriverLocationProvider>
            <AppContent />
          </DriverLocationProvider>
        </AuthProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}
