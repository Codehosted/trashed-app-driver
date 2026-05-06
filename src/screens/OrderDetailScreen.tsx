import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { RouteStopStatus } from '@/types/domain';
import { PhotoPickerModal } from '@/components/PhotoPickerModal';
import { useDriverLocation } from '@/context/DriverLocationContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import * as dispatchService from '@/services/dispatch';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const STATUS_FLOW: RouteStopStatus[] = [
  'pending',
  'en_route',
  'arrived',
  'completed',
];

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#64748b', icon: 'time-outline' },
  en_route: { label: 'En Route', color: '#3b82f6', icon: 'navigate-outline' },
  'in-transit': { label: 'In Transit', color: '#3b82f6', icon: 'navigate-outline' },
  arrived: { label: 'Arrived', color: '#f59e0b', icon: 'location-outline' },
  completed: { label: 'Completed', color: '#10b981', icon: 'checkmark-circle-outline' },
  skipped: { label: 'Skipped', color: '#94a3b8', icon: 'play-skip-forward-outline' },
  cancelled: { label: 'Cancelled', color: '#ef4444', icon: 'close-circle-outline' },
  issue: { label: 'Issue', color: '#ef4444', icon: 'alert-circle-outline' },
};

const TASK_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'drop-off': { label: 'Drop-Off', color: '#d97706', bg: '#fef3c7' },
  'pick-up': { label: 'Pick-Up', color: '#2563eb', bg: '#dbeafe' },
  swap: { label: 'Swap', color: '#7c3aed', bg: '#ede9fe' },
  service: { label: 'Service', color: '#059669', bg: '#d1fae5' },
};

const QUICK_MESSAGES = [
  'I am on my way and will update you when I arrive.',
  'I have arrived on site.',
  'I need help with access before I can complete this stop.',
] as const;

