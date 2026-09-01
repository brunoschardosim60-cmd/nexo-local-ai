'use client';
/* oxlint-disable react/react-compiler */

import { useRef, useState } from 'react';
import { NexoClient } from '@/lib/nexo/client';

type SpeechOutputOptions = {
  enabled: boolean;
  agentToken: string;
  onFinished: () => void;
};

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function useSpeechOutput(options: SpeechOutputOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState('');
  const [level, setLevel] = useState(0);
  const queueRef = useRef<string[]>([]);
  const queueActiveRef = useRef(false);
  const streamDoneRef = useRef(true);
  const streamCursorRef = useRef(0);
  const suppressedRef = useRef(false);
  const speakingRef = useRef(false);
  const boundaryRef = useRef({ charIndex: 0, elapsedMs: 0 });
  const optionsRef = useRef(options);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const synthesisControllerRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef(0);

  optionsRef.current = options;
  speakingRef.current = speaking;

  function clean(text: string) {
    return text
      .replace(/```[\s\S]*?```/g, ' código disponível na tela ')
      .replace(/[#*`>_-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function updatePresence(active: boolean) {
    const { agentToken } = optionsRef.current;
    if (agentToken)
      void new NexoClient(agentToken)
        .updatePresence({ action: 'update', patch: { speaking: active, ...(active ? { listening: false } : {}) } })
        .catch(() => undefined);
  }

  function setPlaybackState(active: boolean, text = '') {
    speakingRef.current = active;
    setSpeaking(active);
    if (text) setCaption(text);
    if (!active) setLevel(0);
    updatePresence(active);
  }

  function finish() {
    queueActiveRef.current = false;
    boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
    setPlaybackState(false);
    optionsRef.current.onFinished();
  }

  function stopActiveAudio() {
    synthesisControllerRef.current?.abort();
    synthesisControllerRef.current = null;
    window.cancelAnimationFrame(animationFrameRef.current);
    const audio = activeAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    activeAudioRef.current = null;
  }

  function interrupt() {
    suppressedRef.current = true;
    streamDoneRef.current = true;
    queueRef.current = [];
    queueActiveRef.current = false;
    stopActiveAudio();
    window.speechSynthesis?.cancel();
    setPlaybackState(false);
  }

  function trackRealAmplitude(analyser: AnalyserNode) {
    const samples = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    const measure = () => {
      if (!activeAudioRef.current || activeAudioRef.current.paused) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      const normalized = Math.min(1, Math.max(0, rms * 5.2));
      smoothed = smoothed * 0.68 + normalized * 0.32;
      setLevel(Number(smoothed.toFixed(3)));
      animationFrameRef.current = window.requestAnimationFrame(measure);
    };
    measure();
  }

  async function playNeural(text: string) {
    const { agentToken } = optionsRef.current;
    if (!agentToken) throw new Error('Nexo Core offline.');
    const controller = new AbortController();
    synthesisControllerRef.current = controller;
    const client = new NexoClient(agentToken);
    const output = await client.synthesizeSpeech(
      text,
      { voice: 'nexo-pt-BR', pace: 1.02, energy: 'balanced', pauses: 'natural', emphasis: 'selective' },
      controller.signal,
    );
    if (suppressedRef.current) return;
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = client.artifactUrl(output.artifact.id);
    activeAudioRef.current = audio;
    const AudioContextClass = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio indisponível.');
    const context = audioContextRef.current?.state !== 'closed' ? audioContextRef.current : new AudioContextClass();
    if (!context) throw new Error('Web Audio indisponível.');
    audioContextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyser.connect(context.destination);
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (error?: Error) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        };
        const onAbort = () => settle();
        controller.signal.addEventListener('abort', onAbort, { once: true });
        audio.onplay = () => {
          setPlaybackState(true, text);
          trackRealAmplitude(analyser);
        };
        audio.onended = () => settle();
        audio.onabort = () => settle();
        audio.onerror = () => settle(new Error('Falha ao tocar o áudio neural.'));
        void audio.play().catch((error) => settle(error instanceof Error ? error : new Error(String(error))));
      });
    } finally {
      window.cancelAnimationFrame(animationFrameRef.current);
      source.disconnect();
      analyser.disconnect();
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      if (synthesisControllerRef.current === controller) synthesisControllerRef.current = null;
      setPlaybackState(false);
    }
  }

  function playBrowserFallback(text: string) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.02;
      utterance.pitch = 1;
      utterance.onstart = () => {
        boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
        setPlaybackState(true, text);
        setLevel(0.34);
      };
      utterance.onboundary = (event) => {
        const elapsedMs = event.elapsedTime * 1000;
        const charDelta = Math.max(1, event.charIndex - boundaryRef.current.charIndex);
        const timeDelta = Math.max(45, elapsedMs - boundaryRef.current.elapsedMs);
        const cadence = Math.min(1, (charDelta / timeDelta) * 42);
        const punctuation = /[,.!?;:]/.test(text[event.charIndex - 1] || '');
        setLevel(Math.max(0.2, Math.min(0.84, 0.28 + cadence * 0.48 - (punctuation ? 0.09 : 0))));
        boundaryRef.current = { charIndex: event.charIndex, elapsedMs };
      };
      const done = () => { setPlaybackState(false); resolve(); };
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.speak(utterance);
    });
  }

  async function pump() {
    if (queueActiveRef.current || suppressedRef.current || !optionsRef.current.enabled) return;
    const next = queueRef.current.shift();
    if (!next) {
      if (streamDoneRef.current) finish();
      return;
    }
    queueActiveRef.current = true;
    try {
      await playNeural(next);
    } catch {
      if (!suppressedRef.current) await playBrowserFallback(next);
    } finally {
      queueActiveRef.current = false;
      if (!suppressedRef.current) {
        if (queueRef.current.length) void pump();
        else if (streamDoneRef.current) finish();
      }
    }
  }

  function enqueue(text: string) {
    const cleaned = clean(text);
    if (!cleaned || suppressedRef.current || !optionsRef.current.enabled) return;
    queueRef.current.push(cleaned.slice(0, 520));
    void pump();
  }

  function stream(content: string, force = false) {
    if (!optionsRef.current.enabled || suppressedRef.current) return;
    let pending = content.slice(streamCursorRef.current);
    while (pending) {
      const boundary = pending.match(/^[\s\S]*?[.!?](?:\s+|$)/)?.[0];
      if (!boundary && !force) break;
      const chunk = boundary || pending;
      streamCursorRef.current += chunk.length;
      pending = content.slice(streamCursorRef.current);
      enqueue(chunk);
      if (!boundary) break;
    }
    if (force) {
      streamDoneRef.current = true;
      if (!queueActiveRef.current && !queueRef.current.length) finish();
    }
  }

  function beginResponse() {
    if (!optionsRef.current.enabled) return;
    stopActiveAudio();
    window.speechSynthesis?.cancel();
    queueRef.current = [];
    queueActiveRef.current = false;
    streamCursorRef.current = 0;
    streamDoneRef.current = false;
    suppressedRef.current = false;
  }

  function speak(text: string) {
    if (!optionsRef.current.enabled) return;
    suppressedRef.current = false;
    streamCursorRef.current = 0;
    streamDoneRef.current = false;
    stream(clean(text).slice(0, 900), true);
  }

  return {
    speaking,
    caption,
    level,
    speak,
    stream,
    interrupt,
    beginResponse,
    isBusy: () => speakingRef.current || queueActiveRef.current,
    dispose: () => {
      interrupt();
      boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    },
  };
}
