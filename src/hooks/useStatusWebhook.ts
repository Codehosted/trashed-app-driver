import { useCallback } from 'react';

interface StatusWebhookPayload {
  driverUuid: string;
  routeUuid: string;
  status: 'assigned' | 'in_progress' | 'arrived' | 'completed';
}

export function useStatusWebhook(endpoint: string) {
  return useCallback(
    async (payload: StatusWebhookPayload) => {
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.warn('Webhook failed', error);
      }
    },
    [endpoint]
  );
}
