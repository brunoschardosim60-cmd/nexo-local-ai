'use client';
/* oxlint-disable react/react-compiler */

import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/lib/nexo/types';

export function useInterfaceState() {
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<ChatMessage | null>(
    null,
  );
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  useEffect(() => {
    const storedTheme = localStorage.getItem('nexo-theme');
    const nextTheme =
      storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : 'system';
    const resolvedTheme =
      nextTheme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : nextTheme;
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || theme !== 'system') return;
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = (event: MediaQueryListEvent | MediaQueryList) =>
      document.documentElement.classList.toggle('dark', event.matches);
    applySystemTheme(preference);
    preference.addEventListener('change', applySystemTheme);
    return () => preference.removeEventListener('change', applySystemTheme);
  }, [mounted, theme]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  function toggleTheme() {
    const next =
      theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    const resolved =
      next === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : next;
    setTheme(next);
    localStorage.setItem('nexo-theme', next);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }

  return {
    mounted,
    profileOpen,
    setProfileOpen,
    securityOpen,
    setSecurityOpen,
    personalOpen,
    setPersonalOpen,
    capabilityOpen,
    setCapabilityOpen,
    commandOpen,
    setCommandOpen,
    mobileOpen,
    setMobileOpen,
    selectedArtifact,
    setSelectedArtifact,
    theme,
    toggleTheme,
  };
}
