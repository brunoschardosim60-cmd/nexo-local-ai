'use client';
/* oxlint-disable react/react-compiler */

import { useRef, useState } from 'react';
import { NexoClient } from '@/lib/nexo/client';

type SpeechOutputOptions = {
  enabled: boolean;
  agentToken: string;
  onFinished: () => void;
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
  const pulseTimer = useRef(0);
  const boundaryRef = useRef({ charIndex: 0, elapsedMs: 0 });
  const optionsRef = useRef(options);

  optionsRef.current = options;
  speakingRef.current = speaking;

  function clean(text: string) {
    return text
      .replace(/```[\s\S]*?```/g, ' código disponível na tela ')
      .replace(/[#*`>_-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function finish() {
    queueActiveRef.current = false;
    boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
    speakingRef.current = false;
    setSpeaking(false);
    setLevel(0);
    const { agentToken, onFinished } = optionsRef.current;
    if (agentToken)
      void new NexoClient(agentToken)
        .updatePresence({ action: 'update', patch: { speaking: false } })
        .catch(() => undefined);
    onFinished();
  }

  function interrupt() {
    suppressedRef.current = true;
    streamDoneRef.current = true;
    queueRef.current = [];
    queueActiveRef.current = false;
    speechSynthesis?.cancel();
    window.clearTimeout(pulseTimer.current);
    speakingRef.current = false;
    setSpeaking(false);
    setLevel(0);
  }

  function pump() {
    if (
      queueActiveRef.current ||
      suppressedRef.current ||
      !optionsRef.current.enabled ||
      !('speechSynthesis' in window)
    )
      return;
    const next = queueRef.current.shift();
    if (!next) {
      if (streamDoneRef.current) finish();
      return;
    }
    queueActiveRef.current = true;
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => {
      boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
      speakingRef.current = true;
      setSpeaking(true);
      setCaption(next);
      setLevel(0.34);
      const { agentToken } = optionsRef.current;
      if (agentToken)
        void new NexoClient(agentToken)
          .updatePresence({
            action: 'update',
            patch: { speaking: true, listening: false },
          })
          .catch(() => undefined);
    };
    utterance.onboundary = (event) => {
      const elapsedMs = event.elapsedTime * 1000;
      const charDelta = Math.max(
        1,
        event.charIndex - boundaryRef.current.charIndex,
      );
      const timeDelta = Math.max(45, elapsedMs - boundaryRef.current.elapsedMs);
      const cadence = Math.min(1, (charDelta / timeDelta) * 42);
      const punctuation = /[,.!?;:]/.test(next[event.charIndex - 1] || '');
      setLevel(
        Math.max(
          0.2,
          Math.min(0.84, 0.28 + cadence * 0.48 - (punctuation ? 0.09 : 0)),
        ),
      );
      boundaryRef.current = { charIndex: event.charIndex, elapsedMs };
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(
        () => setLevel(punctuation ? 0.11 : 0.17),
        punctuation ? 150 : 105,
      );
    };
    const continueQueue = () => {
      queueActiveRef.current = false;
      if (queueRef.current.length) pump();
      else if (streamDoneRef.current) finish();
    };
    utterance.onend = continueQueue;
    utterance.onerror = continueQueue;
    speechSynthesis.speak(utterance);
  }

  function enqueue(text: string) {
    const cleaned = clean(text);
    if (!cleaned || suppressedRef.current || !optionsRef.current.enabled)
      return;
    queueRef.current.push(cleaned.slice(0, 520));
    pump();
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
    speechSynthesis?.cancel();
    queueRef.current = [];
    queueActiveRef.current = false;
    streamCursorRef.current = 0;
    streamDoneRef.current = false;
    suppressedRef.current = false;
  }

  function speak(text: string) {
    if (!optionsRef.current.enabled || !('speechSynthesis' in window)) return;
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
      window.clearTimeout(pulseTimer.current);
      boundaryRef.current = { charIndex: 0, elapsedMs: 0 };
    },
  };
}
