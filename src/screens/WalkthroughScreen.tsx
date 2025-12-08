import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { designSchema } from '@/data/designSchema';
import { usePreferences } from '@/context/PreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { RootStackParamList } from '@/types/navigation';

const { width } = Dimensions.get('window');

export const WalkthroughScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const slides = designSchema.walkthrough;
  const { theme } = usePreferences();
  const { completeWalkthrough } = useAuth();
  const palette = designSchema.theme[theme];
  const [index, setIndex] = useState(0);

  const handleComplete = async () => {
    await completeWalkthrough();
    navigation.replace('DashboardWebView');
  };

  const onViewableItemsChanged = React.useRef(({ viewableItems }: any) => {
    if (viewableItems?.length > 0) {
      setIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.illustration, { backgroundColor: palette.card }]}> 
              <Text style={{ color: palette.accent, fontSize: 52 }}>•</Text>
              <Text style={{ color: palette.text, fontWeight: '700' }}>{item.illustration.toUpperCase()}</Text>
            </View>
            <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
            <Text style={[styles.subtitle, { color: palette.subtleText }]}>{item.subtitle}</Text>
            <Text style={[styles.description, { color: palette.subtleText }]}>{item.description}</Text>
          </View>
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
      />
      <View style={styles.dots}>
        {slides.map((slide, idx) => (
          <View
            key={slide.id}
            style={[styles.dot, { backgroundColor: idx === index ? palette.accent : palette.card }]}
          />
        ))}
      </View>
      <Pressable style={[styles.button, { backgroundColor: palette.accent }]} onPress={handleComplete}>
        <Text style={styles.buttonText}>{index === slides.length - 1 ? 'Start driving' : 'Next'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    paddingBottom: 24,
  },
  slide: {
    padding: 24,
    alignItems: 'center',
  },
  illustration: {
    width: 180,
    height: 180,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 18,
    marginVertical: 6,
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  button: {
    marginHorizontal: 24,
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
