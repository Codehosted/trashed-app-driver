import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { RootStackParamList } from '@/types/navigation';

export const RegisterScreen: React.FC = () => {
  const { register } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      setLoading(true);
      setError('');
      await register(email.trim(), password);
      navigation.navigate('Walkthrough');
    } catch (err) {
      setError('Unable to register. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <Text style={[styles.title, { color: palette.text }]}>Create account</Text>
      <TextInput
        style={[styles.input, { borderColor: palette.card, color: palette.text }]}
        placeholder="Email"
        placeholderTextColor={palette.subtleText}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { borderColor: palette.card, color: palette.text }]}
        placeholder="Password"
        placeholderTextColor={palette.subtleText}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      <Pressable style={[styles.button, { backgroundColor: palette.accent }]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={{ color: palette.subtleText, marginTop: 20 }}>Already have an account? Login</Text>
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
