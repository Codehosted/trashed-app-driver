import React, { useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { RootStackParamList } from '@/types/navigation';
import { BrandLogo } from '@/components/BrandLogo';

const loginShowcase = require('../../assets/visuals/dumpster-service-hero.jpg');

function canOpenNativeDispatch(user: { roles?: string[]; vendorPermissions?: any } | null): boolean {
  return Boolean(user?.roles?.includes('driver') || user?.vendorPermissions?.driver === true);
}

export const NativeLoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login: contextLogin } = useAuth();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the context login function which updates user state
      const loggedInUser = await contextLogin(email.trim(), password);
      
      navigation.replace(canOpenNativeDispatch(loggedInUser) ? 'RoutesHome' : 'DashboardWebView');
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.hero, { height: Math.min(Math.max(height * 0.38, 230), 330) }]}>
            <ImageBackground
              source={loginShowcase}
              resizeMode="cover"
              style={styles.heroImage}
              imageStyle={styles.heroImageRadius}
            >
              <View style={styles.heroScrim} />
              <View style={styles.logoRow}>
                <BrandLogo
                  textColor="#ffffff"
                  accentColor="#60a5fa"
                  mutedColor="#dbe3ee"
                  subtitle="DRIVER PORTAL"
                />
                <View style={styles.secureBadge}>
                  <Ionicons name="shield-checkmark" size={15} color="#16a34a" />
                </View>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>Field operations</Text>
                <Text style={styles.heroTitle}>Routes, photos, and dispatch in one place.</Text>
              </View>
            </ImageBackground>
          </View>

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardEyebrow}>Trashed dispatch</Text>
                <Text style={styles.cardTitle}>Sign in</Text>
                <Text style={styles.cardDescription}>
                  Use your Trashed account to continue.
                </Text>
              </View>

              <View style={styles.cardContent}>
                {error && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor="#8791a6"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.passwordLabelRow}>
                    <Text style={styles.label}>Password</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset password"
                      onPress={() => navigation.navigate('NativeReset')}
                    >
                      <Text style={styles.forgotPasswordLink}>Forgot password?</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#8791a6"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    editable={!loading}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in"
                  style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.submitButtonText}>Signing in...</Text>
                    </View>
                  ) : (
                    <View style={styles.loadingContainer}>
                      <Text style={styles.submitButtonText}>Sign in</Text>
                      <Ionicons name="arrow-forward" size={17} color="#ffffff" />
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.footerText}>
                  Don't have an account?{' '}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create an account"
                    onPress={() => navigation.navigate('NativeRegister')}
                  >
                    <Text style={styles.footerLink}>Sign up</Text>
                  </Pressable>
                </Text>
                <Text style={styles.termsText}>
                  By signing in, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms of Service</Text>
                  {' and '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 8,
  },
  hero: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dbe3ee',
    shadowColor: '#070b2f',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 7,
  },
  heroImage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroImageRadius: {
    borderRadius: 30,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 11, 47, 0.32)',
  },
  logoRow: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  secureBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    zIndex: 2,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 6,
  },
  heroKicker: {
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    maxWidth: 320,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    marginTop: -24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#dddff0',
    shadowColor: '#070b2f',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 18,
    gap: 7,
  },
  cardEyebrow: {
    color: '#526071',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#070b2f',
    letterSpacing: 0,
  },
  cardDescription: {
    fontSize: 14,
    color: '#526071',
  },
  cardContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#b91c1c',
    fontWeight: '700',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#172033',
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordLink: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3b82f6',
  },
  input: {
    height: 50,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#dbe3ee',
    borderRadius: 18,
    fontSize: 16,
    color: '#070b2f',
    backgroundColor: '#f8fafc',
  },
  submitButton: {
    width: '100%',
    height: 54,
    backgroundColor: '#070b2f',
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#070b2f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  cardFooter: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 26,
    backgroundColor: '#f8fafc',
    gap: 14,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#526071',
    textAlign: 'center',
  },
  footerLink: {
    fontWeight: '900',
    color: '#3b82f6',
  },
  termsText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#3b82f6',
    fontWeight: '700',
  },
});
