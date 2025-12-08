import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { PhotoPickerModal } from '@/components/PhotoPickerModal';
import { NotesEditorModal } from '@/components/NotesEditorModal';
import { createApiInterceptionScript } from '@/scripts/api-interception';
import { injectedJavaScript as webviewInjectedScript } from '@/scripts/webview-injected';
import Constants from 'expo-constants';

const SESSION_COOKIE_KEY = 'nextauth_session_cookie';
const CSRF_TOKEN_KEY = 'nextauth_csrf_token';

interface ApiWebViewProps {
  route: string; // e.g., 'login', 'dashboard', 'vendor/dashboard'
  baseUrl?: string; // Optional: override base URL (defaults to webAppUrl for app routes, apiBaseUrl for auth routes)
  onApiResponse?: (endpoint: string, response: any, status: number) => void;
  onNavigationChange?: (url: string) => void;
}

/**
 * Get backend API base URL from config or use default
 */
const getApiBaseUrl = (): string => {
  const apiUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (apiUrl) return apiUrl;
  return 'https://trashed.ngrok.app';
};

/**
 * Get web app URL from config or use default
 */
const getWebAppUrl = (): string => {
  const webAppUrl = Constants.expoConfig?.extra?.webAppUrl;
  if (webAppUrl) return webAppUrl;
  return 'https://trashed-app-driver.vercel.app/';
};

