'use client';

import { useEffect, useRef, useState } from 'react';
import { NexoClient } from '@/lib/nexo/client';
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
  restoreRef.current = onRestore;

  useEffect(() => {
    let active = true;
    new NexoClient()
      .health()
      .then(async (data: AgentHealth) => {
        if (!active) return;
        setOnline(true);
        setToken(data.sessionToken);
        setHealth(data);
        const client = new NexoClient(data.sessionToken);
        const storedEffort = localStorage.getItem(
          'nexo-effort',
        ) as Effort | null;
        void client
          .warmRuntime(
            storedEffort &&
              ['Baixo', 'Médio', 'Alto', 'Extra alto'].includes(storedEffort)
              ? storedEffort
              : 'Médio',
          )
          .catch(() => undefined);
        const payload = await client.getSession();
        if (active && payload)
          restoreRef.current({
            chats: payload.session?.state?.chats ?? [],
            profile: payload.session?.state?.profile,
          });
      })
      .catch(() => {
        if (!active) return;
        setOnline(false);
        setToken('');
        setHealth(null);
      });
    return () => {
      active = false;
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