function formatDurationShort(totalSeconds?: number): string | null {
  if (typeof totalSeconds !== 'number' || totalSeconds <= 0) return null;

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${totalMinutes} min`;
}

function formatDistanceShort(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== 'number' || distanceMeters <= 0) return null;

  const miles = distanceMeters / 1609.34;
  if (miles >= 10) {
    return `${miles.toFixed(0)} mi`;
  }

  return `${miles.toFixed(1)} mi`;
}

function formatPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (normalized.length !== 10) return phone;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function formatTimeFromNow(durationSeconds: number): string {
  const eta = new Date(Date.now() + durationSeconds * 1000);
  return eta.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function calculateDeviceEta(
  currentLocation: { lat: number; lng: number } | null,
  targetLocation: { lat: number; lng: number } | null
): { eta: string; durationSeconds: number; distanceMeters: number } | null {
  if (!currentLocation || !targetLocation) return null;
  if (!Number.isFinite(targetLocation.lat) || !Number.isFinite(targetLocation.lng)) return null;
  if (targetLocation.lat === 0 && targetLocation.lng === 0) return null;

  const distanceKm = getDistanceKm(
    currentLocation.lat,
    currentLocation.lng,
    targetLocation.lat,
    targetLocation.lng
  );
  const averageKph = distanceKm > 16 ? 50 : 28;
  const durationSeconds = Math.max(60, Math.round((distanceKm / averageKph) * 3600));

  return {
    eta: formatTimeFromNow(durationSeconds),
    durationSeconds,
    distanceMeters: distanceKm * 1000,
  };
}

export const OrderDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { stop, routeUuid } = route.params;
  const { theme } = usePreferences();
  const { currentLocation, setActiveRouteUuid } = useDriverLocation();
  const palette = designSchema.theme[theme];
  const isDark = theme === 'dark';

  const [currentStatus, setCurrentStatus] = useState<RouteStopStatus>(stop.status);
  const [notes, setNotes] = useState(stop.notes || '');
  const [updating, setUpdating] = useState(false);
  const [photos, setPhotos] = useState<string[]>(stop.photos ?? []);
  const [photoDraft, setPhotoDraft] = useState<string[]>(stop.photos ?? []);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [customerMessage, setCustomerMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sentMessages, setSentMessages] = useState<string[]>([]);

  const statusMeta = STATUS_META[currentStatus] || STATUS_META.pending;
  const taskMeta = TASK_LABELS[stop.taskType || 'service'] || TASK_LABELS.service;
  const currentIdx = STATUS_FLOW.indexOf(currentStatus);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentIdx + 1]
    : null;

  const cardBg = isDark ? 'rgba(31, 41, 55, 0.9)' : '#ffffff';
  const cardBorder = isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0';
  const dumpsterLabel = [stop.dumpsterSize, stop.dumpsterType].filter(Boolean).join(' / ');
  const deviceEta = useMemo(
    () =>
      calculateDeviceEta(
        currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null,
        stop.coordinates
      ),
    [currentLocation, stop.coordinates]
  );
  const etaLabel = deviceEta?.eta || stop.eta || stop.time || null;
  const travelLabel = [formatDurationShort(stop.travelDurationSeconds), formatDistanceShort(stop.travelDistanceMeters)]
    .filter(Boolean)
    .join(' / ');
  const deviceTravelLabel = deviceEta
    ? [formatDurationShort(deviceEta.durationSeconds), formatDistanceShort(deviceEta.distanceMeters)]
        .filter(Boolean)
        .join(' / ')
    : null;
  const remainingLabel = [formatDurationShort(stop.remainingDurationSeconds), formatDistanceShort(stop.remainingDistanceMeters)]
    .filter(Boolean)
    .join(' / ');
  const routeTotalsLabel = [formatDurationShort(stop.routeDurationSeconds), formatDistanceShort(stop.routeDistanceMeters)]
    .filter(Boolean)
    .join(' / ');
  const customerPhoneLabel = formatPhone(stop.customerPhone);

  useEffect(() => {
    setActiveRouteUuid(routeUuid);
    return () => setActiveRouteUuid(null);
  }, [routeUuid, setActiveRouteUuid]);

  const updateStatus = useCallback(async (newStatus: RouteStopStatus) => {
    const stopId = stop.uuid || stop.id;
    setUpdating(true);
    try {
      await dispatchService.updateStopStatus(routeUuid, stopId, newStatus, notes || undefined);
      setCurrentStatus(newStatus);
    } catch (err) {
      Alert.alert('Update Failed', err instanceof Error ? err.message : 'Could not update status.');
    } finally {
      setUpdating(false);
    }
  }, [notes, routeUuid, stop.id, stop.uuid]);

  const handleAdvance = () => {
    if (!nextStatus) return;
    const meta = STATUS_META[nextStatus];
    Alert.alert(
      `Mark as ${meta.label}?`,
      `Update this order to "${meta.label}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: meta.label, onPress: () => updateStatus(nextStatus) },
      ],
    );
  };

  const handleIssue = () => {
    Alert.alert(
      'Report Issue',
      'Mark this stop as having an issue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => updateStatus('issue') },
      ],
    );
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Order',
      'Mark this stop as skipped?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: () => updateStatus('skipped') },
      ],
    );
  };

  const handleSavePhotos = async (nextPhotos: string[]) => {
    const newPhotos = nextPhotos.filter((uri) => !photos.includes(uri));
    setPhotos(nextPhotos);
    if (newPhotos.length === 0) {
      return;
    }

    const stopId = stop.uuid || stop.id;
    setUploadingPhotos(true);
    try {
      const uploaded = await Promise.all(
        newPhotos.map((uri) =>
          dispatchService.uploadStopImage(routeUuid, stopId, uri, 'job_site_photo')
        )
      );
      const uploadedUrls = uploaded.flat();
      setPhotos((current) => [
        ...current.filter((uri) => !newPhotos.includes(uri)),
        ...uploadedUrls,
      ]);
    } catch (error) {
      setPhotos(photos);
      Alert.alert(
        'Upload Failed',
        error instanceof Error ? error.message : 'Could not upload photos.'
      );
    } finally {
      setUploadingPhotos(false);
    }
  };

  const openPhoneLink = (kind: 'call' | 'sms') => {
    if (!stop.customerPhone) return;
    const scheme = kind === 'call' ? 'tel' : 'sms';
    void Linking.openURL(`${scheme}:${stop.customerPhone}`).catch(() => {
      Alert.alert('Unable to open phone app', 'Please try again from your device.');
    });
  };

  const sendMessage = async (messageText = customerMessage) => {
    const trimmed = messageText.trim();
    if (!trimmed) {
      return;
    }

    const stopId = stop.uuid || stop.id;
    setSendingMessage(true);
    try {
      await dispatchService.sendCustomerMessage(routeUuid, stopId, trimmed);
      setSentMessages((current) => [trimmed, ...current].slice(0, 3));
      setCustomerMessage('');
      Alert.alert('Message sent', 'The customer was notified by SMS.');
    } catch (error) {
      Alert.alert(
        'Message failed',
        error instanceof Error ? error.message : 'Could not send the customer message.'
      );
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
          Order Details
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.statusBanner, { backgroundColor: statusMeta.color }]}>
          <Ionicons name={statusMeta.icon as any} size={20} color="#fff" />
          <Text style={styles.statusBannerText}>{statusMeta.label}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.nameRow}>
            <Text style={[styles.stopName, { color: palette.text }]}>
              {stop.name || stop.title || 'Stop'}
            </Text>
            <View style={[styles.taskBadge, { backgroundColor: taskMeta.bg }]}>
              <Text style={[styles.taskBadgeText, { color: taskMeta.color }]}>{taskMeta.label}</Text>
            </View>
          </View>
          {stop.description ? (
            <Text style={[styles.description, { color: palette.subtleText }]}>{stop.description}</Text>
          ) : null}
        </View>

        {(dumpsterLabel || stop.dumpsterDescription) ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.infoRow}>
              <Ionicons name="cube-outline" size={18} color={palette.accent} />
              <View style={styles.infoBody}>
                <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Dumpster</Text>
                {dumpsterLabel ? (
                  <Text style={[styles.infoValue, { color: palette.text }]}>{dumpsterLabel}</Text>
                ) : null}
                {stop.dumpsterDescription ? (
                  <Text style={[styles.infoSub, { color: palette.subtleText }]}>{stop.dumpsterDescription}</Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={palette.accent} />
            <View style={styles.infoBody}>
              <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Address</Text>
              <Text style={[styles.infoValue, { color: palette.text }]}>{stop.address}</Text>
              {stop.addressDetails ? (
                <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                  {[stop.addressDetails.city, stop.addressDetails.state, stop.addressDetails.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {(stop.customerName || stop.customerPhone || stop.confirmationCode || stop.specialInstructions) ? (
          <View style={[styles.card, styles.customerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.customerHeader}>
              <View style={styles.infoRow}>
                <Ionicons name="person-circle-outline" size={20} color={palette.accent} />
                <View style={styles.infoBody}>
                  <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Customer</Text>
                  <Text style={[styles.infoValue, { color: palette.text }]}>
                    {stop.customerName || 'Customer'}
                  </Text>
                  {customerPhoneLabel ? (
                    <Text style={[styles.infoSub, { color: palette.subtleText }]}>{customerPhoneLabel}</Text>
                  ) : null}
                </View>
              </View>
              {stop.confirmationCode ? (
                <View style={[styles.codeBadge, { backgroundColor: `${palette.accent}16` }]}>
                  <Text style={[styles.codeLabel, { color: palette.subtleText }]}>CODE</Text>
                  <Text style={[styles.codeText, { color: palette.accent }]}>{stop.confirmationCode}</Text>
                </View>
              ) : null}
            </View>

            {stop.specialInstructions ? (
              <View style={[styles.instructionsBox, { backgroundColor: isDark ? '#262a33' : '#f8fafc' }]}>
                <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Instructions</Text>
                <Text style={[styles.infoSub, { color: palette.text }]}>{stop.specialInstructions}</Text>
              </View>
            ) : null}

            {stop.customerPhone ? (
              <View style={styles.customerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${stop.customerName || 'customer'}`}
                  style={[styles.customerAction, { borderColor: cardBorder }]}
                  onPress={() => openPhoneLink('call')}
                >
                  <Ionicons name="call-outline" size={17} color={palette.accent} />
                  <Text style={[styles.customerActionText, { color: palette.text }]}>Call</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Text ${stop.customerName || 'customer'} with the phone app`}
                  style={[styles.customerAction, { borderColor: cardBorder }]}
                  onPress={() => openPhoneLink('sms')}
                >
                  <Ionicons name="chatbubble-outline" size={17} color={palette.accent} />
                  <Text style={[styles.customerActionText, { color: palette.text }]}>Text app</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {(etaLabel || travelLabel || remainingLabel || routeTotalsLabel) ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color={palette.accent} />
              <View style={styles.infoBody}>
                <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Timing</Text>
                {etaLabel ? (
                  <Text style={[styles.infoValue, { color: palette.text }]}>
                    {deviceEta ? 'Live ETA' : 'ETA'} {etaLabel}
                  </Text>
                ) : null}
                {deviceTravelLabel ? (
                  <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                    From current location: {deviceTravelLabel}
                  </Text>
                ) : null}
                {travelLabel ? (
                  <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                    Travel from previous stop: {travelLabel}
                  </Text>
                ) : null}
                {remainingLabel ? (
                  <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                    Remaining after this stop: {remainingLabel}
                  </Text>
                ) : null}
                {routeTotalsLabel ? (
                  <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                    Full route: {routeTotalsLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.infoRow}>
            <Ionicons name="list-outline" size={18} color={palette.accent} />
            <View style={styles.infoBody}>
              <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Route</Text>
              <Text style={[styles.infoValue, { color: palette.text }]}>
                {routeUuid.slice(0, 8)}...
                {stop.sequence != null ? `  /  Stop #${stop.sequence}` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.infoLabel, { color: palette.subtleText, marginBottom: 8 }]}>Driver Notes</Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                color: palette.text,
                backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : '#f8fafc',
                borderColor: cardBorder,
              },
            ]}
            placeholder="Add notes about this stop..."
            placeholderTextColor={palette.subtleText}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </View>

        {stop.customerPhone ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.messageHeader}>
              <View>
                <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Customer Message</Text>
                <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                  To {customerPhoneLabel ?? stop.customerPhone}
                </Text>
              </View>
              {sendingMessage ? <ActivityIndicator size="small" color={palette.accent} /> : null}
            </View>
            <View style={styles.quickMessageRail}>
              {QUICK_MESSAGES.map((message) => (
                <Pressable
                  key={message}
                  accessibilityRole="button"
                  accessibilityLabel={`Use quick message: ${message}`}
                  style={[styles.quickMessageChip, { borderColor: cardBorder }]}
                  onPress={() => {
                    setCustomerMessage(message);
                  }}
                  disabled={sendingMessage}
                >
                  <Text style={[styles.quickMessageText, { color: palette.text }]} numberOfLines={1}>
                    {message}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[
                styles.messageInput,
                {
                  color: palette.text,
                  backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : '#f8fafc',
                  borderColor: cardBorder,
                },
              ]}
              value={customerMessage}
              onChangeText={setCustomerMessage}
              editable={!sendingMessage}
              maxLength={480}
              multiline
              textAlignVertical="top"
              placeholder="Write a customer update..."
              placeholderTextColor={palette.subtleText}
            />
            <View style={styles.messageFooter}>
              <Text style={[styles.messageCount, { color: palette.subtleText }]}>
                {customerMessage.length}/480
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send customer message"
                style={[
                  styles.sendMessageButton,
                  { backgroundColor: palette.accent, opacity: customerMessage.trim() && !sendingMessage ? 1 : 0.45 },
                ]}
                disabled={!customerMessage.trim() || sendingMessage}
                onPress={() => void sendMessage()}
              >
                <Ionicons name="send" size={15} color="#ffffff" />
                <Text style={styles.sendMessageText}>Send</Text>
              </Pressable>
            </View>
            {sentMessages.length > 0 ? (
              <View style={styles.sentMessages}>
                {sentMessages.map((message) => (
                  <Text key={message} style={[styles.sentMessageText, { color: palette.subtleText }]} numberOfLines={1}>
                    Sent: {message}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.photoHeader}>
            <View>
              <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Photos</Text>
              <Text style={[styles.infoSub, { color: palette.subtleText }]}>
                {photos.length} attached
              </Text>
            </View>
            <Pressable
              style={[styles.photoAddButton, { borderColor: palette.accent }]}
              onPress={() => {
                setPhotoDraft(photos);
                setPhotoPickerVisible(true);
              }}
              disabled={uploadingPhotos}
            >
              {uploadingPhotos ? (
                <ActivityIndicator color={palette.accent} size="small" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={16} color={palette.accent} />
                  <Text style={[styles.photoAddText, { color: palette.accent }]}>Add</Text>
                </>
              )}
            </Pressable>
          </View>
          {photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photoThumb} />
              ))}
            </View>
          ) : (
            <View style={[styles.photoEmpty, { borderColor: cardBorder }]}>
              <Ionicons name="images-outline" size={22} color={palette.subtleText} />
              <Text style={[styles.photoEmptyText, { color: palette.subtleText }]}>
                Add job site photos or receipts.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionsSection}>
          {nextStatus ? (
            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: STATUS_META[nextStatus].color, opacity: updating ? 0.6 : 1 },
              ]}
              onPress={handleAdvance}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name={STATUS_META[nextStatus].icon as any} size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Mark as {STATUS_META[nextStatus].label}</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {currentStatus !== 'completed' && currentStatus !== 'skipped' && currentStatus !== 'cancelled' ? (
            <View style={styles.secondaryRow}>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: '#ef4444' }]}
                onPress={handleIssue}
                disabled={updating}
              >
                <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                <Text style={[styles.secondaryBtnText, { color: '#ef4444' }]}>Issue</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: '#94a3b8' }]}
                onPress={handleSkip}
                disabled={updating}
              >
                <Ionicons name="play-skip-forward-outline" size={16} color="#94a3b8" />
                <Text style={[styles.secondaryBtnText, { color: '#94a3b8' }]}>Skip</Text>
              </Pressable>
            </View>
          ) : null}

          {currentStatus === 'completed' ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={24} color="#10b981" />
              <Text style={[styles.completedText, { color: '#10b981' }]}>Order Complete</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <PhotoPickerModal
        visible={photoPickerVisible}
        isDark={isDark}
        selectedPhotos={photoDraft}
        onClose={() => setPhotoPickerVisible(false)}
        onPhotosChange={setPhotoDraft}
        onSave={(nextPhotos) => {
          void handleSavePhotos(nextPhotos);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  statusBannerText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopName: { fontSize: 20, fontWeight: '800', flex: 1, marginRight: 8 },
  description: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  taskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  taskBadgeText: { fontSize: 11, fontWeight: '700' },

  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoBody: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  infoSub: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  customerCard: { gap: 14 },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  codeBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    minWidth: 74,
  },
  codeLabel: { fontSize: 9, fontWeight: '800' },
  codeText: { marginTop: 1, fontSize: 13, fontWeight: '900' },
  instructionsBox: { borderRadius: 14, padding: 12 },
  customerActions: { flexDirection: 'row', gap: 10 },
  customerAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  customerActionText: { fontSize: 13, fontWeight: '800' },

  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickMessageRail: { gap: 8, marginTop: 12 },
  quickMessageChip: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  quickMessageText: { fontSize: 12, fontWeight: '700' },
  messageInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  messageCount: { fontSize: 11, fontWeight: '700' },
  sendMessageButton: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  sendMessageText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  sentMessages: { marginTop: 10, gap: 4 },
  sentMessageText: { fontSize: 11 },

  actionsSection: { gap: 12, marginTop: 4 },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  photoAddButton: {
    minWidth: 72,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  photoAddText: { fontSize: 13, fontWeight: '700' },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  photoThumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  photoEmpty: {
    marginTop: 12,
    minHeight: 82,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  photoEmptyText: { fontSize: 12, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  completedText: { fontSize: 16, fontWeight: '700' },
});
