'use client';
/* oxlint-disable react/react-compiler */

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Maximize2, Mic, MicOff, Square, X } from 'lucide-react';
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
      setGaze({
        x: (random() * 2 - 1) * 2.4 * calm,
        y: (random() * 2 - 1) * 1.7 * calm,
      });
      timer = window.setTimeout(drift, 1300 + random() * 3100);
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
    const branches = Array.from(
      {
        length:
          qualityLevel === 'high' ? 82 : qualityLevel === 'medium' ? 52 : 28,
      },
      (_, index) => ({
        angle:
          (index /
            (qualityLevel === 'high'
              ? 82
              : qualityLevel === 'medium'
                ? 52
                : 28)) *
            Math.PI *
            2 +
          (random() - 0.5) * 0.08,
        length: 0.1 + random() * 0.14,
        bend: (random() - 0.5) * 0.19,
        phase: random() * Math.PI * 2,
        width: 0.35 + random() * 0.8,
      }),
    );
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
          ? 0.07
          : currentState === 'error'
            ? 0.12
            : currentState === 'listening' || currentState === 'speaking'
              ? 0.25
              : currentState === 'thinking' || currentState === 'working'
                ? 0.2
                : 0.11;
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
        const activity =
          currentState === 'thinking' || currentState === 'working'
            ? 0.2 + 0.18 * Math.sin(time * 0.0021 + branch.phase)
            : smoothed * 0.38;
        const inner = scale * 0.09;
        const outer = scale * (branch.length + activity * 0.035);
        const sx = cx + Math.cos(branch.angle) * inner;
        const sy = cy + Math.sin(branch.angle) * inner;
        const ex = cx + Math.cos(branch.angle + branch.bend) * outer;
        const ey = cy + Math.sin(branch.angle + branch.bend) * outer;
        context.beginPath();
        context.moveTo(sx, sy);
        context.quadraticCurveTo(
          cx + Math.cos(branch.angle + branch.bend * 0.35) * outer * 0.68,
          cy + Math.sin(branch.angle + branch.bend * 0.35) * outer * 0.68,
          ex,
          ey,
        );
        context.strokeStyle =
          currentState === 'error'
            ? `rgba(208,76,123,${0.08 + activity})`
            : `rgba(64,216,255,${0.08 + activity + smoothed * 0.15})`;
        context.lineWidth = branch.width * dpr;
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
  } as CSSProperties;

  return (
    <figure
      ref={rootRef}
      className={cn(
        'nexo-living-eye',
        `nexo-living-eye-${state}`,
        blink && `nexo-living-eye-blink-${blink}`,
        mini && 'nexo-living-eye-mini',
        className,
      )}
      style={style}
      aria-label={`Olho vivo do Nexo: ${STATE_LABELS[state]}`}
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
      <Image
        src="/nexo/living-eye-base.png"
        alt=""
        fill
        sizes={mini ? '30px' : '(max-width: 640px) 88vw, 544px'}
        priority={!mini}
        draggable={false}
        className="nexo-living-eye-base"
      />
      {!mini && (
        <Image
          src="/nexo/living-eye-closed.png"
          alt=""
          fill
          sizes="(max-width: 640px) 88vw, 544px"
          priority
          draggable={false}
          className="nexo-living-eye-closed"
        />
      )}
      <div className="nexo-living-eye-depth" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="nexo-living-eye-canvas"
        aria-hidden="true"
      />
      <div className="nexo-living-eye-pupil" aria-hidden="true" />
      <div className="nexo-living-eye-glint" aria-hidden="true" />
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
  onListen,
  onStop,
}: VoiceModeProps) {
  const [inputLevel, setInputLevel] = useState(0);
  const [audioStatus, setAudioStatus] = useState<'idle' | 'ready' | 'blocked'>(
    'idle',
  );
  const streamRef = useRef<MediaStream | null>(null);
  const audioFrame = useRef(0);

  useEffect(() => {
    if (!open || state !== 'listening') {
      cancelAnimationFrame(audioFrame.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setInputLevel(0);
      return;
    }
    if (preview) {
      setAudioStatus('ready');
      setInputLevel(0.46);
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
        let tick = 0;
        const measure = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          let peak = 0;
          for (const sample of samples) {
            sum += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
          }
          const rms = Math.sqrt(sum / samples.length);
          const target = clamp(rms * 8.5 + peak * 0.9);
          smooth += (target - smooth) * (target > smooth ? 0.25 : 0.08);
          if (tick++ % 2 === 0) setInputLevel(smooth);
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
  }, [open, preview, state]);

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
              Presença local
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
            inputLevel={inputLevel}
            outputLevel={outputLevel}
            intensity={0.88}
            className="w-[min(78vw,34rem)]"
          />
          <div className="mt-7 min-h-20 max-w-xl text-center">
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
            size="lg"
            variant={state === 'listening' ? 'secondary' : 'outline'}
            className="h-14 rounded-full border-white/12 bg-white/7 px-6 text-white hover:bg-white/12"
            onClick={onListen}
          >
            {state === 'listening' ? <MicOff /> : <Mic />}
            {state === 'listening' ? 'Ouvindo' : 'Falar'}
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
