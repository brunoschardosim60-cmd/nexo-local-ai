'use client';
/* oxlint-disable react/react-compiler */

import { useEffect, useState } from 'react';
import type { Effort } from '@/lib/nexo/types';

const EFFORTS: Effort[] = ['Baixo', 'Médio', 'Alto', 'Extra alto'];
export type ImageQuality = 'FAST' | 'BALANCED' | 'HIGH' | 'MAX';

export function useComposerState() {
  const [mode, setMode] = useState('Geral');
  const [effort, setEffort] = useState<Effort>('Médio');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('BALANCED');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activityLabel, setActivityLabel] = useState('Preparando a resposta…');
  const [notice, setNotice] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const storedEffort = localStorage.getItem('nexo-effort') as Effort | null;
    if (storedEffort && EFFORTS.includes(storedEffort)) setEffort(storedEffort);
  }, []);

  return {
    mode,
    setMode,
    effort,
    setEffort,
    imageQuality,
    setImageQuality,
    prompt,
    setPrompt,
    loading,
    setLoading,
    activityLabel,
    setActivityLabel,
    notice,
    setNotice,
    webSearch,
    setWebSearch,
    dragActive,
    setDragActive,
  };
}
