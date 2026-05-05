import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemedView } from '@/components/ThemedView';
import { APP_CONFIG } from '@/constants';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;


export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, loading, isAuthEnabled } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const API_BASE_URL = APP_CONFIG.apiBaseUrl;

  // Construct URL for the splash page
  const splashUrl = `${API_BASE_URL}/splash`;

  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'SPLASH_COMPLETE') {
        // Navigate to appropriate screen after animation
        const canOpenNativeDispatch =
          user?.roles?.includes('driver') || user?.vendorPermissions?.driver === true;

        if (!isAuthEnabled) {
          navigation.replace('RoutesHome');
        } else if (!loading && !user) {
          navigation.replace('NativeLogin');
        } else if (canOpenNativeDispatch) {
          navigation.replace('RoutesHome');
        } else {
          navigation.replace('DashboardWebView');
        }
      }
    } catch (error) {
      console.error('Error parsing splash message:', error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: splashUrl }}
        style={styles.webView}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
