import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { RootStackParamList } from '@/types/navigation';

export const ResetPasswordScreen: React.FC = () => {
  const { resetPassword } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    try {
      setLoading(true);
      await resetPassword(email.trim());
      setMessage('Password reset email sent. Check your inbox.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <Text style={[styles.title, { color: palette.text }]}>Reset password</Text>
      <TextInput
        style={[styles.input, { borderColor: palette.card, color: palette.text }]}
        placeholder="Email"
        placeholderTextColor={palette.subtleText}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {message ? <Text style={{ color: palette.accent }}>{message}</Text> : null}
      <Pressable style={[styles.button, { backgroundColor: palette.accent }]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={{ color: palette.subtleText, marginTop: 20 }}>Back to login</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  button: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
