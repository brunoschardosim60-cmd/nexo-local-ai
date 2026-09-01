'use client';

import { useEffect, useRef, useState } from 'react';
import type { LivingEyeState } from '@/components/nexo/nexo-living-eye';
import { useSpeechOutput } from '@/hooks/use-speech-output';
import { NexoClient } from '@/lib/nexo/client';

type SpeechResult = { 0: { transcript: string }; isFinal?: boolean };
type SpeechResultEvent = {
  resultIndex?: number;
  results: ArrayLike<SpeechResult>;
};
type LocalSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous?: boolean;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => LocalSpeechRecognition;
  webkitSpeechRecognition?: new () => LocalSpeechRecognition;
};
type VoiceModeOptions = {
  agentOnline: boolean;
  agentToken: string;
  loading: boolean;
  mode: string;
  onPromptChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onNotice: (value: string) => void;
};

export function useVoiceMode(options: VoiceModeOptions) {
  const [listening, setListening] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceConversation, setVoiceConversation] = useState(true);
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voicePreviewState, setVoicePreviewState] =
    useState<LivingEyeState | null>(null);
  const [voicePreviewLevel, setVoicePreviewLevel] = useState<number | null>(
    null,
  );
  const recognitionRef = useRef<LocalSpeechRecognition | null>(null);
  const voiceModeRef = useRef(false);
  const voiceConversationRef = useRef(true);
  const voiceOutputRef = useRef(false);
  const listeningRef = useRef(false);
  const loadingRef = useRef(false);
  const restartTimerRef = useRef(0);
  const finalSpeechRef = useRef('');
  const optionsRef = useRef(options);

  optionsRef.current = options;
  voiceModeRef.current = voiceModeOpen;
  voiceConversationRef.current = voiceConversation;
  voiceOutputRef.current = voiceOutput;
  listeningRef.current = listening;
  loadingRef.current = options.loading;

  const speech = useSpeechOutput({
    enabled: voiceOutput,
    agentToken: options.agentToken,
    onFinished: () => scheduleListening(280),
  });
  const eyeState: LivingEyeState =
    voicePreviewState ??
    (!options.agentOnline
      ? 'offline'
      : listening
        ? 'listening'
        : speech.speaking
          ? 'speaking'
          : options.loading
            ? options.mode === 'Agente'
              ? 'working'
              : 'thinking'
            : 'idle');

  useEffect(() => {
    setVoiceConversation(
      localStorage.getItem('nexo-voice-conversation') !== 'off',
    );
    const params = new URLSearchParams(window.location.search);
    const previewState = params.get('voice-eye-state') as LivingEyeState | null;
    const previewLevel = Number(params.get('voice-eye-level'));
    if (params.has('voice-eye-level') && Number.isFinite(previewLevel))
      setVoicePreviewLevel(Math.min(1, Math.max(0, previewLevel)));
    if (
      previewState &&
      [
        'idle',
        'listening',
        'understanding',
        'thinking',
        'speaking',
        'working',
        'success',
        'error',
        'offline',
        'resting',
      ].includes(previewState)
    ) {
      setVoicePreviewState(previewState);
      setVoiceModeOpen(true);
    }
    return () => {
      recognitionRef.current?.stop();
      window.clearTimeout(restartTimerRef.current);
      speech.dispose();
    };
  }, []);

  function scheduleListening(delay = 360) {
    window.clearTimeout(restartTimerRef.current);
    if (
      !voiceModeRef.current ||
      !voiceConversationRef.current ||
      voicePreviewState !== null
    )
      return;
    restartTimerRef.current = window.setTimeout(() => {
      if (!listeningRef.current && !loadingRef.current && !speech.isBusy())
        start();
    }, delay);
  }

  function start() {
    if (listeningRef.current) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      optionsRef.current.onNotice(
        'O reconhecimento de voz não está disponível neste navegador.',
      );
      return;
    }
    if (speech.isBusy()) speech.interrupt();
    finalSpeechRef.current = '';
    setVoiceInterim('');
    const { agentToken } = optionsRef.current;
    if (agentToken)
      void new NexoClient(agentToken)
        .updatePresence({ action: 'barge-in' })
        .catch(() => undefined);
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      if (!loadingRef.current && !speech.isBusy()) scheduleListening(520);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      scheduleListening(850);
    };
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (
        let index = event.resultIndex ?? 0;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() || '';
        if (!transcript) continue;
        if (result.isFinal === false) interim += `${transcript} `;
        else final += `${transcript} `;
      }
      const visible = (final || interim).trim();
      if (visible) {
        setVoiceInterim(visible);
        optionsRef.current.onPromptChange(visible);
      }
      const finalText = final.trim();
      if (finalText && finalText !== finalSpeechRef.current) {
        finalSpeechRef.current = finalText;
        setVoiceInterim('');
        recognition.stop();
        optionsRef.current.onSubmit(finalText);
      }
    };
    recognition.start();
  }

  function stop() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    speech.interrupt();
    window.clearTimeout(restartTimerRef.current);
    setListening(false);
    setVoiceInterim('');
    const { agentToken } = optionsRef.current;
    if (agentToken)
      void new NexoClient(agentToken).killPresence().catch(() => undefined);
  }

  function setOpen(open: boolean) {
    voiceModeRef.current = open;
    setVoiceModeOpen(open);
    if (!open) stop();
  }

  function setConversation(enabled: boolean) {
    voiceConversationRef.current = enabled;
    setVoiceConversation(enabled);
    localStorage.setItem('nexo-voice-conversation', enabled ? 'on' : 'off');
    if (enabled) scheduleListening(220);
  }

  function setOutput(enabled: boolean) {
    voiceOutputRef.current = enabled;
    setVoiceOutput(enabled);
    if (!enabled) speech.interrupt();
  }

  return {
    state: {
      listening,
      voiceOutput,
      voiceModeOpen,
      voiceConversation,
      voiceInterim,
      voiceCaption: speech.caption,
      voiceOutputLevel: speech.level,
      voicePreviewState,
      voicePreviewLevel,
      eyeState,
    },
    start,
    stop,
    speak: speech.speak,
    interrupt: speech.interrupt,
    setOpen,
    setConversation,
    setOutput,
    stopListening: () => recognitionRef.current?.stop(),
    beginResponse: speech.beginResponse,
    streamSpeech: speech.stream,
    resumeAfterResponse: () => scheduleListening(420),
    bargeIn: () => {
      speech.interrupt();
      window.setTimeout(() => start(), 80);
    },
  };
}
