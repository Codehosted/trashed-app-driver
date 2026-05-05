import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

export const OrderDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { stop, routeUuid } = route.params;
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];
  const isDark = theme === 'dark';

  const [currentStatus, setCurrentStatus] = useState<RouteStopStatus>(stop.status);
  const [notes, setNotes] = useState(stop.notes || '');
  const [updating, setUpdating] = useState(false);

  const statusMeta = STATUS_META[currentStatus] || STATUS_META.pending;
  const taskMeta = TASK_LABELS[stop.taskType || 'service'] || TASK_LABELS.service;
  const currentIdx = STATUS_FLOW.indexOf(currentStatus);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentIdx + 1]
    : null;

  const cardBg = isDark ? 'rgba(31, 41, 55, 0.9)' : '#ffffff';
  const cardBorder = isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0';
  const dumpsterLabel = [stop.dumpsterSize, stop.dumpsterType].filter(Boolean).join(' • ');
  const etaLabel = stop.eta || stop.time || null;
  const travelLabel = [formatDurationShort(stop.travelDurationSeconds), formatDistanceShort(stop.travelDistanceMeters)]
    .filter(Boolean)
    .join(' • ');
  const remainingLabel = [formatDurationShort(stop.remainingDurationSeconds), formatDistanceShort(stop.remainingDistanceMeters)]
    .filter(Boolean)
    .join(' • ');
  const routeTotalsLabel = [formatDurationShort(stop.routeDurationSeconds), formatDistanceShort(stop.routeDistanceMeters)]
    .filter(Boolean)
    .join(' • ');

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
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

        {(etaLabel || travelLabel || remainingLabel || routeTotalsLabel) ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color={palette.accent} />
              <View style={styles.infoBody}>
                <Text style={[styles.infoLabel, { color: palette.subtleText }]}>Timing</Text>
                {etaLabel ? (
                  <Text style={[styles.infoValue, { color: palette.text }]}>ETA {etaLabel}</Text>
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
                {routeUuid.slice(0, 8)}…
                {stop.sequence != null ? `  •  Stop #${stop.sequence}` : ''}
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
            placeholder="Add notes about this stop…"
            placeholderTextColor={palette.subtleText}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
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

  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
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

  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },

  actionsSection: { gap: 12, marginTop: 4 },
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
