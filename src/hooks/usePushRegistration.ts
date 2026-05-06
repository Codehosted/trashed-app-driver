import { useEffect, useState } from 'react';
import { registerForPushNotificationsAsync, PushRegistration } from '@/services/notifications';

export function usePushRegistration(enabled = true) {
  const [registration, setRegistration] = useState<PushRegistration>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setRegistration({ status: 'idle' });
      return;
    }

    let cancelled = false;
    (async () => {
      setRegistration({ status: 'requesting' });
      const result = await registerForPushNotificationsAsync();
      if (!cancelled) {
        setRegistration(result);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return registration;
}
