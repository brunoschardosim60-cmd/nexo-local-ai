'use client';

import { useEffect, useState } from 'react';
import { NexoClient } from '@/lib/nexo/client';
import { safeParse } from '@/lib/nexo/page-helpers';
import type { Chat, UserProfile } from '@/lib/nexo/types';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Bruno',
  city: '',
  style: 'Natural, extrovertido, curioso e proativo',
  instructions: '',
};

type UserProfileOptions = {
  loadByCity: (city: string) => Promise<void>;
  setNotice: (notice: string) => void;
  closePanel: () => void;
};

export function useUserProfile(options: UserProfileOptions) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    const storedProfile = {
      ...DEFAULT_PROFILE,
      ...safeParse<Partial<UserProfile>>(
        localStorage.getItem('nexo-profile'),
        {},
      ),
    };
    if (
      !localStorage.getItem('nexo-personality-v2') &&
      storedProfile.style === 'Direto e amigável'
    ) {
      storedProfile.style = 'Natural, acolhedor e proativo';
      localStorage.setItem('nexo-profile', JSON.stringify(storedProfile));
      localStorage.setItem('nexo-personality-v2', '1');
    }
    setProfile(storedProfile);
    if (storedProfile.city) void options.loadByCity(storedProfile.city);
  }, []);

  function save(
    chats: Chat[],
    sync: (chats: Chat[], profile: UserProfile) => void,
  ) {
    localStorage.setItem('nexo-profile', JSON.stringify(profile));
    options.closePanel();
    sync(chats, profile);
    if (profile.city) void options.loadByCity(profile.city);
  }

  async function resetAdaptivePersonality(agentToken: string) {
    if (!agentToken) {
      options.setNotice('O Nexo Runtime está offline.');
      return;
    }
    try {
      await new NexoClient(agentToken).resetPersonality();
      options.setNotice(
        'Adaptação aprendida apagada. A identidade-base do Nexo foi mantida.',
      );
    } catch (error) {
      options.setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui apagar a adaptação.',
      );
    }
  }

  return { profile, setProfile, save, resetAdaptivePersonality };
}
