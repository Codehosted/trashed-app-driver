import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { RouteStop, StopStatus } from '@/types/domain';

interface InfoCardProps {
  stop: RouteStop;
  index: number;
  theme: 'dark' | 'light';
  onUpdateStop: (id: string, updates: Partial<RouteStop>) => void;
  distance?: string;
  driveTime?: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({
  stop,
  index,
  theme,
  onUpdateStop,
  distance,
  driveTime,
}) => {
  const isDark = theme === 'dark';
  const [showPhotosPopup, setShowPhotosPopup] = useState(false);
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [tempNotes, setTempNotes] = useState(stop.notes || '');

  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${stop.uuid}`;
  const isActive = stop.status === 'in-transit' || stop.status === 'arrived';
  const isCompleted = stop.status === 'completed';

  const handleStatusChange = () => {
    let nextStatus: StopStatus = 'pending';
    if (stop.status === 'pending') nextStatus = 'in-transit';
    else if (stop.status === 'in-transit') nextStatus = 'arrived';
    else if (stop.status === 'arrived') nextStatus = 'completed';

    onUpdateStop(stop.uuid, { status: nextStatus });
  };

  const handleAddPhoto = () => {
    const newPhoto = `https://picsum.photos/seed/${Date.now()}/200`;
    onUpdateStop(stop.uuid, { photos: [...(stop.photos || []), newPhoto] });
  };

  const handleDeletePhoto = (photoIndex: number) => {
    const updatedPhotos = stop.photos?.filter((_, i) => i !== photoIndex) || [];
    onUpdateStop(stop.uuid, { photos: updatedPhotos });
  };

  const saveNotes = () => {
    onUpdateStop(stop.uuid, { notes: tempNotes });
    setShowNotesPopup(false);
  };

  const getStatusColor = () => {
    switch (stop.status) {
      case 'completed':
        return '#10b981';
      case 'in-transit':
        return '#3b82f6';
      case 'arrived':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const getStatusIcon = () => {
    switch (stop.status) {
      case 'completed':
        return 'checkmark-circle';
      case 'in-transit':
        return 'navigate';
      case 'arrived':
        return 'location';
      default:
        return null;
    }
  };

  return (
    <>
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isActive
              ? '#10b981'
              : isDark
              ? 'rgba(51, 65, 85, 0.5)'
              : 'rgba(255, 255, 255, 0.6)',
            borderWidth: isActive ? 2 : 1,
            shadowColor: isActive ? '#10b981' : '#000',
            shadowOpacity: isActive ? 0.3 : 0.1,
            shadowRadius: isActive ? 50 : 10,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Centered Avatar */}
        <View style={styles.avatarContainer}>
          <View
            style={[
              styles.avatar,
              {
                borderColor: isDark ? '#0f172a' : '#ffffff',
              },
            ]}
          >
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
          </View>

          {/* Status Pip */}
          <View
            style={[
              styles.statusPip,
              {
                backgroundColor: getStatusColor(),
                borderColor: isDark ? '#0f172a' : '#ffffff',
              },
            ]}
          >
            {getStatusIcon() && (
              <Ionicons name={getStatusIcon() as any} size={8} color="#fff" />
            )}
          </View>
        </View>

        {/* Content Body */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Stop Number & Time */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : '#eef2ff',
                  borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#c7d2fe',
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: isDark ? '#818cf8' : '#4f46e5',
                  },
                ]}
              >
                Stop #{index + 1}
              </Text>
            </View>
            {stop.scheduledAt && (
              <View
                style={[
                  styles.timeBadge,
                  {
                    backgroundColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#f1f5f9',
                    borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : '#cbd5e1',
                  },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={9}
                  color={isDark ? '#94a3b8' : '#64748b'}
                />
                <Text
                  style={[
                    styles.timeText,
                    {
                      color: isDark ? '#94a3b8' : '#64748b',
                    },
                  ]}
                >
                  {stop.scheduledAt}
                </Text>
              </View>
            )}
          </View>

          {/* Title & Address */}
          <View style={styles.titleSection}>
            <Text
              style={[
                styles.title,
                {
                  color: isDark ? '#ffffff' : '#0f172a',
                },
              ]}
            >
              {stop.name || stop.title}
            </Text>
            <View style={styles.addressRow}>
              {stop.taskType && (
                <View
                  style={[
                    styles.taskBadge,
                    {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : '#eef2ff',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.taskText,
                      {
                        color: isDark ? '#818cf8' : '#4f46e5',
                      },
                    ]}
                  >
                    {stop.taskType.toUpperCase()}
                  </Text>
                </View>
              )}
              {stop.address && (
                <Text
                  style={[
                    styles.address,
                    {
                      color: isDark ? '#94a3b8' : '#64748b',
                    },
                  ]}
                >
                  • {stop.address}
                </Text>
              )}
            </View>
          </View>

          {stop.description && (
            <Text
              style={[
                styles.description,
                {
                  color: isDark ? '#94a3b8' : '#475569',
                },
              ]}
            >
              {stop.description}
            </Text>
          )}

          {/* ETA Display */}
          {(distance || driveTime) && !isCompleted && (
            <View style={styles.etaRow}>
              {distance && (
                <View style={styles.etaItem}>
                  <Ionicons name="navigate" size={10} color="#10b981" />
                  <Text style={[styles.etaText, { color: '#10b981' }]}>{distance}</Text>
                </View>
              )}
              {driveTime && (
                <View style={styles.etaItem}>
                  <Ionicons name="car" size={10} color="#f59e0b" />
                  <Text style={[styles.etaText, { color: '#f59e0b' }]}>{driveTime}</Text>
                </View>
              )}
            </View>
          )}

          {/* Main Workflow Button */}
          {!isCompleted && (
            <Pressable
              onPress={handleStatusChange}
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    stop.status === 'pending'
                      ? '#4f46e5'
                      : stop.status === 'in-transit'
                      ? '#f59e0b'
                      : '#10b981',
                },
              ]}
            >
              <Text style={styles.actionButtonText}>
                {stop.status === 'pending' && 'Start Route'}
                {stop.status === 'in-transit' && 'Arrived at Site'}
                {stop.status === 'arrived' && 'Complete Job'}
              </Text>
              <Ionicons
                name={
                  stop.status === 'pending'
                    ? 'navigate'
                    : stop.status === 'in-transit'
                    ? 'location'
                    : 'checkmark-circle'
                }
                size={14}
                color="#fff"
              />
            </Pressable>
          )}

