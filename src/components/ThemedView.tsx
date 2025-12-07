import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';

interface Props {
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}

export const ThemedView: React.FC<Props> = ({ style, children }: Props) => {
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];

  return <View style={[styles.base, { backgroundColor: palette.background }, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
