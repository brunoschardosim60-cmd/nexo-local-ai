'use client';
/* oxlint-disable react/react-compiler */

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BRAND_NAME, PRODUCT_BRAND } from '@/lib/nexo/brand';
import { Maximize2, Mic, MicOff, Radio, Square, X } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export type LivingEyeState =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'success'
  | 'error'
  | 'offline'
  | 'resting';

export type LivingEyeQuality = 'high' | 'medium' | 'low' | 'auto';

export const LIVING_EYE_STATES: LivingEyeState[] = [
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
];

const LIVING_EYE_TRANSITIONS: Record<LivingEyeState, LivingEyeState[]> = {
  idle: ['listening', 'thinking', 'working', 'resting', 'offline', 'error'],
  listening: ['understanding', 'thinking', 'idle', 'error', 'offline'],
  understanding: ['thinking', 'speaking', 'working', 'error', 'idle'],
  thinking: ['speaking', 'working', 'success', 'error', 'idle', 'listening'],
  speaking: ['idle', 'listening', 'error', 'offline'],
  working: ['success', 'error', 'thinking', 'listening', 'idle'],
  success: ['idle', 'listening', 'working'],
  error: ['idle', 'offline', 'listening'],
  offline: ['idle', 'resting'],
  resting: ['idle', 'listening', 'offline'],
};

export function canTransitionLivingEye(
  from: LivingEyeState,
  to: LivingEyeState,
) {
  return from === to || LIVING_EYE_TRANSITIONS[from].includes(to);
}

type LivingEyeProps = {
  state?: LivingEyeState;
  inputLevel?: number;
  outputLevel?: number;
  intensity?: number;
  quality?: LivingEyeQuality;
  className?: string;
  mini?: boolean;
};

const STATE_LABELS: Record<LivingEyeState, string> = {
  idle: 'Presente',
  listening: 'Estou ouvindo…',
  understanding: 'Entendendo…',
  thinking: 'Pensando…',
  speaking: 'Falando…',
  working: 'Trabalhando…',
  success: 'Concluído',
  error: 'Algo precisa de atenção',
  offline: 'Presença local reduzida',
  resting: 'Em repouso',
};