export const ApiWebView: React.FC<ApiWebViewProps> = ({ 
  route,
  baseUrl,
  onApiResponse,
  onNavigationChange 
}) => {
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

  const API_BASE_URL = getApiBaseUrl();
  const WEB_APP_URL = getWebAppUrl();
  
  // Always use webAppUrl for the WebView (since we handle auth screens natively)
  // Only use provided baseUrl override if specified
  const BASE_URL = baseUrl || WEB_APP_URL;

  // Get session cookie for WebView headers
  const [sessionCookie, setSessionCookie] = useState<string | null>(null);

  // Load session cookie from AsyncStorage
  useEffect(() => {
    const loadCookie = async () => {
      try {
        const cookie = await AsyncStorage.getItem(SESSION_COOKIE_KEY);
        setSessionCookie(cookie);
      } catch (error) {
        console.error('[ApiWebView] Error loading session cookie:', error);
      }
    };
    loadCookie();
  }, []);

  // Construct URL for the specific route with headers if authenticated
  const webViewSource = useMemo(() => {
    try {
      // If route is empty, just use the base URL
      const finalUrl = route 
        ? new URL(route, BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`)
        : new URL(BASE_URL);
      
      // Only add theme param if route is not empty (to avoid breaking base URL)
      if (route) {
        finalUrl.searchParams.set('theme', theme);
      }
      
      // Include cookies in headers if available (for authenticated requests)
      if (sessionCookie) {
        return {
          uri: finalUrl.toString(),
          headers: {
            'Cookie': sessionCookie,
          },
        };
      }
      
      return { uri: finalUrl.toString() };
    } catch (error) {
      console.error('Error constructing WebView URL:', error);
      // Fallback: if route is empty, use BASE_URL directly
      return { uri: route ? `${BASE_URL}/${route}` : BASE_URL };
    }
  }, [route, theme, BASE_URL, sessionCookie]);

  // Redirect to native login if auth is required but user is not logged in
  // This component should only be used when user is authenticated
  useEffect(() => {
    if (!authLoading && isAuthEnabled && !user) {
      navigation.navigate('NativeLogin' as never);
    }
  }, [authLoading, isAuthEnabled, user, navigation]);

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

  // Handle messages from WebView (including API responses)
  const handleMessage = (event: any) => {
    try {
      const rawData = event.nativeEvent.data;
      const message = JSON.parse(rawData);
      
      if (message.type === 'apiResponse') {
        // Handle API response
        const { endpoint, response, status } = message;
        console.log('[ApiWebView] API Response:', endpoint, status, response);
        onApiResponse?.(endpoint, response, status);
      } else if (message.type === 'navigationChange') {
        // Handle navigation change
        const { url } = message;
        onNavigationChange?.(url);
      } else if (message.action === 'openPhotoPicker') {
        setShowPhotoPicker(true);
      } else if (message.action === 'openNotesEditor') {
        setShowNotesEditor(true);
      } else if (message.action === 'openProfile') {
        navigation.navigate('Profile' as never);
      }
    } catch (err) {
      console.error('[ApiWebView] Error parsing message:', err, event.nativeEvent.data);
    }
  };

  const handlePhotosChange = (photos: string[]) => {
    setSelectedPhotos(photos);
  };

  const handleSavePhotos = (photos: string[]) => {
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
    if (savedNotes.trim()) {
      const message = JSON.stringify({
        type: 'notesSaved',
        notes: savedNotes.trim(),
      });
      webViewRef.current?.postMessage(message);
    }
    setNotes('');
  };


  // Create injected script with API interception (always use API_BASE_URL for API calls)
  const injectedScript = useMemo(() => {
    const apiScript = createApiInterceptionScript(API_BASE_URL);
    // Combine API interception script with webview bridge script
    // The webview bridge handles data-native-action clicks
    return `${apiScript}\n${webviewInjectedScript}`;
  }, [API_BASE_URL]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <StatusBar hidden={true} translucent={true} />
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
            source={webViewSource}
            style={styles.webview}
            key={JSON.stringify(webViewSource)}
            onLoadStart={() => {
              setLoading(true);
              setError(null);
            }}
            onLoadEnd={() => {
              setLoading(false);
              // Inject scripts with retry logic to ensure they run even for SPAs
              const injectWithRetry = (script: string, retries = 3, delay = 500) => {
                const inject = () => {
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(script);
                  }
                };
                
                // Inject immediately
                inject();
                
                // Retry for SPAs that might load content dynamically
                for (let i = 1; i <= retries; i++) {
                  setTimeout(() => inject(), delay * i);
                }
              };
              
              // Inject combined scripts (API interception + webview bridge)
              injectWithRetry(injectedScript);
              
              // Also inject webview bridge script separately to ensure it runs
              injectWithRetry(webviewInjectedScript);
              
              // Hide web page navigation bar and force native keyboard
              injectWithRetry(`
                (function() {
                  console.log('[WebView] Injecting UI modification script');
                  
                  // Hide navigation bar and header elements
                  const hideSelectors = [
                    'nav', 'header', '.navbar', '.nav-bar', 
                    '[role="navigation"]', '.navigation',
                    'nav[class*="nav"]', 'header[class*="header"]'
                  ];
                  
                  const hideElements = () => {
                    hideSelectors.forEach(selector => {
                      try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                          if (el) {
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.height = '0';
                            el.style.overflow = 'hidden';
                          }
                        });
                      } catch (e) {
                        console.warn('Error hiding element:', selector, e);
                      }
                    });
                  };
                  
                  // Wait for DOM to be ready
                  const runWhenReady = () => {
                    if (document.body) {
                      hideElements();
                      
                      // Hide on DOM changes (for SPAs)
                      const observer = new MutationObserver(hideElements);
                      observer.observe(document.body, {
                        childList: true,
                        subtree: true
                      });
                      
                      // Force native keyboard on input focus
                      const setupNativeKeyboard = () => {
                        const inputs = document.querySelectorAll('input, textarea');
                        inputs.forEach(input => {
                          if (!input.hasAttribute('data-native-keyboard-setup')) {
                            input.setAttribute('data-native-keyboard-setup', 'true');
                            input.addEventListener('focus', function(e) {
                              this.setAttribute('readonly', 'readonly');
                              this.setAttribute('inputmode', 'text');
                              setTimeout(() => {
                                this.removeAttribute('readonly');
                              }, 100);
                            }, true);
                          }
                        });
                      };
                      
                      setupNativeKeyboard();
                      
                      // Re-setup on DOM changes
                      const inputObserver = new MutationObserver(setupNativeKeyboard);
                      inputObserver.observe(document.body, {
                        childList: true,
                        subtree: true
                      });
                    } else {
                      // Retry if body not ready
                      setTimeout(runWhenReady, 100);
                    }
                  };
                  
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', runWhenReady);
                  } else {
                    runWhenReady();
                  }
                })();
                true;
              `);
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
            injectedJavaScript={injectedScript}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={true}
            sharedCookiesEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            // Force native keyboard
            keyboardDisplayRequiresUserAction={false}
            // Hide scrollbars
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            onNavigationStateChange={(navState) => {
              onNavigationChange?.(navState.url);
            }}
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

