import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SpotlightBackground } from '@/components/SpotlightBackground';
import { RootStackParamList } from '@/types/navigation';
import * as authService from '@/services/auth';
import Constants from 'expo-constants';

type ResetPasswordRouteProp = RouteProp<RootStackParamList, 'Reset'>;

/**
 * Native Reset Password Screen that matches the web app design
 */
export const NativeResetPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ResetPasswordRouteProp>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await authService.requestPasswordReset(email.trim());
      
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || 'Failed to send reset email. Please try again.');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
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
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Reset your password</Text>
                <Text style={styles.cardDescription}>
                  {success 
                    ? 'Check your email for reset instructions'
                    : 'Enter your email to receive a password reset link'}
                </Text>
              </View>

              <View style={styles.cardContent}>
                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {success ? (
                  <View style={styles.successContainer}>
                    <Text style={styles.successText}>
                      If an account exists with that email, you'll receive password reset instructions shortly.
                    </Text>
                    <Pressable
                      style={styles.backButton}
                      onPress={() => navigation.navigate('NativeLogin')}
                    >
                      <Text style={styles.backButtonText}>Back to login</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
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

                    <Pressable
                      style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                      onPress={handleSubmit}
                      disabled={loading}
                    >
                      {loading ? (
                        <View style={styles.loadingContainer}>
                          <ActivityIndicator size="small" color="#ffffff" />
                          <Text style={styles.submitButtonText}>Sending...</Text>
                        </View>
                      ) : (
                        <Text style={styles.submitButtonText}>Send reset link</Text>
                      )}
                    </Pressable>
                  </>
                )}
              </View>

              <View style={styles.cardFooter}>
                <Pressable onPress={() => navigation.navigate('NativeLogin')}>
                  <Text style={styles.backLink}>← Back to login</Text>
                </Pressable>
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
    maxWidth: 448,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
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
    gap: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  cardContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 20,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c',
    fontWeight: '500',
  },
  successContainer: {
    gap: 16,
    alignItems: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  input: {
    height: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  submitButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#9333ea',
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
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  backButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '500',
  },
  cardFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
    alignItems: 'center',
  },
  backLink: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
});