          {/* Photos & Notes Icon Buttons */}
          <View style={styles.iconRow}>
            <Pressable
              onPress={() => setShowPhotosPopup(true)}
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                  borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
            >
              <Ionicons
                name="camera"
                size={16}
                color={isDark ? '#ffffff' : '#475569'}
              />
              {stop.photos && stop.photos.length > 0 && (
                <View style={styles.badgeDot}>
                  <Text style={styles.badgeDotText}>{stop.photos.length}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setTempNotes(stop.notes || '');
                setShowNotesPopup(true);
              }}
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                  borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={isDark ? '#ffffff' : '#475569'}
              />
              {stop.notes && <View style={styles.notesDot} />}
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Photos Popup */}
      <Modal
        visible={showPhotosPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotosPopup(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPhotosPopup(false)}
        >
          <Pressable
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.modalHeader,
                {
                  borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: isDark ? '#ffffff' : '#0f172a',
                  },
                ]}
              >
                Photos
              </Text>
              <Pressable onPress={() => setShowPhotosPopup(false)}>
                <Ionicons
                  name="close"
                  size={18}
                  color={isDark ? '#94a3b8' : '#64748b'}
                />
              </Pressable>
            </View>
            <ScrollView style={styles.photosGrid}>
              {stop.photos && stop.photos.length > 0 ? (
                <View style={styles.photosRow}>
                  {stop.photos.map((photo, i) => (
                    <View key={i} style={styles.photoContainer}>
                      <Image source={{ uri: photo }} style={styles.photo} />
                      <Pressable
                        style={styles.deletePhotoButton}
                        onPress={() => handleDeletePhoto(i)}
                      >
                        <Ionicons name="close-circle" size={24} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text
                  style={[
                    styles.emptyText,
                    {
                      color: isDark ? '#94a3b8' : '#64748b',
                    },
                  ]}
                >
                  No photos yet
                </Text>
              )}
              <Pressable
                style={[
                  styles.addPhotoButton,
                  {
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : '#eef2ff',
                    borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#c7d2fe',
                  },
                ]}
                onPress={handleAddPhoto}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={isDark ? '#818cf8' : '#4f46e5'}
                />
                <Text
                  style={[
                    styles.addPhotoText,
                    {
                      color: isDark ? '#818cf8' : '#4f46e5',
                    },
                  ]}
                >
                  Add Photo
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notes Popup */}
      <Modal
        visible={showNotesPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotesPopup(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNotesPopup(false)}
        >
          <Pressable
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.modalHeader,
                {
                  borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: isDark ? '#ffffff' : '#0f172a',
                  },
                ]}
              >
                Notes
              </Text>
              <Pressable onPress={() => setShowNotesPopup(false)}>
                <Ionicons
                  name="close"
                  size={18}
                  color={isDark ? '#94a3b8' : '#64748b'}
                />
              </Pressable>
            </View>
            <TextInput
              style={[
                styles.notesInput,
                {
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
              value={tempNotes}
              onChangeText={setTempNotes}
              placeholder="Add notes..."
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              multiline
              numberOfLines={6}
            />
            <Pressable
              style={[
                styles.saveButton,
                {
                  backgroundColor: '#4f46e5',
                },
              ]}
              onPress={saveNotes}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -140,
    marginTop: -160,
    width: 280,
    maxHeight: '55%',
    borderRadius: 16,
    paddingTop: 48,
    padding: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },
  avatarContainer: {
    position: 'absolute',
    top: -40,
    left: '50%',
    marginLeft: -32,
    zIndex: 10,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  statusPip: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  timeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  titleSection: {
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  taskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taskText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  address: {
    fontSize: 10,
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
    paddingVertical: 4,
  },
  etaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  etaText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
  },
  iconButton: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeDotText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  notesDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4f46e5',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: '80%',
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
    fontWeight: 'bold',
  },
  photosGrid: {
    padding: 16,
  },
  photosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  photoContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 16,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  notesInput: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  saveButton: {
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

