'use client';
/* oxlint-disable react/react-compiler react-hooks/exhaustive-deps */

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
  localSttAvailable: boolean;
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localVadFrameRef = useRef(0);
  const localCaptureStartingRef = useRef(false);
  const localCaptureCancelledRef = useRef(false);
  const localSttFailedRef = useRef(false);
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
      stopLocalCapture(true);
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
      if (mediaRecorderRef.current) stopLocalCapture(false);
      else recognitionRef.current?.stop();
      return;
    }
    if (
      optionsRef.current.localSttAvailable &&
      !localSttFailedRef.current &&
      'mediaDevices' in navigator &&
      typeof window.MediaRecorder !== 'undefined'
    ) {
      void startLocalCapture();
      return;
    }
    startBrowserRecognition();
  }

  function startBrowserRecognition() {
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

  function cleanupLocalCapture() {
    window.cancelAnimationFrame(localVadFrameRef.current);
    localVadFrameRef.current = 0;
    for (const track of mediaStreamRef.current?.getTracks() || []) track.stop();
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    void localAudioContextRef.current?.close();
    localAudioContextRef.current = null;
  }

  function stopLocalCapture(cancel = false) {
    localCaptureCancelledRef.current = cancel;
    window.cancelAnimationFrame(localVadFrameRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else cleanupLocalCapture();
  }

  async function finishLocalTranscription(blob: Blob) {
    const { agentToken } = optionsRef.current;
    if (!agentToken || !blob.size) {
      scheduleListening(520);
      return;
    }
    setVoiceInterim('Entendendo…');
    try {
      const result = await new NexoClient(agentToken).transcribeSpeech(blob);
      const text = String(result.text || '').trim();
      if (!text) {
        optionsRef.current.onNotice('Não consegui ouvir uma frase completa. Tenta de novo?');
        scheduleListening(520);
        return;
      }
      finalSpeechRef.current = text;
      setVoiceInterim('');
      optionsRef.current.onPromptChange(text);
      optionsRef.current.onSubmit(text);
    } catch {
      localSttFailedRef.current = true;
      setVoiceInterim('');
      optionsRef.current.onNotice('O STT local falhou. Na próxima tentativa vou usar o reconhecimento do navegador.');
      scheduleListening(850);
    }
  }

  async function startLocalCapture() {
    if (localCaptureStartingRef.current || listeningRef.current) return;
    localCaptureStartingRef.current = true;
    localCaptureCancelledRef.current = false;
    try {
      if (speech.isBusy()) speech.interrupt();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!voiceModeRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      mediaStreamRef.current = stream;
      recorderChunksRef.current = [];
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const cancelled = localCaptureCancelledRef.current;
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recorderChunksRef.current = [];
        cleanupLocalCapture();
        listeningRef.current = false;
        setListening(false);
        setVoiceInterim('');
        if (!cancelled) void finishLocalTranscription(blob);
      };
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      localAudioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let speechDetected = false;
      let lastActiveAt = startedAt;
      const monitor = () => {
        if (recorder.state === 'inactive') return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (rms >= 0.018) { speechDetected = true; lastActiveAt = now; }
        const finishedSpeaking = speechDetected && now - lastActiveAt >= 850 && now - startedAt >= 500;
        const timedOut = (!speechDetected && now - startedAt >= 12_000) || now - startedAt >= 30_000;
        if (finishedSpeaking || timedOut) stopLocalCapture(!speechDetected);
        else localVadFrameRef.current = window.requestAnimationFrame(monitor);
      };
      recorder.start(250);
      listeningRef.current = true;
      setListening(true);
      setVoiceInterim('Ouvindo…');
      const { agentToken } = optionsRef.current;
      if (agentToken) void new NexoClient(agentToken).updatePresence({ action: 'update', patch: { listening: true, speaking: false } }).catch(() => undefined);
      monitor();
    } catch {
      cleanupLocalCapture();
      optionsRef.current.onNotice('Não consegui abrir o microfone local; usando o reconhecimento do navegador.');
      startBrowserRecognition();
    } finally {
      localCaptureStartingRef.current = false;
    }
  }

  function stop() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopLocalCapture(true);
    speech.interrupt();
    window.clearTimeout(restartTimerRef.current);
    listeningRef.current = false;
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
    stopListening: () => mediaRecorderRef.current ? stopLocalCapture(false) : recognitionRef.current?.stop(),
    beginResponse: speech.beginResponse,
    streamSpeech: speech.stream,
    resumeAfterResponse: () => scheduleListening(420),
    bargeIn: () => {
      speech.interrupt();
      window.setTimeout(() => start(), 80);
    },
  };
}
