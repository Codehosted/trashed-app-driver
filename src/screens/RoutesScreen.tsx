import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '@/types/navigation';
import { AppMessage, RouteAssignment, RouteStop } from '@/types/domain';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import * as dispatchService from '@/services/dispatch';
import type { MobileDispatchResponse } from '@/services/dispatch';
import { useDispatchLive, type LiveDispatchEvent } from '@/hooks/useDispatchLive';
import { BrandLogo } from '@/components/BrandLogo';
import { MobileDock } from '@/components/MobileDock';
import { NotificationToast } from '@/components/NotificationToast';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DATE_STRIP_RADIUS = 60;
const DATE_PILL_WIDTH = 64;
const DATE_PILL_GAP = 12;
const DATE_PILL_INTERVAL = DATE_PILL_WIDTH + DATE_PILL_GAP;
const LIVE_EVENT_TYPES = new Set(['route_assigned', 'route_updated', 'route_status', 'route_reordered']);

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

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDumpsterLabel(stop: RouteStop): string | null {
  const parts = [stop.dumpsterSize, stop.dumpsterType].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : null;
}

function formatEventTitle(eventType: string): string {
  switch (eventType) {
    case 'route_assigned':
      return 'New Route Assigned';
    case 'route_updated':
      return 'Route Updated';
    case 'route_status':
      return 'Route Status Updated';
    case 'route_reordered':
      return 'Route Order Updated';
    default:
      return 'Dispatch Update';
  }
}

function mapLiveEventToMessage(event: LiveDispatchEvent): AppMessage | null {
  if (!LIVE_EVENT_TYPES.has(event.eventType)) return null;

  return {
    id: event.eventId,
    type: event.eventType === 'route_status' ? 'warning' : 'info',
    title: formatEventTitle(event.eventType),
    content: event.message || 'Dispatch updated your route.',
    time: event.recordedAt,
  };
}

type StopListItem = RouteStop & {
  routeUuid: string;
  routeLabel: string;
};

