import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '@/types/navigation';
import { AppMessage, RouteAssignment, RouteStop } from '@/types/domain';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import * as dispatchService from '@/services/dispatch';
import type { MobileDispatchResponse } from '@/services/dispatch';
import { useDispatchLive } from '@/hooks/useDispatchLive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DATE_STRIP_RADIUS = 60;
const DATE_PILL_WIDTH = 58;
const DATE_PILL_GAP = 10;
const DATE_PILL_INTERVAL = DATE_PILL_WIDTH + DATE_PILL_GAP;

const stopStatusColors: Record<string, string> = {
  pending: '#64748b',
  en_route: '#3b82f6',
  'in-transit': '#3b82f6',
  arrived: '#f59e0b',
  completed: '#10b981',
  skipped: '#94a3b8',
  cancelled: '#ef4444',
  issue: '#ef4444',
};

const stopStatusLabels: Record<string, string> = {
  pending: 'Pending',
  en_route: 'En Route',
  'in-transit': 'In Transit',
  arrived: 'Arrived',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  issue: 'Issue',
};

const taskTypeIcons: Record<string, string> = {
  'drop-off': 'arrow-down-circle',
  'pick-up': 'arrow-up-circle',
  swap: 'swap-horizontal',
  service: 'construct',
};

function startOfDay(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildDateStrip(centerDate: Date, radius: number): Date[] {
  const start = addDays(centerDate, -radius);
  return Array.from({ length: radius * 2 + 1 }, (_, index) =>
    startOfDay(addDays(start, index))
  );
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

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

function formatStopHeading(date: Date, today: Date): string {
  if (isSameDay(date, today)) {
    return "Today's Orders";
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDumpsterLabel(stop: RouteStop): string | null {
  const parts = [stop.dumpsterSize, stop.dumpsterType].filter(Boolean);
  return parts.length > 0 ? parts.join(' • ') : null;
}

type StopListItem = RouteStop & {
  routeUuid: string;
  routeLabel: string;
};

export const RoutesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { logout } = useAuth();
  const { theme } = usePreferences();
  const { width: screenWidth } = useWindowDimensions();
  const palette = designSchema.theme[theme];
  const isDark = theme === 'dark';

  const today = useMemo(() => startOfDay(new Date()), []);
  const dateStrip = useMemo(() => buildDateStrip(today, DATE_STRIP_RADIUS), [today]);
  const initialDateIndex = DATE_STRIP_RADIUS;
  const [selectedDate, setSelectedDate] = useState(dateStrip[initialDateIndex]);
  const [routes, setRoutes] = useState<RouteAssignment[]>([]);
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [dispatchUser, setDispatchUser] = useState<MobileDispatchResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const dateListRef = useRef<FlatList<Date>>(null);
  const hapticIndexRef = useRef(initialDateIndex);

  const { connected: liveConnected } = useDispatchLive(dispatchUser?.vendorId);

  const selectedDateIndex = useMemo(
    () => Math.max(0, dateStrip.findIndex((day) => isSameDay(day, selectedDate))),
    [dateStrip, selectedDate]
  );
  const monthLabel = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  const dateStripPadding = Math.max((screenWidth - DATE_PILL_WIDTH) / 2, 16);

  const allStops = useMemo(() => {
    const stops: StopListItem[] = [];
    for (const route of routes) {
      for (const stop of route.stops) {
        stops.push({ ...stop, routeUuid: route.uuid, routeLabel: route.label });
      }
    }
    return stops;
  }, [routes]);

  const loadDispatch = useCallback(async (date: Date, isRefresh = false) => {
    const requestId = ++requestIdRef.current;

    try {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      const data = await dispatchService.fetchMobileDispatch(date);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setRoutes(data.routes);
      setMessages(data.messages);
      setDispatchUser(data.user);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load routes');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDispatch(selectedDate);
  }, [selectedDate, loadDispatch]);

  const setCenteredDate = useCallback((nextIndex: number, withHaptics: boolean) => {
    const clampedIndex = clampIndex(nextIndex, dateStrip.length - 1);
    if (clampedIndex === hapticIndexRef.current) {
      return;
    }

    hapticIndexRef.current = clampedIndex;
    setSelectedDate(dateStrip[clampedIndex]);

    if (withHaptics) {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [dateStrip]);

  const scrollToDateIndex = useCallback((nextIndex: number, animated: boolean = true) => {
    const clampedIndex = clampIndex(nextIndex, dateStrip.length - 1);
    dateListRef.current?.scrollToOffset({
      offset: clampedIndex * DATE_PILL_INTERVAL,
      animated,
    });
    setCenteredDate(clampedIndex, animated);
  }, [dateStrip.length, setCenteredDate]);

  const shiftDate = useCallback((direction: -1 | 1) => {
    scrollToDateIndex(selectedDateIndex + direction);
  }, [scrollToDateIndex, selectedDateIndex]);

  const handleDateScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / DATE_PILL_INTERVAL);
    setCenteredDate(rawIndex, true);
  }, [setCenteredDate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDispatch(selectedDate, true);
  }, [loadDispatch, selectedDate]);

  const renderStop = ({ item }: { item: StopListItem }) => {
    const statusColor = stopStatusColors[item.status] || '#64748b';
    const statusLabel = stopStatusLabels[item.status] || item.status;
    const icon = taskTypeIcons[item.taskType || 'service'] || 'ellipse';
    const isPickup = item.taskType === 'pick-up';
    const dumpsterLabel = formatDumpsterLabel(item);
    const travelLabel = formatDurationShort(item.travelDurationSeconds);
    const timeLabel = item.eta || item.time;

    return (
      <Pressable
        style={[
          styles.stopCard,
          {
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : '#ffffff',
            borderColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0',
          },
        ]}
        onPress={() => navigation.navigate('OrderDetail', { stop: item, routeUuid: item.routeUuid })}
      >
        <View style={[styles.stopIconWrap, { backgroundColor: isPickup ? '#dbeafe' : '#fef3c7' }]}>
          <Ionicons name={icon as any} size={20} color={isPickup ? '#2563eb' : '#d97706'} />
        </View>
        <View style={styles.stopContent}>
          <View style={styles.stopTopRow}>
            <Text style={[styles.stopName, { color: palette.text }]} numberOfLines={1}>
              {item.name || item.title || 'Stop'}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          </View>

          {dumpsterLabel ? (
            <Text style={[styles.dumpsterLine, { color: palette.text }]} numberOfLines={1}>
              {dumpsterLabel}
            </Text>
          ) : null}

          <Text style={[styles.stopAddress, { color: palette.subtleText }]} numberOfLines={1}>
            {item.address}
          </Text>

          <View style={styles.stopMeta}>
            {item.taskType ? (
              <Text style={[styles.taskTypeBadge, { color: isPickup ? '#2563eb' : '#d97706' }]}>
                {item.taskType.toUpperCase()}
              </Text>
            ) : null}

            {timeLabel ? (
              <Text style={[styles.stopTime, { color: palette.subtleText }]}>{timeLabel}</Text>
            ) : null}

            {travelLabel ? (
              <Text style={[styles.stopTime, { color: palette.subtleText }]}>Drive {travelLabel}</Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.subtleText} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0' }]}>
        <View>
          <Text style={[styles.brandTitle, { color: palette.text }]}>
            trash<Text style={{ color: palette.accent }}>ed</Text>
          </Text>
          <Text style={[styles.brandSubtitle, { color: palette.subtleText }]}>DRIVER PORTAL</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.liveDot, { backgroundColor: liveConnected ? '#10b981' : '#64748b' }]} />
          <Pressable
            style={[styles.iconBtn, { borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : '#cbd5e1' }]}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person" size={18} color={palette.subtleText} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : '#cbd5e1' }]}
            onPress={logout}
          >
            <Ionicons name="log-out-outline" size={18} color={palette.subtleText} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.calendarWrap,
          {
            backgroundColor: isDark ? '#111827' : '#f8fafc',
            borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0',
          },
        ]}
      >
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => shiftDate(-1)}
            hitSlop={12}
            disabled={selectedDateIndex === 0}
            style={selectedDateIndex === 0 ? styles.disabledArrow : undefined}
          >
            <Ionicons name="chevron-back" size={20} color={palette.subtleText} />
          </Pressable>
          <Text style={[styles.monthText, { color: palette.text }]}>{monthLabel}</Text>
          <Pressable
            onPress={() => shiftDate(1)}
            hitSlop={12}
            disabled={selectedDateIndex === dateStrip.length - 1}
            style={selectedDateIndex === dateStrip.length - 1 ? styles.disabledArrow : undefined}
          >
            <Ionicons name="chevron-forward" size={20} color={palette.subtleText} />
          </Pressable>
        </View>

        <View style={styles.carouselViewport}>
          <View
            pointerEvents="none"
            style={[
              styles.centerLock,
              {
                left: dateStripPadding,
                width: DATE_PILL_WIDTH,
                borderColor: isDark ? 'rgba(96, 165, 250, 0.45)' : 'rgba(59, 130, 246, 0.22)',
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.22)' : 'rgba(255, 255, 255, 0.55)',
              },
            ]}
          />
          <FlatList
            ref={dateListRef}
            data={dateStrip}
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator={false}
            snapToInterval={DATE_PILL_INTERVAL}
            decelerationRate="fast"
            disableIntervalMomentum
            initialScrollIndex={initialDateIndex}
            getItemLayout={(_, index) => ({
              length: DATE_PILL_INTERVAL,
              offset: DATE_PILL_INTERVAL * index,
              index,
            })}
            keyExtractor={(item) => item.toISOString()}
            onScroll={handleDateScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: dateStripPadding }}
            ItemSeparatorComponent={() => <View style={{ width: DATE_PILL_GAP }} />}
            renderItem={({ item, index }) => {
              const isSelected = index === selectedDateIndex;
              const isToday = isSameDay(item, today);

              return (
                <Pressable
                  onPress={() => scrollToDateIndex(index)}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: isSelected
                        ? palette.accent
                        : isDark ? 'rgba(31, 41, 55, 0.82)' : '#ffffff',
                      borderColor: isSelected
                        ? palette.accent
                        : isToday
                          ? palette.accent
                          : isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0',
                      borderWidth: isToday && !isSelected ? 2 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayName,
                      { color: isSelected ? '#ffffff' : palette.subtleText },
                    ]}
                  >
                    {DAY_NAMES[item.getDay()]}
                  </Text>
                  <Text
                    style={[
                      styles.dayDate,
                      { color: isSelected ? '#ffffff' : palette.text },
                    ]}
                  >
                    {item.getDate()}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          {formatStopHeading(selectedDate, today)}
        </Text>
        <Text style={[styles.sectionCount, { color: palette.subtleText }]}>
          {allStops.length} {allStops.length === 1 ? 'order' : 'orders'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={palette.subtleText} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: palette.accent }]}
            onPress={() => loadDispatch(selectedDate)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : allStops.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={48} color={palette.success} />
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No orders</Text>
          <Text style={[styles.emptySubtitle, { color: palette.subtleText }]}>
            No orders scheduled for this day.
          </Text>
        </View>
      ) : (
        <FlatList
          data={allStops}
          keyExtractor={(item) => `${item.routeUuid}-${item.uuid || item.id}`}
          renderItem={renderStop}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.accent}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {messages.length > 0 ? (
        <View
          style={[
            styles.messageBanner,
            {
              backgroundColor: isDark ? '#1e293b' : '#fefce8',
              borderTopColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#fde68a',
            },
          ]}
        >
          <Ionicons
            name={messages[0].type === 'urgent' ? 'warning' : 'information-circle'}
            size={16}
            color={messages[0].type === 'urgent' ? '#ef4444' : '#f59e0b'}
          />
          <Text style={[styles.messageText, { color: palette.text }]} numberOfLines={1}>
            {messages[0].title}: {messages[0].content}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  calendarWrap: { paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1 },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  disabledArrow: { opacity: 0.35 },
  monthText: { fontSize: 16, fontWeight: '700' },
  carouselViewport: { position: 'relative', minHeight: 72, justifyContent: 'center' },
  centerLock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
  },
  dayPill: {
    width: DATE_PILL_WIDTH,
    height: 64,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  dayName: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayDate: { fontSize: 20, fontWeight: '700' },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionCount: { fontSize: 13 },

  listContent: { padding: 16 },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  stopIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopContent: { flex: 1, gap: 4 },
  stopTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  dumpsterLine: { fontSize: 13, fontWeight: '600' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  stopAddress: { fontSize: 12 },
  stopMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  taskTypeBadge: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  stopTime: { fontSize: 11 },

  errorText: { fontSize: 14, textAlign: 'center' },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#ffffff', fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },

  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  messageText: { fontSize: 13, flex: 1 },
});
