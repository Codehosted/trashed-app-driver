import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  Pressable, 
  ActivityIndicator, 
  ScrollView,
  KeyboardAvoidingView,
  Platform 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { SpotlightBackground } from '@/components/SpotlightBackground';
import { RootStackParamList } from '@/types/navigation';
import * as authService from '@/services/auth';

/**
 * Native Login Screen that matches the web app design
 * Mirrors the design from app/login/page.tsx and ProductionLoginForm
 */
const WALKTHROUGH_KEY = 'driver_walkthrough_complete';

export const NativeLoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login: contextLogin, user } = useAuth();
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
      await contextLogin(email.trim(), password);
      
      // Check walkthrough status directly from AsyncStorage
      // Get the current session to check user UUID
      const sessionResponse = await authService.getSession();
      if (sessionResponse.success && sessionResponse.user) {
        const userUid = sessionResponse.user.uuid;
        const walkthroughSeen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${userUid}`);
        
        // Navigate to appropriate screen after successful login
        if (!walkthroughSeen) {
          navigation.replace('Walkthrough');
        } else {
          navigation.replace('DashboardWebView');
        }
      } else {
        // Fallback navigation to dashboard
        navigation.replace('DashboardWebView');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SpotlightBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.cardContainer}>
            {/* Card - matches web design */}
            <View style={styles.card}>
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Welcome Back!</Text>
                <Text style={styles.cardDescription}>
                  Sign in to access your <Text style={styles.brandText}>Trashed</Text> account
                </Text>
              </View>

              {/* Card Content */}
              <View style={styles.cardContent}>
                {/* Error Message */}
                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor="#94a3b8"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!loading}
                  />
                </View>

                {/* Password Input */}
                <View style={styles.inputGroup}>
                  <View style={styles.passwordLabelRow}>
                    <Text style={styles.label}>Password</Text>
                    <Pressable onPress={() => navigation.navigate('NativeReset')}>
                      <Text style={styles.forgotPasswordLink}>Forgot password?</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    editable={!loading}
                  />
                </View>

                {/* Submit Button */}
                <Pressable
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
                    <Text style={styles.submitButtonText}>Sign in</Text>
                  )}
                </Pressable>
              </View>

              {/* Card Footer */}
              <View style={styles.cardFooter}>
                <Text style={styles.footerText}>
                  Don't have an account?{' '}
                  <Pressable onPress={() => navigation.navigate('NativeRegister')}>
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
    </SpotlightBackground>
  );
};

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 448, // max-w-md equivalent
    alignSelf: 'center',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)', // bg-white/80 backdrop-blur-sm
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a', // slate-900
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 16,
    color: '#475569', // slate-600
    textAlign: 'center',
  },
  brandText: {
    color: '#6366f1', // indigo-500 (logo color)
    fontWeight: '600',
  },
  cardContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 24,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2', // red-50
    borderWidth: 1,
    borderColor: '#fecaca', // red-200
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c', // red-700
    fontWeight: '500',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155', // slate-700
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordLink: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9333ea', // purple-600
  },
  input: {
    height: 44, // h-11 equivalent
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0', // slate-200
    borderRadius: 8,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  submitButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#9333ea', // purple-600
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9333ea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
    fontWeight: '600',
  },
  cardFooter: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: 'rgba(248, 250, 252, 0.5)', // slate-50/50
    gap: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#475569', // slate-600
    textAlign: 'center',
  },
  footerLink: {
    fontWeight: '600',
    color: '#9333ea', // purple-600
  },
  termsText: {
    fontSize: 12,
    color: '#64748b', // slate-500
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#9333ea', // purple-600
  },
});

