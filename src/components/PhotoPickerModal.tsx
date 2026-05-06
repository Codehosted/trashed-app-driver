import React from 'react';
import { View, StyleSheet, Text, Pressable, Modal, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

interface PhotoPickerModalProps {
  visible: boolean;
  isDark: boolean;
  selectedPhotos: string[];
  onClose: () => void;
  onPhotosChange: (photos: string[]) => void;
  onSave: (photos: string[]) => void;
}

export const PhotoPickerModal: React.FC<PhotoPickerModalProps> = ({
  visible,
  isDark,
  selectedPhotos,
  onClose,
  onPhotosChange,
  onSave,
}) => {
  const handlePickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to add photos!');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets) {
        const uris = result.assets.map(asset => asset.uri);
        onPhotosChange([...selectedPhotos, ...uris]);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera permissions to take photos!');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        onPhotosChange([...selectedPhotos, result.assets[0].uri]);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleDeletePhoto = (index: number) => {
    onPhotosChange(selectedPhotos.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(selectedPhotos);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#334155' : '#e2e8f0',
              borderWidth: 1,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.modalHeader,
              {
                borderBottomColor: isDark ? '#334155' : '#e2e8f0',
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#0f172a' }]}>
              Photos
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={18} color={isDark ? '#94a3b8' : '#64748b'} />
            </Pressable>
          </View>

          <ScrollView style={styles.photosContainer} contentContainerStyle={styles.photosContent}>
            {selectedPhotos.length > 0 ? (
              <View style={styles.photosGrid}>
                {selectedPhotos.map((uri, index) => (
                  <View key={index} style={styles.photoItem}>
                    <Image source={{ uri }} style={styles.photoPreview} />
                    <Pressable
                      style={styles.deletePhotoButton}
                      onPress={() => handleDeletePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.photoEmptyState}>
                <Ionicons name="camera" size={32} color={isDark ? '#64748b' : '#94a3b8'} />
                <Text style={[styles.photoEmptyText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                  No photos added yet
                </Text>
              </View>
            )}

            <View style={styles.photoActions}>
              <Pressable
                style={[styles.addPhotoButton, { backgroundColor: '#4f46e5' }]}
                onPress={handlePickImage}
              >
                <Ionicons name="images-outline" size={16} color="#ffffff" />
                <Text style={styles.addPhotoButtonText}>Select Photos</Text>
              </Pressable>
              <Pressable
                style={[styles.addPhotoButton, { backgroundColor: '#0f172a' }]}
                onPress={handleTakePhoto}
              >
                <Ionicons name="camera-outline" size={16} color="#ffffff" />
                <Text style={styles.addPhotoButtonText}>Take Photo</Text>
              </Pressable>
            </View>
            <Pressable
              style={[
                styles.savePhotosButton,
                { backgroundColor: '#2563eb' },
              ]}
              onPress={handleSave}
            >
              <Text style={styles.addPhotoButtonText}>
                {selectedPhotos.length > 0
                  ? `Save ${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'Photo' : 'Photos'}`
                  : 'Done'}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 384,
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  photosContainer: {
    maxHeight: 420,
  },
  photosContent: {
    padding: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  photoItem: {
    position: 'relative',
    width: '30%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  photoEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  photoEmptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  addPhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  savePhotosButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 10,
  },
  addPhotoButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