const STATE_ENERGY: Record<LivingEyeState, number> = {
  idle: 0.12,
  listening: 0.42,
  understanding: 0.3,
  thinking: 0.34,
  speaking: 0.48,
  working: 0.39,
  success: 0.26,
  error: 0.08,
  offline: 0.035,
  resting: 0.015,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function resolvedQuality(quality: LivingEyeQuality, mini: boolean) {
  if (mini) return 'low';
  if (quality !== 'auto') return quality;
  if (typeof window === 'undefined') return 'medium';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return 'low';
  return (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
}

export function NexoLivingEye({
  state = 'idle',
  inputLevel = 0,
  outputLevel = 0,
  intensity = 0.7,
  quality = 'auto',
  className,
  mini = false,
}: LivingEyeProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState<'normal' | 'double' | 'long' | null>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [waking, setWaking] = useState(false);
  const previousStateRef = useRef(state);
  const qualityLevel = useMemo(
    () => resolvedQuality(quality, mini),
    [quality, mini],
  );
  const inputRef = useRef(inputLevel);
  const outputRef = useRef(outputLevel);
  const gazeRef = useRef(gaze);
  const stateRef = useRef(state);
  inputRef.current = inputLevel;
  outputRef.current = outputLevel;
  gazeRef.current = gaze;
  stateRef.current = state;

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = state;
    if (
      (previous === 'resting' || previous === 'offline') &&
      state !== 'resting' &&
      state !== 'offline'
    ) {
      setWaking(true);
      const timer = window.setTimeout(() => setWaking(false), 1050);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

  useEffect(() => {
    if (mini || state === 'resting') return;
    const random = seeded(0x4e45584f + Date.now());
    let timer = 0;
    let alive = true;
    const schedule = () => {
      const listeningDelay = state === 'listening' ? 1.7 : 1;
      const delay = (3800 + random() * 7400) * listeningDelay;
      timer = window.setTimeout(() => {
        if (!alive || document.hidden) return schedule();
        const roll = random();
        const kind = roll < 0.075 ? 'double' : roll > 0.965 ? 'long' : 'normal';
        setBlink(kind);
        window.setTimeout(
          () => setBlink(null),
          kind === 'double' ? 920 : kind === 'long' ? 760 : 520,
        );
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mini, state]);

  useEffect(() => {
    if (mini) return;
    const random = seeded(0x657965 + Date.now());
    let timer = 0;
    const drift = () => {
      const calm = state === 'thinking' || state === 'working' ? 0.55 : 1;
      const attentive =
        state === 'listening' ? 0.62 : state === 'speaking' ? 0.78 : 1;
      setGaze({
        x: (random() * 2 - 1) * 2.4 * calm * attentive,
        y: (random() * 2 - 1) * 1.7 * calm * attentive,
      });
      const baseDelay =
        state === 'listening' ? 520 : state === 'speaking' ? 760 : 1300;
      const variation =
        state === 'listening' ? 1450 : state === 'speaking' ? 1900 : 3100;
      timer = window.setTimeout(drift, baseDelay + random() * variation);
    };
    drift();
    return () => window.clearTimeout(timer);
  }, [mini, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const random = seeded(0x4e45584f);
    const branchCount =
      qualityLevel === 'high' ? 34 : qualityLevel === 'medium' ? 22 : 12;
    const branches = Array.from({ length: branchCount }, () => ({
      angle: Math.PI * (1.03 + random() * 0.94),
      length: 0.075 + random() * 0.12,
      bend: (random() - 0.5) * 0.72,
      fork: (random() - 0.5) * 0.42,
      phase: random() * Math.PI * 2,
      width: 0.28 + random() * 0.58,
      alpha: 0.35 + random() * 0.65,
      origin: (random() - 0.5) * 0.035,
    }));
    let frame = 0;
    let smoothed = 0;
    let smoothedGlow = 0.11;
    const draw = (time: number) => {
      if (document.hidden) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        qualityLevel === 'high' ? 2 : qualityLevel === 'medium' ? 1.5 : 1,
      );
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      const currentState = stateRef.current;
      const target = clamp(
        currentState === 'speaking' ? outputRef.current : inputRef.current,
      );
      smoothed += (target - smoothed) * (target > smoothed ? 0.18 : 0.065);
      const scale = Math.min(width, height);
      const cx = width * 0.505 + gazeRef.current.x * dpr;
      const cy = height * 0.522 + gazeRef.current.y * dpr;
      const targetGlow =
        currentState === 'offline' || currentState === 'resting'
          ? 0.035
          : currentState === 'error'
            ? 0.065
            : currentState === 'speaking'
              ? 0.31
              : currentState === 'listening'
                ? 0.27
                : currentState === 'thinking' || currentState === 'working'
                  ? 0.22
                  : currentState === 'understanding'
                    ? 0.18
                    : 0.1;
      smoothedGlow += (targetGlow - smoothedGlow) * 0.045;
      const pulse =
        (Math.sin(time * 0.0017) + Math.sin(time * 0.00073 + 1.7)) * 0.04;
      const ring = context.createRadialGradient(
        cx,
        cy,
        scale * 0.075,
        cx,
        cy,
        scale * (0.28 + smoothed * 0.025),
      );
      ring.addColorStop(0, 'rgba(0,12,24,0)');
      ring.addColorStop(0.56, `rgba(0,74,122,${smoothedGlow * 0.35})`);
      ring.addColorStop(
        0.83,
        `rgba(39,213,255,${smoothedGlow + smoothed * 0.19 + pulse * 0.55})`,
      );
      ring.addColorStop(1, 'rgba(0,18,36,0)');
      context.fillStyle = ring;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';
      for (const branch of branches) {
        const cognitiveActivity =
          currentState === 'thinking' || currentState === 'working'
            ? 0.16 + 0.12 * Math.sin(time * 0.00145 + branch.phase)
            : currentState === 'understanding'
              ? 0.11 + 0.06 * Math.sin(time * 0.0011 + branch.phase)
              : 0;
        const voiceActivity =
          currentState === 'listening' || currentState === 'speaking'
            ? smoothed * 0.34
            : 0;
        const activity = cognitiveActivity + voiceActivity;
        const inner = scale * (0.022 + branch.origin);
        const outer = scale * (branch.length + activity * 0.035);
        const sx = cx + Math.cos(branch.angle) * inner;
        const sy = cy + Math.sin(branch.angle) * inner;
        const ex = cx + Math.cos(branch.angle + branch.bend) * outer;
        const ey = cy + Math.sin(branch.angle + branch.bend) * outer;
        context.beginPath();
        context.moveTo(sx, sy);
        context.bezierCurveTo(
          cx + Math.cos(branch.angle - branch.bend * 0.22) * outer * 0.32,
          cy + Math.sin(branch.angle - branch.bend * 0.22) * outer * 0.32,
          cx + Math.cos(branch.angle + branch.bend * 0.52) * outer * 0.7,
          cy + Math.sin(branch.angle + branch.bend * 0.52) * outer * 0.7,
          ex,
          ey,
        );
        context.strokeStyle =
          currentState === 'error'
            ? `rgba(113,134,157,${(0.025 + activity * 0.2) * branch.alpha})`
            : `rgba(72,214,244,${(0.045 + activity + smoothed * 0.1) * branch.alpha})`;
        context.lineWidth = branch.width * dpr;
        context.stroke();

        if (qualityLevel !== 'low' && branch.alpha > 0.62) {
          const forkStartX = cx + (ex - cx) * 0.58;
          const forkStartY = cy + (ey - cy) * 0.58;
          const forkAngle = branch.angle + branch.bend + branch.fork;
          context.beginPath();
          context.moveTo(forkStartX, forkStartY);
          context.quadraticCurveTo(
            forkStartX + Math.cos(forkAngle - branch.fork * 0.4) * outer * 0.16,
            forkStartY + Math.sin(forkAngle - branch.fork * 0.4) * outer * 0.16,
            forkStartX + Math.cos(forkAngle) * outer * 0.28,
            forkStartY + Math.sin(forkAngle) * outer * 0.28,
          );
          context.lineWidth = branch.width * dpr * 0.58;
          context.strokeStyle = `rgba(99,222,244,${(0.025 + activity * 0.52) * branch.alpha})`;
          context.stroke();
        }
      }

      if (
        currentState === 'listening' ||
        currentState === 'speaking' ||
        currentState === 'working'
      ) {
        const wavePhase =
          (time * (currentState === 'speaking' ? 0.00046 : 0.00028)) % 1;
        const waveRadius = scale * (0.085 + wavePhase * 0.12);
        context.beginPath();
        context.ellipse(
          cx + Math.sin(time * 0.00037) * scale * 0.004,
          cy,
          waveRadius * 1.08,
          waveRadius * 0.86,
          -0.08,
          Math.PI * 1.08,
          Math.PI * 1.9,
        );
        context.strokeStyle = `rgba(83,221,248,${(1 - wavePhase) * (0.025 + smoothed * 0.13)})`;
        context.lineWidth = Math.max(0.45, dpr * 0.55);
        context.stroke();
      }
      context.globalCompositeOperation = 'source-over';
      if (qualityLevel !== 'low') {
        const highlightX =
          cx - scale * 0.12 + Math.sin(time * 0.00045) * scale * 0.009;
        const highlightY = cy - scale * 0.14;
        const moisture = context.createRadialGradient(
          highlightX,
          highlightY,
          0,
          highlightX,
          highlightY,
          scale * 0.08,
        );
        moisture.addColorStop(0, 'rgba(224,249,255,.2)');
        moisture.addColorStop(1, 'rgba(224,249,255,0)');
        context.fillStyle = moisture;
        context.fillRect(0, 0, width, height);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [qualityLevel]);

  const style = {
    '--eye-gaze-x': `${gaze.x}px`,
    '--eye-gaze-y': `${gaze.y}px`,
    '--eye-energy': clamp(
      (state === 'speaking' ? outputLevel : inputLevel) * intensity,
    ),
    '--eye-state-energy': STATE_ENERGY[state],
  } as CSSProperties;

  return (
    <figure
      ref={rootRef}
      className={cn(
        'nexo-living-eye',
        `nexo-living-eye-${state}`,
        blink && `nexo-living-eye-blink-${blink}`,
        waking && 'nexo-living-eye-wake',
        mini && 'nexo-living-eye-mini',
        className,
      )}
      style={style}
      data-state={state}
      aria-label={`Olho vivo do ${BRAND_NAME}: ${STATE_LABELS[state]}`}
      onPointerMove={(event) => {
        if (mini) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setGaze({
          x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 5 - 2.5,
          y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * 3.5 - 1.75,
        });
      }}
      onPointerLeave={() => setGaze({ x: 0, y: 0 })}
    >
      <div className="nexo-living-eye-open" aria-hidden="true">
        <Image
          src={PRODUCT_BRAND.assets.livingEye}
          alt=""
          fill
          sizes={mini ? '30px' : '(max-width: 640px) 96vw, 640px'}
          priority={!mini}
          draggable={false}
          className="nexo-living-eye-base"
        />
        <div className="nexo-living-eye-depth" />
        <canvas ref={canvasRef} className="nexo-living-eye-canvas" />
        <div className="nexo-living-eye-pupil" />
        <div className="nexo-living-eye-membrane" />
        <div className="nexo-living-eye-current" />
        <div className="nexo-living-eye-glint" />
      </div>
      {!mini && (
        <>
          <Image
            src={PRODUCT_BRAND.assets.livingEyeClosed}
            alt=""
            fill
            sizes="(max-width: 640px) 96vw, 640px"
            priority
            draggable={false}
            className="nexo-living-eye-closed"
          />
          <div className="nexo-living-eye-lid nexo-living-eye-lid-upper" />
          <div className="nexo-living-eye-lid nexo-living-eye-lid-lower" />
        </>
      )}
    </figure>
  );
}

export function NexoLivingEyeMini({
  state = 'idle',
}: {
  state?: LivingEyeState;
}) {
  return <NexoLivingEye state={state} quality="low" mini />;
}

type VoiceModeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: LivingEyeState;
  transcript?: string;
  caption?: string;
  outputLevel?: number;
  preview?: boolean;
  previewLevel?: number;
  conversationEnabled?: boolean;
  onConversationChange?: (enabled: boolean) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onBargeIn?: () => void;
  onListen: () => void;
  onStop: () => void;
};

export function NexoVoicePresence({
  open,
  onOpenChange,
  state,
  transcript = '',
  caption = '',
  outputLevel = 0,
  preview = false,
  previewLevel = 0.46,
  conversationEnabled = true,
  onConversationChange,
  onSpeechStart,
  onSpeechEnd,
  onBargeIn,
  onListen,
  onStop,
}: VoiceModeProps) {
  const [inputLevel, setInputLevel] = useState(0);
  const [audioStatus, setAudioStatus] = useState<'idle' | 'ready' | 'blocked'>(
    'idle',
  );
  const streamRef = useRef<MediaStream | null>(null);
  const audioFrame = useRef(0);
  const voiceCallbacksRef = useRef({ onSpeechStart, onSpeechEnd, onBargeIn });
  voiceCallbacksRef.current = { onSpeechStart, onSpeechEnd, onBargeIn };

  useEffect(() => {
    const shouldMonitor =
      open &&
      !preview &&
      (state === 'listening' || (conversationEnabled && state === 'speaking'));
    if (!shouldMonitor) {
      cancelAnimationFrame(audioFrame.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setInputLevel(0);
      setAudioStatus('idle');
      return;
    }
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.74;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let smooth = 0;
        let noiseFloor = 0.008;
        let tick = 0;
        let voiceFrames = 0;
        let silenceFrames = 0;
        let speechActive = false;
        let endpointSent = false;
        let bargeInSent = false;
        const measure = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          let peak = 0;
          for (const sample of samples) {
            sum += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
          }
          const rms = Math.sqrt(sum / samples.length);
          if (rms < noiseFloor * 2.4) {
            noiseFloor += (rms - noiseFloor) * 0.035;
          }
          const gatedRms = Math.max(0, rms - noiseFloor * 1.3);
          const gatedPeak = Math.max(0, peak - noiseFloor * 1.8);
          const rawEnergy = gatedRms * 10.5 + gatedPeak * 0.72;
          const target = rawEnergy < 0.025 ? 0 : clamp(rawEnergy ** 0.82);
          smooth += (target - smooth) * (target > smooth ? 0.25 : 0.08);
          if (tick++ % 2 === 0) setInputLevel(smooth);
          const voiceDetected = smooth > (state === 'speaking' ? 0.31 : 0.11);
          voiceFrames = voiceDetected
            ? voiceFrames + 1
            : Math.max(0, voiceFrames - 2);
          silenceFrames = voiceDetected ? 0 : silenceFrames + 1;
          if (state === 'listening' && !speechActive && voiceFrames >= 4) {
            speechActive = true;
            endpointSent = false;
            voiceCallbacksRef.current.onSpeechStart?.();
          }
          if (
            state === 'listening' &&
            speechActive &&
            !endpointSent &&
            silenceFrames >= 42
          ) {
            endpointSent = true;
            speechActive = false;
            voiceCallbacksRef.current.onSpeechEnd?.();
          }
          if (
            state === 'speaking' &&
            conversationEnabled &&
            !bargeInSent &&
            voiceFrames >= 11
          ) {
            bargeInSent = true;
            voiceCallbacksRef.current.onBargeIn?.();
          }
          audioFrame.current = requestAnimationFrame(measure);
        };
        setAudioStatus('ready');
        measure();
      })
      .catch(() => setAudioStatus('blocked'));
    return () => {
      cancelled = true;
      cancelAnimationFrame(audioFrame.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioContext) void audioContext.close();
    };
  }, [conversationEnabled, open, preview, state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="nexo-voice-presence fixed inset-0 top-0 left-0 z-50 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 ring-0"
      >
        <div className="nexo-voice-ambient" aria-hidden="true" />
        <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <DialogTitle className="text-sm font-semibold tracking-[.28em]">
              NEXO
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {conversationEnabled
                ? 'Conversa contínua · local'
                : 'Presença local'}
            </DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Entrar em tela cheia"
              onClick={() =>
                void document.documentElement.requestFullscreen?.()
              }
            >
              <Maximize2 />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Fechar modo de voz"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </Button>
          </div>
        </header>
        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3">
          <NexoLivingEye
            state={state}
            inputLevel={preview ? clamp(previewLevel) : inputLevel}
            outputLevel={outputLevel}
            intensity={0.88}
            className="w-[min(84vw,40rem)]"
          />
          <div
            className="nexo-voice-status mt-5 min-h-20 max-w-xl text-center"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-cyan-50/92">
              {STATE_LABELS[state]}
            </p>
            {transcript && (
              <p className="mt-3 line-clamp-2 text-balance text-base text-white/66">
                {transcript}
              </p>
            )}
            {state === 'speaking' && caption && (
              <p className="mt-3 line-clamp-2 text-balance text-sm text-white/56">
                {caption}
              </p>
            )}
            {audioStatus === 'blocked' && state === 'listening' && (
              <p className="mt-2 text-xs text-amber-200/75">
                O navegador não liberou o nível do microfone.
              </p>
            )}
          </div>
        </main>
        <div className="nexo-voice-controls fixed bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <Button
            size="icon-lg"
            variant={conversationEnabled ? 'secondary' : 'ghost'}
            className="h-14 w-14 rounded-full border border-white/10 bg-white/7 text-white hover:bg-white/12"
            aria-label={
              conversationEnabled
                ? 'Desativar conversa contínua'
                : 'Ativar conversa contínua'
            }
            title={
              conversationEnabled
                ? 'Conversa contínua ativa'
                : 'Conversa contínua desativada'
            }
            onClick={() => onConversationChange?.(!conversationEnabled)}
          >
            <Radio />
          </Button>
          <Button
            size="lg"
            variant={state === 'listening' ? 'secondary' : 'outline'}
            className="h-14 rounded-full border-white/12 bg-white/7 px-6 text-white hover:bg-white/12"
            onClick={onListen}
          >
            {state === 'listening' ? <MicOff /> : <Mic />}
            {state === 'listening'
              ? 'Ouvindo'
              : conversationEnabled
                ? 'Me escute'
                : 'Falar'}
          </Button>
          <Button
            size="icon-lg"
            variant="ghost"
            className="h-14 w-14 rounded-full bg-white/7 text-white hover:bg-white/12"
            aria-label="Interromper voz"
            onClick={onStop}
          >
            <Square />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
