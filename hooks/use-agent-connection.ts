'use client';

import { useEffect, useRef, useState } from 'react';
import {
  NEXO_SESSION_EXPIRED_EVENT,
  NexoClient,
} from '@/lib/nexo/client';
import type { AgentHealth, Chat, Effort, UserProfile } from '@/lib/nexo/types';

type RestorePayload = {
  chats: Chat[];
  profile?: Partial<UserProfile>;
};

export function useAgentConnection(
  onRestore: (payload: RestorePayload) => void,
) {
  const [online, setOnline] = useState(false);
  const [token, setToken] = useState('');
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const restoreRef = useRef(onRestore);

  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    let active = true;
    let currentToken = '';
    let initialized = false;
    let refreshPromise: Promise<void> | null = null;

    const refresh = (restore = false) => {
      if (refreshPromise) return refreshPromise;
      refreshPromise = new NexoClient()
        .health()
        .then(async (data: AgentHealth) => {
          if (!active) return;
          const tokenChanged = Boolean(
            currentToken && currentToken !== data.sessionToken,
          );
          currentToken = data.sessionToken;
          setOnline(true);
          setToken(data.sessionToken);
          setHealth(data);
          const client = new NexoClient(data.sessionToken);
          if (!initialized || tokenChanged) {
            const storedEffort = localStorage.getItem(
              'nexo-effort',
            ) as Effort | null;
            void client
              .warmRuntime(
                storedEffort &&
                  ['Baixo', 'Médio', 'Alto', 'Extra alto'].includes(
                    storedEffort,
                  )
                  ? storedEffort
                  : 'Médio',
              )
              .catch(() => undefined);
          }
          if (restore && !initialized) {
            const payload = await client.getSession();
            if (active && payload)
              restoreRef.current({
                chats: payload.session?.state?.chats ?? [],
                profile: payload.session?.state?.profile,
              });
          }
          initialized = true;
        })
        .catch(() => {
          if (!active) return;
          setOnline(false);
          setToken('');
          setHealth(null);
        })
        .finally(() => {
          refreshPromise = null;
        });
      return refreshPromise;
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const refreshAfterExpiredSession = () => void refresh();

    void refresh(true);
    const healthTimer = window.setInterval(() => void refresh(), 3_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener(
      NEXO_SESSION_EXPIRED_EVENT,
      refreshAfterExpiredSession,
    );

    return () => {
      active = false;
      window.clearInterval(healthTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener(
        NEXO_SESSION_EXPIRED_EVENT,
        refreshAfterExpiredSession,
      );
    };
  }, []);

  return {
    online,
    token,
    health,
    actionLoading,
    setActionLoading,
    setOnline,
    warmRuntime: (effort: Effort) =>
      token
        ? new NexoClient(token).warmRuntime(effort).catch(() => undefined)
        : Promise.resolve(),
  };
}
