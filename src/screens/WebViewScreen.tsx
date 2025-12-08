import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { PhotoPickerModal } from '@/components/PhotoPickerModal';
import { NotesEditorModal } from '@/components/NotesEditorModal';
import { injectedJavaScript } from '@/scripts/webview-injected';

const WEBVIEW_BASE_URL = 'https://trashed.ngrok.app/';

export const WebViewScreen: React.FC = () => {
  const { theme } = usePreferences();
  const { user, isAuthEnabled, loading: authLoading } = useAuth();
  const navigation = useNavigation();
  const palette = designSchema.theme[theme];
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const isDark = theme === 'dark';

  // Redirect to login if auth is required but user is not logged in
  useEffect(() => {
    if (!authLoading && isAuthEnabled && !user) {
      navigation.navigate('Login' as never);
    }
  }, [authLoading, isAuthEnabled, user, navigation]);

  // Construct URL with theme query parameter
  const webViewUrl = useMemo(() => {
    try {
      // Ensure the base URL has a trailing slash for proper URL construction
      const baseUrl = WEBVIEW_BASE_URL.endsWith('/') ? WEBVIEW_BASE_URL : `${WEBVIEW_BASE_URL}/`;
      const url = new URL(baseUrl);
      url.searchParams.set('theme', theme);
      return url.toString();
    } catch (error) {
      console.error('Error constructing WebView URL:', error);
      // Fallback to base URL if construction fails
      return WEBVIEW_BASE_URL;
    }
  }, [theme]);

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    setError(nativeEvent.description || 'Failed to load page');
    setLoading(false);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    webViewRef.current?.reload();
  };

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const rawData = event.nativeEvent.data;
      console.log('[React Native] Received message from WebView:', rawData);
      const message = JSON.parse(rawData);
      console.log('[React Native] Parsed message:', message);
      
      if (message.action === 'openPhotoPicker') {
        console.log('[React Native] Opening photo picker');
        setShowPhotoPicker(true);
      } else if (message.action === 'openNotesEditor') {
        console.log('[React Native] Opening notes editor');
        setShowNotesEditor(true);
      } else if (message.action === 'openProfile') {
        console.log('[React Native] Opening profile screen');
        navigation.navigate('Profile' as never);
      }
    } catch (err) {
      console.error('[React Native] Error parsing WebView message:', err, event.nativeEvent.data);
    }
  };

  const handlePhotosChange = (photos: string[]) => {
    setSelectedPhotos(photos);
  };

  const handleSavePhotos = (photos: string[]) => {
    // TODO: Upload photos to your backend API
    // For now, just send them back to the WebView
    if (photos.length > 0) {
      const message = JSON.stringify({
        type: 'photosSelected',
        photos: photos,
      });
      webViewRef.current?.postMessage(message);
    }
    setSelectedPhotos([]);
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
  };

  const handleSaveNotes = (savedNotes: string) => {
    // TODO: Save notes to your backend API
    // For now, just send them back to the WebView
    if (savedNotes.trim()) {
      const message = JSON.stringify({
        type: 'notesSaved',
        notes: savedNotes.trim(),
      });
      webViewRef.current?.postMessage(message);
    }
    setNotes('');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: palette.background }]}>
          <Ionicons name="alert-circle" size={64} color={palette.danger} />
          <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to Load Page</Text>
          <Text style={[styles.errorMessage, { color: palette.subtleText }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: palette.accent }]}
            onPress={handleRetry}
          >
            <Ionicons name="refresh" size={20} color="#ffffff" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={palette.accent} />
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={styles.webview}
            key={webViewUrl}
            onLoadStart={() => {
              setLoading(true);
              setError(null);
            }}
            onLoadEnd={() => {
              setLoading(false);
              // Inject JavaScript after page loads
              setTimeout(() => {
                webViewRef.current?.injectJavaScript(injectedJavaScript);
              }, 500);
            }}
            onError={handleError}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              if (nativeEvent.statusCode >= 400) {
                setError(`HTTP Error ${nativeEvent.statusCode}: Failed to load page`);
                setLoading(false);
              }
            }}
            onMessage={handleMessage}
            injectedJavaScript={injectedJavaScript}
            // Enable JavaScript
            javaScriptEnabled={true}
            // Enable DOM storage
            domStorageEnabled={true}
            // Enable debugging (useful for development)
            startInLoadingState={true}
            // Allow navigation to other URLs
            allowsBackForwardNavigationGestures={true}
            // Shared cookies
            sharedCookiesEnabled={true}
            // Allow inline media playback
            allowsInlineMediaPlayback={true}
            // Media playback requires user action
            mediaPlaybackRequiresUserAction={false}
          />
        </>
      )}

      <PhotoPickerModal
        visible={showPhotoPicker}
        isDark={isDark}
        selectedPhotos={selectedPhotos}
        onClose={() => {
          setShowPhotoPicker(false);
          setSelectedPhotos([]);
        }}
        onPhotosChange={handlePhotosChange}
        onSave={handleSavePhotos}
      />

      <NotesEditorModal
        visible={showNotesEditor}
        isDark={isDark}
        notes={notes}
        onClose={() => {
          setShowNotesEditor(false);
          setNotes('');
        }}
        onNotesChange={handleNotesChange}
        onSave={handleSaveNotes}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginHorizontal: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