export const RoutesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
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
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{ title: string; body: string } | null>(null);

  const requestIdRef = useRef(0);
  const dateListRef = useRef<FlatList<Date>>(null);
  const hapticIndexRef = useRef(initialDateIndex);
  const liveStartedAtRef = useRef(Date.now());
  const seenLiveEventIdsRef = useRef(new Set<string>());

  const { connected: liveConnected, events: liveEvents } = useDispatchLive(dispatchUser?.vendorId);

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
  const activeRoute = useMemo(
    () => routes.find((route) => route.status === 'in_progress') ?? routes[0] ?? null,
    [routes]
  );
  const completedStops = useMemo(
    () => allStops.filter((stop) => stop.status === 'completed').length,
    [allStops]
  );
  const nextStop = useMemo(
    () => allStops.find((stop) => !['completed', 'skipped', 'cancelled'].includes(stop.status)) ?? null,
    [allStops]
  );

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

  useEffect(() => {
    liveStartedAtRef.current = Date.now();
    seenLiveEventIdsRef.current.clear();
  }, [dispatchUser?.vendorId]);

  useEffect(() => {
    if (!dispatchUser?.vendorId || liveEvents.length === 0) return;

    const nextMessages: AppMessage[] = [];
    for (const event of liveEvents) {
      if (seenLiveEventIdsRef.current.has(event.eventId)) continue;
      seenLiveEventIdsRef.current.add(event.eventId);

      const recordedAt = Date.parse(event.recordedAt);
      if (Number.isFinite(recordedAt) && recordedAt < liveStartedAtRef.current - 1000) {
        continue;
      }

      const message = mapLiveEventToMessage(event);
      if (message) {
        nextMessages.push(message);
      }
    }

    if (nextMessages.length === 0) return;

    setMessages((current) => {
      const nextIds = new Set(nextMessages.map((message) => message.id));
      return [
        ...nextMessages,
        ...current.filter((message) => !nextIds.has(message.id)),
      ].slice(0, 20);
    });
    setActiveNotification({
      title: nextMessages[0].title,
      body: nextMessages[0].content,
    });
    void loadDispatch(selectedDate, true);
  }, [dispatchUser?.vendorId, liveEvents, loadDispatch, selectedDate]);

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

  const openActiveMap = useCallback(() => {
    if (activeRoute) {
      navigation.navigate('Home', { route: activeRoute });
    }
  }, [activeRoute, navigation]);

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
            backgroundColor: isDark ? 'rgba(24, 26, 32, 0.96)' : '#ffffff',
            borderColor: isDark ? 'rgba(76, 82, 97, 0.58)' : '#dbe3ee',
          },
        ]}
        onPress={() => navigation.navigate('OrderDetail', { stop: item, routeUuid: item.routeUuid })}
      >
        <View style={styles.stopTimeline}>
          <View style={[styles.stopIconWrap, { backgroundColor: isPickup ? '#dbeafe' : '#fef3c7' }]}>
            <Ionicons name={icon as any} size={20} color={isPickup ? '#2563eb' : '#d97706'} />
          </View>
          <Text style={[styles.sequenceText, { color: palette.subtleText }]}>
            {String(item.sequence ?? '').padStart(2, '0')}
          </Text>
        </View>
        <View style={styles.stopContent}>
          <View style={styles.stopTopRow}>
            <Text style={[styles.stopName, { color: palette.text }]} numberOfLines={1}>
              {item.name || item.title || 'Stop'}
            </Text>
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
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
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
      <NotificationToast
        notification={activeNotification}
        onClose={() => setActiveNotification(null)}
      />
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0' }]}>
        <BrandLogo
          textColor={palette.text}
          accentColor={palette.accent}
          mutedColor={palette.subtleText}
          subtitle={dispatchUser?.vendorName ? dispatchUser.vendorName.toUpperCase() : 'DRIVER PORTAL'}
        />
        <View style={styles.headerRight}>
          <View style={styles.liveStatus}>
            <View style={[styles.liveDot, { backgroundColor: liveConnected ? '#10b981' : '#64748b' }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open messages"
            style={[styles.iconBtn, { borderColor: isDark ? 'rgba(76, 82, 97, 0.7)' : '#cbd5e1' }]}
            onPress={() => setMessagesOpen(true)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.subtleText} />
            {messages.length > 0 ? (
              <View style={[styles.notificationBadge, { backgroundColor: palette.accent }]}>
                <Text style={styles.notificationBadgeText}>{Math.min(messages.length, 9)}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile settings"
            style={[styles.iconBtn, { borderColor: isDark ? 'rgba(76, 82, 97, 0.7)' : '#cbd5e1' }]}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person" size={18} color={palette.subtleText} />
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
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => shiftDate(-1)}
            hitSlop={12}
            disabled={selectedDateIndex === 0}
            style={[
              styles.monthArrow,
              {
                backgroundColor: isDark ? '#181a20' : '#ffffff',
                borderColor: isDark ? '#262a33' : '#dbe3ee',
              },
              selectedDateIndex === 0 && styles.disabledArrow,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={palette.subtleText} />
          </Pressable>
          <View style={styles.monthCenter}>
            <Text style={[styles.monthKicker, { color: palette.subtleText }]}>Schedule</Text>
            <Text style={[styles.monthText, { color: palette.text }]}>{monthLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => shiftDate(1)}
            hitSlop={12}
            disabled={selectedDateIndex === dateStrip.length - 1}
            style={[
              styles.monthArrow,
              {
                backgroundColor: isDark ? '#181a20' : '#ffffff',
                borderColor: isDark ? '#262a33' : '#dbe3ee',
              },
              selectedDateIndex === dateStrip.length - 1 && styles.disabledArrow,
            ]}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${formatDateLabel(item)}`}
                  onPress={() => scrollToDateIndex(index)}
                  style={[
                    styles.dayPill,
                    isSelected && styles.dayPillSelected,
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
                      isSelected && styles.dayNameSelected,
                      { color: isSelected ? '#ffffff' : palette.subtleText },
                    ]}
                  >
                    {DAY_NAMES[item.getDay()]}
                  </Text>
                  <Text
                    style={[
                      styles.dayDate,
                      isSelected && styles.dayDateSelected,
                      { color: isSelected ? '#ffffff' : palette.text },
                    ]}
                  >
                    {item.getDate()}
                  </Text>
                  {isToday && !isSelected ? (
                    <Text style={[styles.todayMarker, { color: palette.accent }]}>TODAY</Text>
                  ) : null}
                  {isSelected ? <View style={styles.daySelectedNotch} /> : null}
                </Pressable>
              );
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[isDark ? '#111827' : '#f8fafc', isDark ? 'rgba(17, 24, 39, 0)' : 'rgba(248, 250, 252, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.carouselFade, styles.carouselFadeLeft]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[isDark ? 'rgba(17, 24, 39, 0)' : 'rgba(248, 250, 252, 0)', isDark ? '#111827' : '#f8fafc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.carouselFade, styles.carouselFadeRight]}
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {formatStopHeading(selectedDate, today)}
          </Text>
          {nextStop ? (
            <Text style={[styles.nextStopText, { color: palette.subtleText }]} numberOfLines={1}>
              Next: {nextStop.name || nextStop.title || 'Stop'}{nextStop.time ? ` at ${nextStop.time}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.sectionCountBlock}>
          <Text style={[styles.sectionCount, { color: palette.text }]}>
            {allStops.length}
          </Text>
          <Text style={[styles.sectionCountLabel, { color: palette.subtleText }]}>
            {allStops.length === 1 ? 'order' : 'orders'}
          </Text>
        </View>
      </View>

      {allStops.length > 0 ? (
        <View style={styles.summaryRail}>
          <View style={[styles.summaryChip, { backgroundColor: isDark ? '#181a20' : '#ffffff', borderColor: isDark ? '#262a33' : '#dbe3ee' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={palette.success} />
            <Text style={[styles.summaryChipText, { color: palette.text }]}>
              {completedStops}/{allStops.length} done
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open route map"
            style={[styles.summaryChip, { backgroundColor: palette.accent, borderColor: palette.accent }]}
            onPress={openActiveMap}
          >
            <Ionicons name="navigate-outline" size={16} color="#ffffff" />
            <Text style={[styles.summaryChipText, { color: '#ffffff' }]}>Open route</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={palette.subtleText} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading dispatch"
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

      <MobileDock
        active="orders"
        accentColor={palette.accent}
        textColor={palette.text}
        mutedColor={palette.subtleText}
        surfaceColor={isDark ? '#181a20' : '#ffffff'}
        borderColor={isDark ? '#262a33' : '#dbe3ee'}
        messageCount={messages.length}
        onOrders={() => scrollToDateIndex(selectedDateIndex)}
        onMap={openActiveMap}
        onMessages={() => setMessagesOpen(true)}
        onSettings={() => navigation.navigate('Profile')}
      />

      <Modal
        visible={messagesOpen}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setMessagesOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close messages"
            style={styles.modalScrim}
            onPress={() => setMessagesOpen(false)}
          />
          <View style={[styles.messagesSheet, { backgroundColor: isDark ? '#181a20' : '#ffffff' }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: palette.text }]}>Messages</Text>
                <Text style={[styles.sheetSubtitle, { color: palette.subtleText }]}>
                  Dispatch updates and route alerts
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close messages"
                style={styles.sheetClose}
                onPress={() => setMessagesOpen(false)}
              >
                <Ionicons name="close" size={18} color={palette.subtleText} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.messagesList}>
              {messages.length === 0 ? (
                <View style={[styles.messageEmpty, { borderColor: isDark ? '#262a33' : '#dbe3ee' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={palette.subtleText} />
                  <Text style={[styles.emptySubtitle, { color: palette.subtleText }]}>
                    No dispatch messages yet.
                  </Text>
                </View>
              ) : (
                messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      { borderColor: isDark ? '#262a33' : '#e2e8f0' },
                    ]}
                  >
                    <View
                      style={[
                        styles.messageIcon,
                        {
                          backgroundColor:
                            message.type === 'urgent'
                              ? '#fee2e2'
                              : message.type === 'warning'
                                ? '#fef3c7'
                                : `${palette.accent}16`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={message.type === 'urgent' ? 'warning' : 'information-circle'}
                        size={17}
                        color={message.type === 'urgent' ? '#ef4444' : message.type === 'warning' ? '#f59e0b' : palette.accent}
                      />
                    </View>
                    <View style={styles.messageRowText}>
                      <Text style={[styles.messageRowTitle, { color: palette.text }]}>{message.title}</Text>
                      <Text style={[styles.messageRowBody, { color: palette.subtleText }]}>{message.content}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveStatus: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },

  calendarWrap: { paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1 },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  monthArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenter: {
    minWidth: 132,
    alignItems: 'center',
  },
  disabledArrow: { opacity: 0.35 },
  monthKicker: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  monthText: { fontSize: 16, fontWeight: '900' },
  carouselViewport: { position: 'relative', minHeight: 88, justifyContent: 'center' },
  centerLock: {
    position: 'absolute',
    top: 10,
    bottom: 2,
    borderRadius: 22,
    borderWidth: 1,
  },
  dayPill: {
    width: DATE_PILL_WIDTH,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  dayPillSelected: {
    transform: [{ translateY: 5 }, { scale: 1.05 }],
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 7,
  },
  dayName: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  dayNameSelected: { fontSize: 11 },
  dayDate: { fontSize: 21, fontWeight: '900' },
  dayDateSelected: { fontSize: 27, lineHeight: 31 },
  todayMarker: {
    position: 'absolute',
    bottom: 5,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  daySelectedNotch: {
    position: 'absolute',
    bottom: -5,
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    opacity: 0.88,
  },
  carouselFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 4,
  },
  carouselFadeLeft: { left: 0 },
  carouselFadeRight: { right: 0 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 16,
  },
  sectionTitleBlock: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  nextStopText: { marginTop: 3, fontSize: 12 },
  sectionCountBlock: { alignItems: 'flex-end' },
  sectionCount: { fontSize: 20, fontWeight: '800' },
  sectionCountLabel: { fontSize: 11, fontWeight: '700' },
  summaryRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  summaryChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  summaryChipText: { fontSize: 12, fontWeight: '800' },

  listContent: { padding: 16, paddingBottom: 20 },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  stopTimeline: { alignItems: 'center', gap: 5, paddingTop: 1 },
  stopIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sequenceText: { fontSize: 10, fontWeight: '800' },
  stopContent: { flex: 1, gap: 4 },
  stopTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  dumpsterLine: { fontSize: 13, fontWeight: '600' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  messagesSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetSubtitle: { fontSize: 12, marginTop: 2 },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: { paddingTop: 16, gap: 10 },
  messageEmpty: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  messageIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageRowText: { flex: 1, minWidth: 0, gap: 3 },
  messageRowTitle: { fontSize: 14, fontWeight: '800' },
  messageRowBody: { fontSize: 12, lineHeight: 17 },
});
