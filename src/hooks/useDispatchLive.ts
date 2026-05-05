import { useEffect, useState, useRef, useCallback } from 'react';
import {
  DbConnection,
  tables as dispatchTables,
} from '@/lib/spacetime/dispatch/module_bindings';
import type { DriverLocation, DispatchEvent } from '@/lib/spacetime/dispatch/module_bindings/types';
import {
  SPACETIME_DISPATCH_URI,
  getSpacetimeDispatchConfig,
} from '@/lib/spacetime/dispatch/config';

export type LiveDriverLocation = {
  driverUuid: string;
  routeUuid: string | null;
  currentLocation: { lat: number; lng: number };
  speedMps: number;
  speedMph: number;
  heading: number;
  accuracyMeters: number;
  hardBrake: boolean;
  crashDetected: boolean;
  fallDetected: boolean;
  recordedAt: string;
};

export type LiveDispatchEvent = {
  eventId: string;
  routeUuid: string;
  stopUuid: string;
  driverUuid: string;
  eventType: string;
  status: string;
  message: string;
  recordedAt: string;
};

function toLocation(row: DriverLocation): LiveDriverLocation {
  return {
    driverUuid: row.driverUuid,
    routeUuid: row.routeUuid.trim() ? row.routeUuid : null,
    currentLocation: { lat: row.latitude, lng: row.longitude },
    speedMps: row.speedMps,
    speedMph: row.speedMps * 2.23694,
    heading: row.heading,
    accuracyMeters: row.accuracyMeters,
    hardBrake: row.hardBrake,
    crashDetected: row.crashDetected,
    fallDetected: row.fallDetected,
    recordedAt: row.recordedAt,
  };
}

function toEvent(row: DispatchEvent): LiveDispatchEvent {
  return {
    eventId: row.eventId,
    routeUuid: row.routeUuid,
    stopUuid: row.stopUuid,
    driverUuid: row.driverUuid,
    eventType: row.eventType,
    status: row.status,
    message: row.message,
    recordedAt: row.recordedAt,
  };
}

/**
 * Subscribe to realtime dispatch data from SpacetimeDB.
 * Provides live driver locations and dispatch events filtered by vendorId.
 */
export function useDispatchLive(vendorId: number | null | undefined) {
  const [locations, setLocations] = useState<Record<string, LiveDriverLocation>>({});
  const [events, setEvents] = useState<LiveDispatchEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<DbConnection | null>(null);

  useEffect(() => {
    if (!vendorId) {
      setLocations({});
      setEvents([]);
      setConnected(false);
      return;
    }

    let mounted = true;

    const syncLocations = (conn: DbConnection) => {
      if (!mounted) return;
      const next: Record<string, LiveDriverLocation> = {};
      for (const row of conn.db.driverLocation.iter()) {
        next[row.driverUuid] = toLocation(row);
      }
      setLocations(next);
      setError(null);
    };

    const syncEvents = (conn: DbConnection) => {
      if (!mounted) return;
      const all: LiveDispatchEvent[] = [];
      for (const row of conn.db.dispatchEvent.iter()) {
        all.push(toEvent(row));
      }
      // Sort newest first
      all.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      setEvents(all);
    };

    try {
      const config = getSpacetimeDispatchConfig();

      const conn = DbConnection.builder()
        .withUri(config.uri)
        .withDatabaseName(config.database)
        .onConnect((conn) => {
          if (!mounted) return;
          setConnected(true);

          // Listen for row changes
          conn.db.driverLocation.onInsert(() => syncLocations(conn));
          conn.db.driverLocation.onUpdate(() => syncLocations(conn));
          conn.db.driverLocation.onDelete(() => syncLocations(conn));

          conn.db.dispatchEvent.onInsert(() => syncEvents(conn));
          conn.db.dispatchEvent.onDelete(() => syncEvents(conn));

          // Subscribe to driver_location filtered by vendor
          conn
            .subscriptionBuilder()
            .onApplied(() => {
              syncLocations(conn);
              syncEvents(conn);
            })
            .onError(() => {
              if (!mounted) return;
              setError('Dispatch subscription failed');
            })
            .subscribe(
              dispatchTables.driverLocation.where((row) => row.vendorId.eq(vendorId)),
              dispatchTables.dispatchEvent.where((row) => row.vendorId.eq(vendorId))
            );
        })
        .onConnectError(() => {
          if (!mounted) return;
          setConnected(false);
          setError('Failed to connect to dispatch');
        })
        .onDisconnect(() => {
          if (!mounted) return;
          setConnected(false);
        })
        .build();

      connectionRef.current = conn;
    } catch {
      if (mounted) {
        setError('Failed to start dispatch connection');
      }
    }

    return () => {
      mounted = false;
      connectionRef.current?.disconnect();
      connectionRef.current = null;
    };
  }, [vendorId]);

  return { locations, events, connected, error };
}
