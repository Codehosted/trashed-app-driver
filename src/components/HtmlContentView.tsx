import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, ScrollView, TextInput, Pressable, Linking, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import HTMLView from 'react-native-htmlview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { handleApiResponse } from '@/services/api-response-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseTailwindClasses } from '@/utils/tailwind-to-rn';
import { APP_CONFIG } from '@/constants';
interface HtmlContentViewProps {
  route: string; // e.g., 'login', 'dashboard', 'vendor/dashboard'
  onNavigationChange?: (url: string) => void;
}
/**
 * Extract body content from full HTML document
 */
const extractBodyContent = (html: string): string => {
  // Try to extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim();
  }
  
  // If no body tag, try to extract content between html tags
  const htmlMatch = html.match(/<html[^>]*>([\s\S]*)<\/html>/i);
  if (htmlMatch && htmlMatch[1]) {
    // Remove head tag if present
    return htmlMatch[1].replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '').trim();
  }
  
  // If it's already a fragment, return as is
  return html;
};

/**
 * Component that fetches HTML from API and renders it as native views
 * Handles form submissions and API calls
 */
export const HtmlContentView: React.FC<HtmlContentViewProps> = ({ 
  route,
  onNavigationChange 
}) => {
  const { theme } = usePreferences();
  const { user, isAuthEnabled, loading: authLoading } = useAuth();
  const navigation = useNavigation();
  const palette = designSchema.theme[theme];
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const formRefs = useRef<Record<string, TextInput>>({});
  const isDark = theme === 'dark';

  const API_BASE_URL = APP_CONFIG.apiBaseUrl;

  // Get session cookie helper (memoized to avoid recreating on each render)
  const getSessionCookie = useMemo(() => {
    return async (): Promise<string | null> => {
      try {
        return await AsyncStorage.getItem('nextauth_session_cookie');
      } catch {
        return null;
      }
    };
  }, []);

  // Construct URL for the specific route
  const apiUrl = useMemo(() => {
    const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
    return `${baseUrl}${route}`;
  }, [route, API_BASE_URL]);

  // Redirect to native login if auth is required but user is not logged in
  useEffect(() => {
    if (!authLoading && isAuthEnabled && !user && !route.includes('login') && !route.includes('register') && !route.includes('reset')) {
      console.log('HtmlContentView: Redirecting to native login (auth required but no user)', { route, isAuthEnabled, hasUser: !!user });
      navigation.navigate('NativeLogin' as never);
    }
  }, [authLoading, isAuthEnabled, user, route, navigation]);

  // Add debugging to see what's happening
  useEffect(() => {
    console.log('HTML Content length:', htmlContent.length);
    console.log('Loading:', loading);
    console.log('Error:', error);
    if (htmlContent) {
      console.log('HTML preview:', htmlContent.substring(0, 500));
    }
  }, [htmlContent, loading, error]);

  // Fetch HTML content from API
  useEffect(() => {
    const fetchHtml = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get session cookie for authenticated requests
        const headers: HeadersInit = {
          'Content-Type': 'text/html',
        };
        
        // Add auth cookie if available
        const sessionCookie = await getSessionCookie();
        if (sessionCookie) {
          headers['Cookie'] = sessionCookie;
        }

        // Add mobile app header for vendor routes (required by backend)
        if (route.startsWith('vendor/')) {
          headers['X-Mobile-App'] = 'trashed-drivers';
        }

        const response = await fetch(apiUrl, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          throw new Error(`Failed to load: ${response.status}`);
        }

        const html = await response.text();
        const bodyContent = extractBodyContent(html);
        console.log('Extracted body content length:', bodyContent.length);
        setHtmlContent(bodyContent);
      } catch (err) {
        console.error('Error fetching HTML:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    fetchHtml();
  }, [apiUrl, getSessionCookie]);

  // Handle link presses
  const handleLinkPress = async (url: string) => {
    // Check if it's an internal route
    if (url.startsWith(API_BASE_URL) || url.startsWith('/')) {
      const path = url.replace(API_BASE_URL, '').replace(/^\//, '');
      onNavigationChange?.(path);
      // Navigate to appropriate screen based on path
      if (path.includes('login')) {
        navigation.navigate('NativeLogin' as never);
      } else if (path.includes('dashboard') || path.includes('vendor')) {
        navigation.navigate('DashboardWebView' as never);
      }
    } else {
      // External link
      await Linking.openURL(url);
    }
  };

  // Handle form submissions
  const handleFormSubmit = async (formId: string, action: string, method: string = 'POST') => {
    try {
      setLoading(true);
      
      const headers: HeadersInit = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      
      const sessionCookie = await getSessionCookie();
      if (sessionCookie) {
        headers['Cookie'] = sessionCookie;
      }

      // Add mobile app header for vendor routes (required by backend)
      if (action.includes('/vendor/') || route.startsWith('vendor/')) {
        headers['X-Mobile-App'] = 'trashed-drivers';
      }

      // Build form data
      const formDataToSend = new URLSearchParams();
      Object.entries(formData).forEach(([key, value]) => {
        formDataToSend.append(key, value);
      });

      const response = await fetch(action.startsWith('http') ? action : `${API_BASE_URL}${action}`, {
        method: method.toUpperCase(),
        headers,
        body: formDataToSend.toString(),
      });

      // Handle API response
      const contentType = response.headers.get('content-type') || '';
      let responseData: any;
      
      if (contentType.includes('application/json')) {
        responseData = await response.json();
        await handleApiResponse(action, responseData, response.status);
      } else {
        // HTML response - update content
        const html = await response.text();
        setHtmlContent(html);
      }

      // Handle redirects or navigation
      if (response.status === 200 && responseData?.redirect) {
        onNavigationChange?.(responseData.redirect);
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit form');
    } finally {
      setLoading(false);
    }
  };

  // Custom render node for forms and inputs with Tailwind class support
  const renderNode = (node: any, index: number, siblings: any[], parent: any, defaultRenderer: any) => {
    if (!node || !node.name) return undefined;
    
    const className = node.attribs?.class || node.attribs?.className || '';
    const hasClasses = className.trim().length > 0;

    // Handle form elements
    if (node.name === 'form') {
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'view') as ViewStyle : {};
      return (
        <View key={index} style={[styles.formContainer, tailwindStyle]}>
          {defaultRenderer(node.children, parent)}
          <Pressable
            style={[styles.submitButton, { backgroundColor: palette.accent }]}
            onPress={() => {
              const action = node.attribs?.action || '';
              const method = node.attribs?.method || 'POST';
              handleFormSubmit(node.attribs?.id || 'form', action, method);
            }}
          >
            <Text style={styles.submitButtonText}>Submit</Text>
          </Pressable>
        </View>
      );
    }

    // Handle input elements
    if (node.name === 'input') {
      const { type, name, placeholder, id } = node.attribs || {};
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'text') as TextStyle : {};
      
      if (type === 'text' || type === 'email' || type === 'password' || !type) {
        return (
          <TextInput
            key={index}
            ref={(ref) => {
              if (ref && name) formRefs.current[name] = ref;
            }}
            style={[
              styles.input, 
              { borderColor: palette.card, color: palette.text },
              tailwindStyle
            ]}
            placeholder={placeholder}
            placeholderTextColor={palette.subtleText}
            secureTextEntry={type === 'password'}
            keyboardType={type === 'email' ? 'email-address' : 'default'}
            autoCapitalize={type === 'email' ? 'none' : 'sentences'}
            value={formData[name] || ''}
            onChangeText={(text) => {
              if (name) {
                setFormData((prev) => ({ ...prev, [name]: text }));
              }
            }}
          />
        );
      }
    }

    // Handle button elements
    if (node.name === 'button') {
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'view') as ViewStyle : {};
      return (
        <Pressable
          key={index}
          style={[styles.submitButton, { backgroundColor: palette.accent }, tailwindStyle]}
          onPress={() => {
            const form = parent?.name === 'form' ? parent : findParentForm(node, parent);
            if (form) {
              const action = form.attribs?.action || '';
              const method = form.attribs?.method || 'POST';
              handleFormSubmit(form.attribs?.id || 'form', action, method);
            }
          }}
        >
          <Text style={styles.submitButtonText}>
            {defaultRenderer(node.children, parent)}
          </Text>
        </Pressable>
      );
    }

    // Handle link elements
    if (node.name === 'a') {
      const href = node.attribs?.href || '';
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'text') as TextStyle : {};
      return (
        <Pressable
          key={index}
          onPress={() => handleLinkPress(href)}
        >
          <Text style={[styles.link, tailwindStyle]}>
            {defaultRenderer(node.children, parent)}
          </Text>
        </Pressable>
      );
    }

    // Handle text elements (p, span, h1-h6, label, etc.)
    const textElements = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'li', 'td', 'th', 'strong', 'em', 'b', 'i', 'small'];
    if (textElements.includes(node.name)) {
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'text') as TextStyle : {};
      const defaultStyle = stylesheet[node.name as keyof typeof stylesheet] || {};
      return (
        <Text key={index} style={[defaultStyle, tailwindStyle]}>
          {defaultRenderer(node.children, parent)}
        </Text>
      );
    }

    // Handle container elements (div, section, article, header, footer, main, nav, ul, ol, etc.)
    const containerElements = ['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th'];
    if (containerElements.includes(node.name)) {
      const tailwindStyle = hasClasses ? parseTailwindClasses(className, 'view') as ViewStyle : {};
      return (
        <View key={index} style={tailwindStyle}>
          {defaultRenderer(node.children, parent)}
        </View>
      );
    }

    // For any other element with classes, try to apply styles
    if (hasClasses) {
      // Try as view first (most common)
      const tailwindStyle = parseTailwindClasses(className, 'view') as ViewStyle;
      if (Object.keys(tailwindStyle).length > 0) {
        return (
          <View key={index} style={tailwindStyle}>
            {defaultRenderer(node.children, parent)}
          </View>
        );
      }
    }

    // Default rendering for other elements
    return undefined;
  };

  // Helper to find parent form element
  const findParentForm = (node: any, parent: any): any => {
    if (!parent) return null;
    if (parent.name === 'form') return parent;
    return findParentForm(parent, parent.parent);
  };

  // Custom stylesheet for HTML elements
  const stylesheet = {
    body: {
      color: palette.text,
      fontSize: 16,
      backgroundColor: palette.background,
    },
    h1: {
      fontSize: 24,
      fontWeight: 'bold' as const,
      color: palette.text,
      marginVertical: 12,
    },
    h2: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: palette.text,
      marginVertical: 10,
    },
    h3: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: palette.text,
      marginVertical: 8,
    },
    h4: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: palette.text,
      marginVertical: 6,
    },
    h5: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: palette.text,
      marginVertical: 4,
    },
    h6: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: palette.text,
      marginVertical: 4,
    },
    p: {
      color: palette.text,
      marginVertical: 8,
      fontSize: 16,
    },
    span: {
      color: palette.text,
    },
    label: {
      color: palette.text,
      fontSize: 14,
      marginBottom: 4,
    },
    a: {
      color: palette.accent,
      textDecorationLine: 'underline' as const,
    },
    button: {
      backgroundColor: palette.accent,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    li: {
      color: palette.text,
      marginVertical: 4,
    },
    strong: {
      fontWeight: 'bold' as const,
      color: palette.text,
    },
    em: {
      fontStyle: 'italic' as const,
      color: palette.text,
    },
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    // Re-fetch content
    const fetchHtml = async () => {
      try {
        const headers: HeadersInit = { 'Content-Type': 'text/html' };
        const sessionCookie = await getSessionCookie();
        if (sessionCookie) {
          headers['Cookie'] = sessionCookie;
        }
        const response = await fetch(apiUrl, { method: 'GET', headers });
        const html = await response.text();
        setHtmlContent(html);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };
    fetchHtml();
  };

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
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <HTMLView
            value={htmlContent}
            stylesheet={stylesheet}
            onLinkPress={handleLinkPress}
            renderNode={renderNode}
            addLineBreaks={true}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  formContainer: {
    marginVertical: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontSize: 16,
  },
  submitButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  link: {
    color: '#6366f1',
    textDecorationLine: 'underline',
  },
});


