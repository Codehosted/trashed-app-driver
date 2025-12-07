import { useEffect, useState } from 'react';
import { registerForPushNotificationsAsync, PushRegistration } from '@/services/notifications';

export function usePushRegistration() {
  const [registration, setRegistration] = useState<PushRegistration>({ status: 'idle' });

  useEffect(() => {
    (async () => {
      setRegistration({ status: 'requesting' });
      const result = await registerForPushNotificationsAsync();
      setRegistration(result);
    })();
  }, []);

  return registration;
}
