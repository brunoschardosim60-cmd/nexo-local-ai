'use client';
/* oxlint-disable react/react-compiler jsx-a11y/media-has-caption jsx-a11y/no-noninteractive-element-interactions */

import {
  ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUp,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  CloudSun,
  Code2,
  Copy,
  Download,
  Film,
  Gauge,
  FilePenLine,
  FileText,
  FolderPlus,
  Globe2,
  ImageIcon,
  Library,
  Menu,
  Mic,
  Keyboard,
  LayoutDashboard,
  Monitor,
  Moon,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Table2,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useNexoTaskSync } from '@/hooks/use-nexo-task-sync';
import { NexoClient, NEXO_AGENT_URL } from '@/lib/nexo/client';
import { BRAND_NAME } from '@/lib/nexo/brand';
import {
  parseAgentTask,
  taskStatusLabel,
  type AgentHealth,
  type AgentPermission,
  type AgentTask,
  type Chat,
  type ChatMessage,
  type Effort,
  type LocalAttachment,
  type LocalDocument,
  type MediaArtifact,
  type MessageKind,
  type NexoAction,
  type NexoMemory,
  type UserProfile,
} from '@/lib/nexo/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { NexoMark } from '@/components/nexo-mark';
import { AgentTaskCard } from '@/components/nexo/agent-task-card';
import { PersonalWorkspace } from '@/components/nexo/personal-workspace';
import { PresenceControls } from '@/components/nexo/presence-controls';
import { CapabilityCenter } from '@/components/nexo/capability-center';
import { NexoOrb } from '@/components/nexo/nexo-orb';
import { ArtifactPanel } from '@/components/nexo/artifact-panel';
import {
  NexoLivingEyeMini,
  NexoVoicePresence,
  type LivingEyeState,
} from '@/components/nexo/nexo-living-eye';

type Weather = {
  label: string;
  temperature: number;
  apparent: number;
  wind: number;
  code: number;
};
type WeatherApiResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    wind_speed_10m: number;
    weather_code: number;
  };
};
type GeocodingApiResponse = {
  results?: Array<{
    name: string;
    admin1?: string;
    latitude: number;
    longitude: number;
  }>;
};
type SpeechResult = {
  0: { transcript: string };
  isFinal?: boolean;
};
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

const AGENT_URL = NEXO_AGENT_URL;
const EFFORTS: Effort[] = ['Baixo', 'Médio', 'Alto', 'Extra alto'];

const MODES = [
  { label: 'Geral', icon: Sparkles },
  { label: 'Programar', icon: Code2 },
  { label: 'Documentos', icon: FileText },
  { label: 'Planilhas', icon: Table2 },
  { label: 'Imagens', icon: ImageIcon },
  { label: 'Vídeos', icon: Film },
  { label: 'Agente', icon: Bot },
];

const DEFAULT_PROFILE: UserProfile = {
  name: 'Bruno',
  city: '',
  style: 'Natural, acolhedor e proativo',
  instructions: '',
};

function safeParse<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function stripFence(content: string) {
  return content
    .replace(/^```(?:csv|svg|xml)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function cleanSvg(content: string) {
  const match = stripFence(content).match(/<svg[\s\S]*<\/svg>/i);
  const sanitized = (match?.[0] ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, '');
  if (!sanitized) return '';
  return /<svg\b[^>]*\bxmlns=/i.test(sanitized)
    ? sanitized
    : sanitized.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function normalizeInput(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[?!.,]+$/g, '');
}

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return '';
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

function isImageCreationRequest(question: string, history: ChatMessage[]) {
  const normalized = normalizeInput(question);
  const direct =
    /\b(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper|foto)\b/.test(
      normalized,
    ) ||
    /\b(quero|preciso de)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper)\b/.test(
      normalized,
    );
  if (direct) return true;
  const isShortCommand =
    /^(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b/.test(normalized) &&
    normalized.length < 100;
  const recentImageContext = history
    .slice(-4)
    .some((message) =>
      /\b(imagem|ilustracao|desenho|svg|logo|icone)\b/.test(
        normalizeInput(message.content),
      ),
    );
  return isShortCommand && recentImageContext;
}

function weatherDescription(code: number) {
  if (code === 0) return 'céu limpo';
  if (code <= 3) return 'parcialmente nublado';
  if (code <= 48) return 'neblina';
  if (code <= 67) return 'chuva';
  if (code <= 77) return 'neve';
  if (code <= 82) return 'pancadas de chuva';
  return 'tempestade';
}

function renderInline(content: string): ReactNode[] {
  const parts = content.split(
    /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g,
  );
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link)
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    return part;
  });
}

function RichText({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  const isBlockStart = (line: string) =>
    !line.trim() ||
    /^```|^#{1,3}\s+|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <div className="nexo-code" key={`code-${index}`}>
          <div>
            <span>{language || 'código'}</span>
          </div>
          <pre>
            <code>{code.join('\n')}</code>
          </pre>
        </div>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <h2 key={index}>{renderInline(heading[2])}</h2>
        ) : level === 2 ? (
          <h3 key={index}>{renderInline(heading[2])}</h3>
        ) : (
          <h4 key={index}>{renderInline(heading[2])}</h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        if (/^\s*[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
          index += 1;
          continue;
        }
        if (
          !lines[index].trim() &&
          /^\s*[-*]\s+/.test(lines[index + 1] ?? '')
        ) {
          index += 1;
          continue;
        }
        break;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      const start = Number(line.match(/^\s*(\d+)[.)]\s+/)?.[1] ?? 1);
      while (index < lines.length) {
        if (/^\s*\d+[.)]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
          index += 1;
          continue;
        }
        if (
          !lines[index].trim() &&
          /^\s*\d+[.)]\s+/.test(lines[index + 1] ?? '')
        ) {
          index += 1;
          continue;
        }
        break;
      }
      blocks.push(
        <ol start={start} key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInline(quote.join(' '))}
        </blockquote>,
      );
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }
  return <div className="nexo-rich-text">{blocks}</div>;
}

function parseAction(content: string): NexoAction | null {
  try {
    const parsed = JSON.parse(stripFence(content)) as {
      nexo_action?: NexoAction;
    };
    const action = parsed.nexo_action;
    if (
      !action ||
      ![
        'write_file',
        'create_folder',
        'read_file',
        'list_files',
        'create_project',
      ].includes(action.type) ||
      !action.path ||
      !action.reason
    )
      return null;
    if (
      action.type === 'create_project' &&
      !['static-site', 'node-api', 'python-api', 'ai-service'].includes(
        action.template ?? '',
      )
    )
      return null;
    return { ...action, status: action.status ?? 'pending' };
  } catch {
    return null;
  }
}

function actionTitle(action: NexoAction) {
  return {
    write_file: 'Criar ou alterar arquivo',
    create_folder: 'Criar pasta',
    read_file: 'Ler arquivo',
    list_files: 'Listar pasta',
    create_project: `Criar projeto · ${action.template ?? ''}`,
  }[action.type];
}

function actionButton(action: NexoAction) {
  return ['write_file', 'create_folder', 'create_project'].includes(action.type)
    ? 'Revisar e aprovar'
    : 'Permitir leitura';
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState('Geral');
  const [effort, setEffort] = useState<Effort>('Médio');
  const [imageQuality, setImageQuality] = useState<
    'FAST' | 'BALANCED' | 'HIGH' | 'MAX'
  >('BALANCED');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activityLabel, setActivityLabel] = useState('Preparando a resposta…');
  const [notice, setNotice] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceConversation, setVoiceConversation] = useState(true);
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceCaption, setVoiceCaption] = useState('');
  const [voiceOutputLevel, setVoiceOutputLevel] = useState(0);
  const [voicePreviewState, setVoicePreviewState] =
    useState<LivingEyeState | null>(null);
  const [voicePreviewLevel, setVoicePreviewLevel] = useState<number | null>(
    null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<NexoMemory[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [selectedMemoryId, setSelectedMemoryId] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedArtifact, setSelectedArtifact] = useState<ChatMessage | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [currentTime, setCurrentTime] = useState('');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentToken, setAgentToken] = useState('');
  const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const recognitionRef = useRef<LocalSpeechRecognition | null>(null);
  const voiceModeRef = useRef(false);
  const voiceConversationRef = useRef(true);
  const voiceOutputRef = useRef(false);
  const listeningRef = useRef(false);
  const loadingRef = useRef(false);
  const speakingRef = useRef(false);
  const voiceRestartTimer = useRef(0);
  const finalSpeechRef = useRef('');
  const speechQueueRef = useRef<string[]>([]);
  const speechQueueActiveRef = useRef(false);
  const speechStreamDoneRef = useRef(true);
  const speechStreamCursorRef = useRef(0);
  const speechSuppressedRef = useRef(false);
  const voicePulseTimer = useRef(0);
  const voiceBoundaryRef = useRef({ charIndex: 0, elapsedMs: 0 });

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId],
  );
  const history = activeChat?.messages ?? [];
  const visibleChats = useMemo(
    () =>
      chats.filter((chat) =>
        chat.title.toLowerCase().includes(chatSearch.trim().toLowerCase()),
      ),
    [chats, chatSearch],
  );
  const voiceEyeState: LivingEyeState =
    voicePreviewState ??
    (!agentOnline
      ? 'offline'
      : listening
        ? 'listening'
        : speaking
          ? 'speaking'
          : loading
            ? mode === 'Agente'
              ? 'working'
              : 'thinking'
            : 'idle');

  voiceModeRef.current = voiceModeOpen;
  voiceConversationRef.current = voiceConversation;
  voiceOutputRef.current = voiceOutput;
  listeningRef.current = listening;
  loadingRef.current = loading;
  speakingRef.current = speaking;

  useEffect(() => {
    const storedChats = safeParse<Chat[]>(
      localStorage.getItem('nexo-chats'),
      [],
    );
    const previewState = new URLSearchParams(window.location.search).get(
      'voice-eye-state',
    ) as LivingEyeState | null;
    const previewLevelParam = new URLSearchParams(window.location.search).get(
      'voice-eye-level',
    );
    if (previewLevelParam !== null) {
      const previewLevel = Number(previewLevelParam);
      if (Number.isFinite(previewLevel)) {
        setVoicePreviewLevel(Math.min(1, Math.max(0, previewLevel)));
      }
    }
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
    const legacy = safeParse<ChatMessage[]>(
      localStorage.getItem('nexo-history'),
      [],
    );
    const initialChats = storedChats.length
      ? storedChats
      : legacy.length
        ? [
            {
              id: crypto.randomUUID(),
              title: 'Conversa anterior',
              messages: legacy,
              updatedAt: Date.now(),
            },
          ]
        : [];
    const storedTheme = localStorage.getItem('nexo-theme');
    const storedEffort = localStorage.getItem('nexo-effort') as Effort | null;
    setVoiceConversation(
      localStorage.getItem('nexo-voice-conversation') !== 'off',
    );
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
    if (storedEffort && EFFORTS.includes(storedEffort)) setEffort(storedEffort);
    setProfile(storedProfile);
    setChats(initialChats);
    setActiveChatId(initialChats[0]?.id ?? '');
    setMounted(true);
    if (initialChats.length && !storedChats.length)
      localStorage.setItem('nexo-chats', JSON.stringify(initialChats));

    const updateClock = () =>
      setCurrentTime(
        new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(new Date()),
      );
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    if (storedProfile.city) void loadWeatherByCity(storedProfile.city);
    new NexoClient()
      .health()
      .then(async (data: AgentHealth) => {
        setAgentOnline(true);
        setAgentToken(data.sessionToken);
        setAgentHealth(data);
        const client = new NexoClient(data.sessionToken);
        void client
          .warmRuntime(
            storedEffort && EFFORTS.includes(storedEffort)
              ? storedEffort
              : 'Médio',
          )
          .catch(() => undefined);
        const payload = await client.getSession();
        if (payload) {
          const remoteChats = payload.session?.state?.chats ?? [];
          if (remoteChats.length) {
            const merged = new Map<string, Chat>();
            for (const chat of [...initialChats, ...remoteChats]) {
              const existing = merged.get(chat.id);
              if (!existing || chat.updatedAt > existing.updatedAt)
                merged.set(chat.id, chat);
            }
            const restored = [...merged.values()]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 40);
            setChats(restored);
            setActiveChatId((current) => current || restored[0]?.id || '');
            localStorage.setItem('nexo-chats', JSON.stringify(restored));
          }
          if (payload.session?.state?.profile)
            setProfile((current) => ({
              ...current,
              ...payload.session!.state!.profile,
            }));
        }
      })
      .catch(() => {
        setAgentOnline(false);
        setAgentToken('');
        setAgentHealth(null);
      });
    return () => window.clearInterval(timer);
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
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, loading]);

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

  useNexoTaskSync({
    chats,
    setChats,
    token: agentToken,
    profile,
    setOnline: setAgentOnline,
  });

  function persistChats(next: Chat[]) {
    const limited = next
      .map((chat) => ({ ...chat, messages: chat.messages.slice(-80) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
    setChats(limited);
    try {
      localStorage.setItem('nexo-chats', JSON.stringify(limited));
    } catch {
      setNotice('A memória local está cheia. Exclua chats antigos.');
    }
    syncAgentSession(limited, profile);
  }

  function syncAgentSession(nextChats: Chat[], nextProfile: UserProfile) {
    if (!agentToken) return;
    void new NexoClient(agentToken)
      .saveSession(nextChats, nextProfile)
      .catch(() => undefined);
  }

  function createChat() {
    if (activeChat && activeChat.messages.length === 0) {
      setMobileOpen(false);
      return;
    }
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: 'Nova conversa',
      messages: [],
      updatedAt: Date.now(),
    };
    persistChats([chat, ...chats]);
    setActiveChatId(chat.id);
    setPrompt('');
    setNotice('');
    setMobileOpen(false);
  }

  function deleteChat(id: string) {
    const next = chats.filter((chat) => chat.id !== id);
    persistChats(next);
    if (activeChatId === id) setActiveChatId(next[0]?.id ?? '');
  }

  async function fetchWeather(
    latitude: number,
    longitude: number,
    label: string,
  ) {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`,
    );
    if (!response.ok) throw new Error('weather');
    const data = (await response.json()) as WeatherApiResponse;
    const current = data.current;
    const next = {
      label,
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      wind: current.wind_speed_10m,
      code: current.weather_code,
    };
    setWeather(next);
    setWeatherStatus('idle');
    return next;
  }

  async function loadWeatherByCity(city: string) {
    if (!city.trim()) return null;
    setWeatherStatus('loading');
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`,
      );
      const data = (await response.json()) as GeocodingApiResponse;
      const place = data.results?.[0];
      if (!place) throw new Error('city');
      return await fetchWeather(
        place.latitude,
        place.longitude,
        `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}`,
      );
    } catch {
      setWeatherStatus('error');
      setWeather(null);
      return null;
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setWeatherStatus('error');
      return;
    }
    setWeatherStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) =>
        void fetchWeather(
          position.coords.latitude,
          position.coords.longitude,
          'Sua localização',
        ).catch(() => setWeatherStatus('error')),
      () => setWeatherStatus('error'),
      { timeout: 12_000 },
    );
  }

  function saveProfile() {
    localStorage.setItem('nexo-profile', JSON.stringify(profile));
    setProfileOpen(false);
    syncAgentSession(chats, profile);
    if (profile.city) void loadWeatherByCity(profile.city);
  }

  async function resetAdaptivePersonality() {
    if (!agentToken) {
      setNotice('O Nexo Runtime está offline.');
      return;
    }
    try {
      await new NexoClient(agentToken).resetPersonality();
      setNotice(
        'Adaptação aprendida apagada. A identidade-base do Nexo foi mantida.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui apagar a adaptação.',
      );
    }
  }

  async function loadMemories(query = memoryQuery) {
    if (!agentToken) {
      setNotice('O Nexo Runtime está offline.');
      return;
    }
    setMemoryLoading(true);
    try {
      const items = await new NexoClient(agentToken).listMemories({
        query: query.trim() || undefined,
        limit: 100,
      });
      setMemories(items);
      const selected =
        items.find((item) => item.id === selectedMemoryId) || items[0];
      setSelectedMemoryId(selected?.id || '');
      setMemoryDraft(selected?.content || '');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui abrir a memória.',
      );
    } finally {
      setMemoryLoading(false);
    }
  }

  async function openMemoryCenter() {
    setMemoryOpen(true);
    setMobileOpen(false);
    await loadMemories('');
  }
  async function manageSelectedMemory(
    action: 'update' | 'confirm' | 'forget' | 'delete',
  ) {
    if (!agentToken || !selectedMemoryId) return;
    setMemoryLoading(true);
    try {
      await new NexoClient(agentToken).manageMemory(
        selectedMemoryId,
        action,
        action === 'update' ? { content: memoryDraft } : undefined,
      );
      setNotice(
        action === 'delete'
          ? 'Memória apagada definitivamente.'
          : action === 'forget'
            ? 'Memória arquivada.'
            : action === 'confirm'
              ? 'Memória confirmada.'
              : 'Memória atualizada.',
      );
      await loadMemories(memoryQuery);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui alterar a memória.',
      );
    } finally {
      setMemoryLoading(false);
    }
  }

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

  function changeEffort(next: Effort) {
    setEffort(next);
    localStorage.setItem('nexo-effort', next);
    if (agentToken)
      void new NexoClient(agentToken).warmRuntime(next).catch(() => undefined);
  }

  async function addFiles(files: File[]) {
    const accepted: LocalDocument[] = [];
    const media: LocalAttachment[] = [];
    for (const file of files) {
      if (/^(image|audio|video)\//.test(file.type)) {
        if (file.size > 8_000_000) {
          setNotice(`${file.name} é maior que 8 MB e não foi anexado.`);
          continue;
        }
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === 'string'
                ? resolve(reader.result)
                : reject(new Error('Formato inválido.'));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          media.push({
            type: file.type.split('/')[0] as LocalAttachment['type'],
            name: file.name,
            mimeType: file.type,
            dataUrl,
          });
        } catch {
          setNotice(`Não consegui ler ${file.name}.`);
        }
        continue;
      }
      if (file.size > 2_000_000) {
        setNotice(`${file.name} é maior que 2 MB e não foi adicionado.`);
        continue;
      }
      try {
        accepted.push({
          name: file.name,
          content: (await file.text()).slice(0, 40_000),
        });
      } catch {
        setNotice(`Não consegui ler ${file.name}.`);
      }
    }
    setDocuments((current) => [...current, ...accepted].slice(-8));
    setAttachments((current) => [...current, ...media].slice(-4));
    if (agentToken)
      for (const document of accepted) {
        void new NexoClient(agentToken)
          .indexText(`upload:${document.name}`, document.content, {
            uploadedFromBrowser: true,
            trust: 'untrusted',
          })
          .catch(() => undefined);
      }
  }
  async function addDocuments(event: ChangeEvent<HTMLInputElement>) {
    await addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }
  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }
  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length) {
      event.preventDefault();
      void addFiles(images);
    }
  }

  async function waitForMedia(client: NexoClient, jobId: string) {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const job = await client.getMediaJob(jobId);
      setActivityLabel(
        job.status === 'queued'
          ? 'Na fila de mídia local…'
          : job.status === 'running'
            ? 'Gerando no seu computador…'
            : 'Finalizando artefato…',
      );
      if (job.status === 'completed' && job.artifactId) {
        const artifact = await client.getArtifact(job.artifactId);
        if (!artifact)
          throw new Error('O artefato terminou, mas não foi encontrado.');
        return artifact;
      }
      if (job.status === 'failed' || job.status === 'cancelled')
        throw new Error(job.error || `Geração ${job.status}.`);
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }
    throw new Error(
      'A geração ultrapassou 10 minutos. O job permanece salvo no Nexo Core.',
    );
  }

  function cleanSpeechText(text: string) {
    return text
      .replace(/```[\s\S]*?```/g, ' código disponível na tela ')
      .replace(/[#*`>_-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scheduleVoiceListening(delay = 360) {
    window.clearTimeout(voiceRestartTimer.current);
    if (
      !voiceModeRef.current ||
      !voiceConversationRef.current ||
      voicePreviewState !== null
    )
      return;
    voiceRestartTimer.current = window.setTimeout(() => {
      if (!listeningRef.current && !loadingRef.current && !speakingRef.current)
        startVoice();
    }, delay);
  }

  function finishSpeechCycle() {
    speechQueueActiveRef.current = false;
    voiceBoundaryRef.current = { charIndex: 0, elapsedMs: 0 };
    speakingRef.current = false;
    setSpeaking(false);
    setVoiceOutputLevel(0);
    if (agentToken)
      void new NexoClient(agentToken)
        .updatePresence({ action: 'update', patch: { speaking: false } })
        .catch(() => undefined);
    scheduleVoiceListening(280);
  }

  function interruptSpeechForBargeIn() {
    speechSuppressedRef.current = true;
    speechStreamDoneRef.current = true;
    speechQueueRef.current = [];
    speechQueueActiveRef.current = false;
    speechSynthesis?.cancel();
    window.clearTimeout(voicePulseTimer.current);
    speakingRef.current = false;
    setSpeaking(false);
    setVoiceOutputLevel(0);
  }

  function pumpSpeechQueue() {
    if (
      speechQueueActiveRef.current ||
      speechSuppressedRef.current ||
      !voiceOutputRef.current ||
      !('speechSynthesis' in window)
    )
      return;
    const next = speechQueueRef.current.shift();
    if (!next) {
      if (speechStreamDoneRef.current) finishSpeechCycle();
      return;
    }
    speechQueueActiveRef.current = true;
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => {
      voiceBoundaryRef.current = { charIndex: 0, elapsedMs: 0 };
      speakingRef.current = true;
      setSpeaking(true);
      setVoiceCaption(next);
      setVoiceOutputLevel(0.34);
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
        event.charIndex - voiceBoundaryRef.current.charIndex,
      );
      const timeDelta = Math.max(
        45,
        elapsedMs - voiceBoundaryRef.current.elapsedMs,
      );
      const cadence = Math.min(1, (charDelta / timeDelta) * 42);
      const punctuation = /[,.!?;:]/.test(next[event.charIndex - 1] || '');
      const pulse = Math.max(
        0.2,
        Math.min(0.84, 0.28 + cadence * 0.48 - (punctuation ? 0.09 : 0)),
      );
      voiceBoundaryRef.current = { charIndex: event.charIndex, elapsedMs };
      setVoiceOutputLevel(pulse);
      window.clearTimeout(voicePulseTimer.current);
      voicePulseTimer.current = window.setTimeout(
        () => setVoiceOutputLevel(punctuation ? 0.11 : 0.17),
        punctuation ? 150 : 105,
      );
    };
    const continueQueue = () => {
      speechQueueActiveRef.current = false;
      if (speechQueueRef.current.length) pumpSpeechQueue();
      else if (speechStreamDoneRef.current) finishSpeechCycle();
    };
    utterance.onend = continueQueue;
    utterance.onerror = continueQueue;
    speechSynthesis.speak(utterance);
  }

  function enqueueSpeechChunk(text: string) {
    const clean = cleanSpeechText(text);
    if (!clean || speechSuppressedRef.current || !voiceOutputRef.current)
      return;
    speechQueueRef.current.push(clean.slice(0, 520));
    pumpSpeechQueue();
  }

  function queueStreamingSpeech(content: string, force = false) {
    if (!voiceOutputRef.current || speechSuppressedRef.current) return;
    let pending = content.slice(speechStreamCursorRef.current);
    while (pending) {
      const boundary = pending.match(/^[\s\S]*?[.!?](?:\s+|$)/)?.[0];
      if (!boundary && !force) break;
      const chunk = boundary || pending;
      speechStreamCursorRef.current += chunk.length;
      pending = content.slice(speechStreamCursorRef.current);
      enqueueSpeechChunk(chunk);
      if (!boundary) break;
    }
    if (force) {
      speechStreamDoneRef.current = true;
      if (!speechQueueActiveRef.current && !speechQueueRef.current.length)
        finishSpeechCycle();
    }
  }

  function startVoice() {
    if (listeningRef.current) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice('O reconhecimento de voz não está disponível neste navegador.');
      return;
    }
    if (speakingRef.current) interruptSpeechForBargeIn();
    finalSpeechRef.current = '';
    setVoiceInterim('');
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
      if (!loadingRef.current && !speakingRef.current)
        scheduleVoiceListening(520);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      scheduleVoiceListening(850);
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
        setPrompt(visible);
      }
      const finalText = final.trim();
      if (finalText && finalText !== finalSpeechRef.current) {
        finalSpeechRef.current = finalText;
        setVoiceInterim('');
        recognition.stop();
        void askNexo(finalText, 'voice');
      }
    };
    recognition.start();
  }

  function speak(text: string) {
    if (!voiceOutputRef.current || !('speechSynthesis' in window)) return;
    speechSuppressedRef.current = false;
    speechStreamCursorRef.current = 0;
    speechStreamDoneRef.current = false;
    queueStreamingSpeech(cleanSpeechText(text).slice(0, 900), true);
  }

  function stopVoicePresence() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    interruptSpeechForBargeIn();
    window.clearTimeout(voiceRestartTimer.current);
    window.clearTimeout(voicePulseTimer.current);
    voiceBoundaryRef.current = { charIndex: 0, elapsedMs: 0 };
    setListening(false);
    setVoiceInterim('');
    if (agentToken)
      void new NexoClient(agentToken).killPresence().catch(() => undefined);
  }

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setNotice('Resposta copiada.');
    } catch {
      setNotice('Não consegui copiar automaticamente.');
    }
  }

  function openGoogleSearch() {
    const query = prompt.trim();
    if (!query) {
      setNotice('Digite o que deseja pesquisar primeiro.');
      return;
    }
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  async function runAction(messageIndex: number, action: NexoAction) {
    if (!activeChat || action.status !== 'pending' || actionLoading) return;
    setActionLoading(true);
    setNotice('');
    try {
      const endpoints: Record<NexoAction['type'], string> = {
        write_file: '/files/write',
        create_folder: '/folders/create',
        read_file: '/files/read',
        list_files: '/files/list',
        create_project: '/projects/create',
      };
      const needsApproval = [
        'write_file',
        'create_folder',
        'create_project',
      ].includes(action.type);
      const response = await fetch(`${AGENT_URL}${endpoints[action.type]}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexo-Token': agentToken,
        },
        body: JSON.stringify({
          path: action.path,
          content: action.content,
          template: action.template,
          confirmation: needsApproval ? 'APPROVED' : undefined,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: unknown;
      };
      const resultObject =
        data.result &&
        typeof data.result === 'object' &&
        !Array.isArray(data.result)
          ? (data.result as {
              path?: string;
              content?: string;
              files?: string[];
            })
          : null;
      const output =
        action.type === 'read_file'
          ? resultObject?.content
          : action.type === 'list_files' && Array.isArray(data.result)
            ? data.result
                .map((item) => {
                  const entry = item as {
                    type?: string;
                    path?: string;
                    size?: number | null;
                  };
                  return `${entry.type === 'folder' ? '📁' : '📄'} ${entry.path}${entry.size ? ` · ${entry.size} bytes` : ''}`;
                })
                .join('\n')
            : resultObject?.files?.join(', ');
      if (
        response.ok &&
        output &&
        ['read_file', 'list_files'].includes(action.type)
      ) {
        setDocuments((current) =>
          [
            ...current,
            {
              name: `Agente: ${action.path}`,
              content: output.slice(0, 40_000),
            },
          ].slice(-8),
        );
      }
      const summary = response.ok
        ? action.type === 'read_file' || action.type === 'list_files'
          ? 'Leitura adicionada ao contexto'
          : `Concluído em ${resultObject?.path ?? action.path}`
        : (data.error ?? 'Falha ao executar.');
      const nextAction = {
        ...action,
        status: response.ok ? ('completed' as const) : ('failed' as const),
        result: summary,
        output: output?.slice(0, 8000),
      };
      const messages = activeChat.messages.map((message, index) =>
        index === messageIndex
          ? { ...message, content: JSON.stringify({ nexo_action: nextAction }) }
          : message,
      );
      const updated = { ...activeChat, messages, updatedAt: Date.now() };
      persistChats([
        updated,
        ...chats.filter((chat) => chat.id !== activeChat.id),
      ]);
    } catch {
      setNotice('O agente local não respondeu. Confirme se ele está ativo.');
      setAgentOnline(false);
    } finally {
      setActionLoading(false);
    }
  }

  function updateTaskMessage(messageIndex: number, task: AgentTask) {
    if (!activeChat) return;
    const messages = activeChat.messages.map((message, index) =>
      index === messageIndex
        ? { ...message, content: JSON.stringify(task), kind: 'task' as const }
        : message,
    );
    const updated = { ...activeChat, messages, updatedAt: Date.now() };
    persistChats([
      updated,
      ...chats.filter((chat) => chat.id !== activeChat.id),
    ]);
  }

  async function decideTaskPermission(
    messageIndex: number,
    task: AgentTask,
    permission: AgentPermission,
    decision: 'approved' | 'denied',
  ) {
    if (!agentToken || actionLoading) return;
    setActionLoading(true);
    setNotice(
      decision === 'approved'
        ? 'Ação aprovada. O agente retomou a tarefa…'
        : 'Ação negada.',
    );
    try {
      const nextTask = await new NexoClient(agentToken).decidePermission(
        task.id,
        permission.id,
        decision,
      );
      updateTaskMessage(messageIndex, nextTask);
      setNotice(
        nextTask.status === 'awaiting_approval'
          ? 'O agente precisa de uma nova aprovação.'
          : `Tarefa: ${taskStatusLabel(nextTask.status)}.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'O agente local não respondeu.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshAgentTask(messageIndex: number, taskId: string) {
    if (!agentToken || actionLoading) return;
    setActionLoading(true);
    try {
      const task = await new NexoClient(agentToken).getTask(taskId);
      updateTaskMessage(messageIndex, task);
      setNotice('Estado da tarefa atualizado.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui atualizar a tarefa.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function controlAgentTask(
    messageIndex: number,
    taskId: string,
    action: 'pause' | 'resume' | 'cancel',
  ) {
    if (!agentToken || actionLoading) return;
    setActionLoading(true);
    try {
      const task = await new NexoClient(agentToken).controlTask(taskId, action);
      updateTaskMessage(messageIndex, task);
      setNotice(
        action === 'pause'
          ? 'Tarefa pausada e salva em checkpoint.'
          : action === 'resume'
            ? 'Tarefa retomada do estado persistido.'
            : 'Tarefa cancelada.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui controlar a tarefa.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function askNexo(
    questionOverride?: string,
    inputSource: 'text' | 'voice' = 'text',
  ) {
    const question = (questionOverride ?? prompt).trim();
    if (!question || loadingRef.current) return;
    const requestStarted = performance.now();
    const requestLooksLikeImage =
      mode === 'Imagens' ||
      isImageCreationRequest(question, activeChat?.messages ?? []);
    setActivityLabel(
      requestLooksLikeImage
        ? 'Criando a imagem localmente…'
        : effort === 'Extra alto'
          ? 'Analisando com esforço extra alto…'
          : 'Preparando a resposta…',
    );
    loadingRef.current = true;
    setLoading(true);
    setNotice('');
    setPrompt('');
    requestController.current?.abort();
    requestController.current = new AbortController();

    const baseChat = activeChat ?? {
      id: crypto.randomUUID(),
      title: question.slice(0, 42),
      messages: [],
      updatedAt: Date.now(),
    };
    const requestAttachments = attachments;
    const userMessage: ChatMessage = {
      role: 'user',
      content: question,
      kind: 'text',
      input: inputSource,
      attachments: requestAttachments.map(({ type, name, mimeType }) => ({
        type,
        name,
        mimeType,
      })),
    };
    const pendingChat = {
      ...baseChat,
      title: baseChat.messages.length ? baseChat.title : question.slice(0, 42),
      messages: [...baseChat.messages, userMessage],
      updatedAt: Date.now(),
    };
    persistChats([
      pendingChat,
      ...chats.filter((chat) => chat.id !== baseChat.id),
    ]);
    setActiveChatId(baseChat.id);

    try {
      if (!agentOnline || !agentToken)
        throw new Error(
          'O Nexo Runtime está offline. Inicie o Nexo novamente.',
        );
      const effectiveModeV3 =
        mode === 'Imagens' ||
        isImageCreationRequest(question, baseChat.messages)
          ? 'Imagens'
          : mode;
      const displayStreamingV3 = !['Imagens', 'Planilhas'].includes(
        effectiveModeV3,
      );
      let responseTextV3 = '';
      let firstTokenV3: number | undefined;
      let modelLabelV3 = 'Nexo Runtime V4';
      if (voiceOutputRef.current) {
        speechSynthesis?.cancel();
        speechQueueRef.current = [];
        speechQueueActiveRef.current = false;
        speechStreamCursorRef.current = 0;
        speechStreamDoneRef.current = false;
        speechSuppressedRef.current = false;
      }
      const immediate = await new NexoClient(agentToken).streamChat(
        {
          question,
          mode: effectiveModeV3,
          effort,
          profile,
          history: baseChat.messages,
          documents,
          attachments: requestAttachments,
          webSearch,
          weather: weather
            ? { ...weather, description: weatherDescription(weather.code) }
            : null,
          imageQuality,
        },
        (event) => {
          if (event.type === 'meta') {
            modelLabelV3 = event.model;
            setActivityLabel(
              event.route === 'fast'
                ? 'Respondendo pelo caminho rápido…'
                : 'Analisando com contexto progressivo…',
            );
            return;
          }
          if (event.type === 'token') {
            if (firstTokenV3 === undefined)
              firstTokenV3 = performance.now() - requestStarted;
            responseTextV3 += event.content;
            queueStreamingSpeech(responseTextV3);
            if (displayStreamingV3) {
              const visible = responseTextV3;
              setChats((current) =>
                current.map((chat) =>
                  chat.id === baseChat.id
                    ? {
                        ...pendingChat,
                        messages: [
                          ...pendingChat.messages,
                          {
                            role: 'assistant',
                            content: visible,
                            kind: 'text',
                            firstTokenMs: firstTokenV3,
                            effort,
                            model: modelLabelV3,
                          },
                        ],
                        updatedAt: Date.now(),
                      }
                    : chat,
                ),
              );
            }
            return;
          }
          if (event.type === 'done') {
            responseTextV3 = event.content;
            modelLabelV3 = event.model;
            queueStreamingSpeech(responseTextV3, true);
          }
        },
        requestController.current.signal,
      );
      if (immediate?.kind === 'task') {
        const elapsedMs = performance.now() - requestStarted;
        const task = immediate.task;
        const completeChat = {
          ...pendingChat,
          messages: [
            ...pendingChat.messages,
            {
              role: 'assistant' as const,
              content: JSON.stringify(task),
              kind: 'task' as const,
              elapsedMs,
              firstTokenMs: elapsedMs,
              effort,
              model: 'Nexo Agent',
            },
          ],
          updatedAt: Date.now(),
        };
        persistChats([
          completeChat,
          ...chats.filter((chat) => chat.id !== baseChat.id),
        ]);
        setNotice(
          task.status === 'awaiting_approval'
            ? 'O agente aguarda sua aprovação.'
            : `Tarefa: ${taskStatusLabel(task.status)}.`,
        );
        return;
      }
      if (immediate?.kind === 'unavailable') {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = {
          ...pendingChat,
          messages: [
            ...pendingChat.messages,
            {
              role: 'assistant' as const,
              content: immediate.content,
              kind: 'unavailable' as const,
              elapsedMs,
              firstTokenMs: elapsedMs,
              effort,
              model: immediate.model,
            },
          ],
          updatedAt: Date.now(),
        };
        persistChats([
          completeChat,
          ...chats.filter((chat) => chat.id !== baseChat.id),
        ]);
        return;
      }
      if (immediate?.kind === 'media') {
        const artifact: MediaArtifact = await waitForMedia(
          new NexoClient(agentToken),
          immediate.job.id,
        );
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = {
          ...pendingChat,
          messages: [
            ...pendingChat.messages,
            {
              role: 'assistant' as const,
              content: `Artefato criado por ${artifact.provider}.`,
              kind: artifact.type as MessageKind,
              artifact,
              elapsedMs,
              firstTokenMs: elapsedMs,
              effort,
              model: artifact.model || immediate.model,
              sourcePrompt: question,
            },
          ],
          updatedAt: Date.now(),
        };
        persistChats([
          completeChat,
          ...chats.filter((chat) => chat.id !== baseChat.id),
        ]);
        return;
      }
      if (immediate?.kind === 'instant') {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = {
          ...pendingChat,
          messages: [
            ...pendingChat.messages,
            {
              role: 'assistant' as const,
              content: immediate.content,
              kind: 'text' as const,
              elapsedMs,
              firstTokenMs: elapsedMs,
              effort,
              model: 'Nexo Instant',
            },
          ],
          updatedAt: Date.now(),
        };
        persistChats([
          completeChat,
          ...chats.filter((chat) => chat.id !== baseChat.id),
        ]);
        speak(immediate.content);
        return;
      }
      responseTextV3 = responseTextV3.trim();
      if (!responseTextV3)
        throw new Error('O Runtime V4 não produziu uma resposta.');
      const kindV3: MessageKind =
        effectiveModeV3 === 'Planilhas' ? 'sheet' : 'text';
      const elapsedMsV3 = performance.now() - requestStarted;
      const completeChatV3 = {
        ...pendingChat,
        messages: [
          ...pendingChat.messages,
          {
            role: 'assistant' as const,
            content: responseTextV3,
            kind: kindV3,
            elapsedMs: elapsedMsV3,
            firstTokenMs: firstTokenV3 ?? elapsedMsV3,
            effort,
            model: modelLabelV3,
          },
        ],
        updatedAt: Date.now(),
      };
      persistChats([
        completeChatV3,
        ...chats.filter((chat) => chat.id !== baseChat.id),
      ]);
      return;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setNotice(
          error instanceof Error
            ? error.message
            : 'Não consegui acessar o modelo local. Confirme se o Ollama está aberto e tente novamente.',
        );
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setAttachments([]);
      requestController.current = null;
      if (
        voiceModeRef.current &&
        voiceConversationRef.current &&
        !speakingRef.current &&
        !speechQueueActiveRef.current
      )
        scheduleVoiceListening(420);
    }
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col p-3.5">
      <div className="flex items-center gap-3 px-2 py-2">
        <NexoOrb className="size-10" />
        <div>
          <p className="font-semibold tracking-[-.03em]">{BRAND_NAME}</p>
          <p className="text-[11px] text-muted-foreground">Seu espaço local</p>
        </div>
      </div>
      <Button
        className="mt-4 h-10 justify-start rounded-xl shadow-sm"
        onClick={createChat}
      >
        <Plus /> Novo
      </Button>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={chatSearch}
          onChange={(event) => setChatSearch(event.target.value)}
          className="h-9 rounded-xl border-transparent bg-muted/55 pl-9 text-xs shadow-none focus-visible:border-border"
          placeholder="Buscar conversas"
          aria-label="Buscar conversas"
        />
      </div>
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">
          Conversas
        </p>
        <ScrollArea className="min-h-0 flex-1 pr-1">
          <div className="space-y-1">
            {mounted && chats.length === 0 && (
              <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
                Suas conversas aparecerão aqui.
              </p>
            )}
            {visibleChats.map((chat) => (
              <div
                key={chat.id}
                className={`group flex items-center rounded-xl transition ${chat.id === activeChatId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}
              >
                <button
                  className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs"
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setMobileOpen(false);
                    setNotice('');
                  }}
                >
                  {chat.title}
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="mr-1 opacity-0 group-hover:opacity-100"
                  aria-label={`Excluir ${chat.title}`}
                  onClick={() => deleteChat(chat.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="my-2 h-px bg-border" />
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => {
          setPersonalOpen(true);
          setMobileOpen(false);
        }}
      >
        <FolderPlus /> Projetos
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => void openMemoryCenter()}
      >
        <Library /> Memória
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => {
          setPersonalOpen(true);
          setMobileOpen(false);
        }}
      >
        <LayoutDashboard /> Meu dia
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => {
          setCapabilityOpen(true);
          setMobileOpen(false);
        }}
      >
        <Blocks /> Capacidades
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => {
          setCommandOpen(true);
          setMobileOpen(false);
        }}
      >
        <Keyboard /> Comandos{' '}
        <kbd className="ml-auto text-[9px] text-muted-foreground">Ctrl K</kbd>
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={() => {
          setProfileOpen(true);
          setMobileOpen(false);
        }}
      >
        <Settings2 /> Configurações
      </Button>
    </div>
  );

  return (
    <main
      className="nexo-shell relative h-[100dvh] overflow-hidden text-foreground"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-3 z-[90] grid place-items-center rounded-3xl border-2 border-dashed border-primary/60 bg-background/88 backdrop-blur">
          <div className="text-center">
            <NexoOrb state="working" className="mx-auto size-14" />
            <p className="mt-4 font-medium">Solte para adicionar ao Nexo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Arquivos, imagens, áudio ou vídeo
            </p>
          </div>
        </div>
      )}
      <div className="grid h-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="nexo-sidebar hidden min-h-0 border-r border-border lg:block">
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="nexo-header flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                className="lg:hidden"
                size="icon"
                variant="ghost"
                aria-label="Abrir menu"
                onClick={() => setMobileOpen(true)}
              >
                <Menu />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {activeChat?.title ?? 'Nova conversa'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Abrir inteligência pessoal"
                title="Meu dia"
                onClick={() => setPersonalOpen(true)}
              >
                <LayoutDashboard />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Abrir paleta de comandos"
                title="Comandos (Ctrl+K)"
                onClick={() => setCommandOpen(true)}
              >
                <Keyboard />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Central de segurança"
                title="Central de segurança"
                onClick={() => setSecurityOpen(true)}
              >
                <ShieldCheck />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Tema atual: ${theme === 'system' ? 'automático' : theme === 'dark' ? 'escuro' : 'claro'}. Alterar tema`}
                title={`Tema: ${theme === 'system' ? 'automático' : theme === 'dark' ? 'escuro' : 'claro'}`}
                onClick={toggleTheme}
              >
                {mounted && theme === 'system' ? (
                  <Monitor />
                ) : theme === 'dark' ? (
                  <Moon />
                ) : (
                  <Sun />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="hidden gap-2 text-xs text-muted-foreground sm:flex"
                onClick={() => setSecurityOpen(true)}
                title="Runtime e privacidade"
              >
                <span
                  className={`size-1.5 rounded-full ${agentOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}
                />
                {agentOnline ? 'Local' : 'Offline'}
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="nexo-conversation flex min-h-full flex-col px-4 py-6 sm:px-7 sm:py-8">
                {history.length === 0 ? (
                  <div className="m-auto max-w-xl py-10 text-center">
                    <NexoOrb
                      state={
                        loading ? 'thinking' : listening ? 'listening' : 'idle'
                      }
                      className="mx-auto mb-7 size-20"
                    />
                    <p className="text-sm text-muted-foreground">
                      {new Date().getHours() >= 18
                        ? 'Boa noite'
                        : new Date().getHours() >= 12
                          ? 'Boa tarde'
                          : 'Bom dia'}
                      {profile.name ? `, ${profile.name}` : ''}.
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] sm:text-[2.6rem]">
                      O que vamos fazer?
                    </h1>
                    <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                      Converse normalmente. Quando a tarefa pedir mais, o{' '}
                      {BRAND_NAME} abre as ferramentas certas.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 py-2 sm:space-y-8">
                    {history.map((message, index) => {
                      const imagePrompt =
                        message.sourcePrompt ??
                        (history[index - 1]?.role === 'user'
                          ? history[index - 1].content
                          : '');
                      const cleanedSvg =
                        message.kind === 'image' && !message.artifact
                          ? cleanSvg(message.content)
                          : '';
                      const svg =
                        message.kind === 'image' && !message.artifact
                          ? cleanedSvg
                          : '';
                      const streaming =
                        loading &&
                        index === history.length - 1 &&
                        message.role === 'assistant';
                      return (
                        <article
                          key={`${message.role}-${index}`}
                          className={`nexo-message flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {message.role === 'assistant' && (
                            <NexoOrb
                              state={streaming ? 'thinking' : 'idle'}
                              className="mt-0.5 size-7 shrink-0"
                            />
                          )}
                          <div
                            className={`rounded-2xl text-[15px] leading-7 ${message.role === 'user' ? 'nexo-message-user rounded-br-md px-4 py-2.5' : 'nexo-message-assistant min-w-0 px-1 py-0.5'}`}
                          >
                            {message.artifact?.type === 'image' ? (
                              <>
                                <Image
                                  unoptimized
                                  width={1024}
                                  height={1024}
                                  className="max-h-[560px] w-full rounded-xl bg-black/5 object-contain"
                                  src={new NexoClient(agentToken).artifactUrl(
                                    message.artifact.id,
                                  )}
                                  alt={
                                    message.sourcePrompt ||
                                    'Imagem criada pelo Nexo'
                                  }
                                />
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <a
                                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"
                                    href={new NexoClient(
                                      agentToken,
                                    ).artifactUrl(message.artifact.id)}
                                    download
                                  >
                                    <Download className="size-3.5" /> Baixar
                                    imagem
                                  </a>
                                  {imagePrompt && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setMode('Imagens');
                                        setPrompt(
                                          `Crie uma variação de: ${imagePrompt}`,
                                        );
                                      }}
                                    >
                                      <RefreshCw /> Criar variação
                                    </Button>
                                  )}
                                </div>
                              </>
                            ) : message.artifact?.type === 'video' ? (
                              <>
                                <video
                                  className="max-h-[560px] w-full rounded-xl bg-black"
                                  controls
                                  src={new NexoClient(agentToken).artifactUrl(
                                    message.artifact.id,
                                  )}
                                />
                                <a
                                  className="mt-3 inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"
                                  href={new NexoClient(agentToken).artifactUrl(
                                    message.artifact.id,
                                  )}
                                  download
                                >
                                  <Download className="size-3.5" /> Baixar vídeo
                                </a>
                              </>
                            ) : message.artifact?.type === 'audio' ? (
                              <audio
                                className="w-full"
                                controls
                                src={new NexoClient(agentToken).artifactUrl(
                                  message.artifact.id,
                                )}
                              />
                            ) : message.kind === 'image' && svg ? (
                              <>
                                <Image
                                  unoptimized
                                  width={1024}
                                  height={1024}
                                  className="aspect-square w-full rounded-xl bg-white object-contain"
                                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                                  alt="Diagrama SVG criado pelo Nexo"
                                />
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Badge variant="outline">
                                    SVG legado · não é imagem gerada por modelo
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      download(
                                        svg,
                                        'diagrama-nexo.svg',
                                        'image/svg+xml',
                                      )
                                    }
                                  >
                                    <Download /> Baixar SVG
                                  </Button>
                                </div>
                              </>
                            ) : message.kind === 'sheet' ? (
                              <>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
                                  {stripFence(message.content)}
                                </pre>
                                <Button
                                  className="mt-3"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    download(
                                      '\ufeff' + stripFence(message.content),
                                      'planilha-nexo.csv',
                                      'text/csv;charset=utf-8',
                                    )
                                  }
                                >
                                  <Download /> Baixar planilha
                                </Button>
                              </>
                            ) : message.kind === 'task' &&
                              parseAgentTask(message.content) ? (
                              (() => {
                                const task = parseAgentTask(message.content)!;
                                return (
                                  <AgentTaskCard
                                    task={task}
                                    busy={actionLoading}
                                    onPermission={(permission, decision) =>
                                      void decideTaskPermission(
                                        index,
                                        task,
                                        permission,
                                        decision,
                                      )
                                    }
                                    onControl={(action) =>
                                      void controlAgentTask(
                                        index,
                                        task.id,
                                        action,
                                      )
                                    }
                                    onRefresh={() =>
                                      void refreshAgentTask(index, task.id)
                                    }
                                  />
                                );
                              })()
                            ) : message.kind === 'action' &&
                              parseAction(message.content) ? (
                              (() => {
                                const action = parseAction(message.content)!;
                                const readOnly = [
                                  'read_file',
                                  'list_files',
                                ].includes(action.type);
                                return (
                                  <div className="min-w-[260px] space-y-3">
                                    <div className="flex items-center gap-2 text-primary">
                                      <ShieldCheck className="size-4" />
                                      <span className="text-xs font-semibold uppercase tracking-wide">
                                        {readOnly
                                          ? 'Acesso local solicitado'
                                          : 'Ação protegida'}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="font-medium">
                                        {actionTitle(action)}
                                      </p>
                                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                        {action.path}
                                      </p>
                                      <p className="mt-2 text-xs text-muted-foreground">
                                        {action.reason}
                                      </p>
                                    </div>
                                    {action.content && (
                                      <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-2 font-mono text-[10px]">
                                        {action.content.slice(0, 1800)}
                                      </pre>
                                    )}
                                    {action.output && (
                                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono text-[10px]">
                                        {action.output}
                                      </pre>
                                    )}
                                    {action.status === 'pending' ? (
                                      <Button
                                        size="sm"
                                        disabled={
                                          !agentOnline ||
                                          !agentToken ||
                                          actionLoading
                                        }
                                        onClick={() =>
                                          void runAction(index, action)
                                        }
                                      >
                                        {action.type === 'write_file' ? (
                                          <FilePenLine />
                                        ) : action.type === 'create_folder' ? (
                                          <FolderPlus />
                                        ) : action.type === 'create_project' ? (
                                          <Server />
                                        ) : (
                                          <Library />
                                        )}
                                        {agentOnline
                                          ? actionLoading
                                            ? 'Executando…'
                                            : actionButton(action)
                                          : 'Agente local offline'}
                                      </Button>
                                    ) : (
                                      <Badge
                                        variant={
                                          action.status === 'completed'
                                            ? 'secondary'
                                            : 'destructive'
                                        }
                                      >
                                        {action.result}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })()
                            ) : message.role === 'assistant' ? (
                              <RichText content={message.content} />
                            ) : (
                              <p className="whitespace-pre-wrap">
                                {message.content}
                              </p>
                            )}
                            {message.role === 'assistant' &&
                              message.content && (
                                <div className="message-actions border-0">
                                  <span className="response-metrics">
                                    {streaming ? (
                                      <>
                                        <i /> Escrevendo
                                        {message.firstTokenMs !== undefined
                                          ? ` · iniciou em ${formatDuration(message.firstTokenMs)}`
                                          : '…'}
                                      </>
                                    ) : (
                                      <details>
                                        <summary className="cursor-pointer list-none rounded-md px-1 py-0.5 hover:bg-muted">
                                          Detalhes
                                        </summary>
                                        <div className="absolute z-20 mt-1 rounded-xl border border-border bg-popover p-3 shadow-xl">
                                          {message.model || 'Nexo'}
                                          {message.firstTokenMs !== undefined &&
                                            ` · início ${formatDuration(message.firstTokenMs)}`}
                                          {message.elapsedMs !== undefined &&
                                            ` · total ${formatDuration(message.elapsedMs)}`}
                                          {message.effort &&
                                            ` · ${message.effort}`}
                                        </div>
                                      </details>
                                    )}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    {!streaming &&
                                      (message.artifact ||
                                        message.content.includes('```')) && (
                                        <button
                                          aria-label="Abrir artefato"
                                          onClick={() =>
                                            setSelectedArtifact(message)
                                          }
                                        >
                                          <FileText />
                                          Abrir
                                        </button>
                                      )}
                                    {!streaming && message.kind === 'text' && (
                                      <button
                                        aria-label="Copiar resposta"
                                        onClick={() =>
                                          void copyText(message.content)
                                        }
                                      >
                                        <Copy /> Copiar
                                      </button>
                                    )}
                                  </span>
                                </div>
                              )}
                          </div>
                        </article>
                      );
                    })}
                    {loading &&
                      history[history.length - 1]?.role !== 'assistant' && (
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <NexoOrb state="thinking" className="size-7" />
                          <span>{activityLabel}</span>
                        </div>
                      )}
                    <div ref={messagesEnd} />
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="nexo-composer-wrap shrink-0 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
              <div className="mx-auto w-full max-w-[52rem]">
                {(documents.length > 0 || attachments.length > 0) && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {documents.map((doc, index) => (
                      <Badge
                        key={`${doc.name}-${index}`}
                        variant="secondary"
                        className="h-7 gap-1.5 px-2.5"
                      >
                        <FileText />
                        {doc.name}
                        <button
                          aria-label={`Remover ${doc.name}`}
                          onClick={() =>
                            setDocuments((items) =>
                              items.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    {attachments.map((item, index) => (
                      <Badge
                        key={`${item.name}-${index}`}
                        variant="secondary"
                        className="h-7 gap-1.5 px-2.5"
                      >
                        {['image', 'screen', 'camera'].includes(item.type) ? (
                          <ImageIcon />
                        ) : item.type === 'video' ? (
                          <Film />
                        ) : (
                          <Mic />
                        )}
                        {item.name}
                        <button
                          aria-label={`Remover ${item.name}`}
                          onClick={() =>
                            setAttachments((items) =>
                              items.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="composer rounded-[22px] border border-border/90 p-2 focus-within:border-primary/35">
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void askNexo();
                      }
                    }}
                    placeholder={
                      mode === 'Planilhas'
                        ? 'Descreva a planilha que precisa…'
                        : mode === 'Imagens'
                          ? 'Descreva a imagem que quer gerar…'
                          : mode === 'Vídeos'
                            ? 'Descreva um vídeo curto…'
                            : mode === 'Programar'
                              ? 'Descreva o código avançado…'
                              : mode === 'Agente'
                                ? 'Descreva a alteração no projeto…'
                                : 'Pode falar do seu jeito…'
                    }
                    className="min-h-14 max-h-32 resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-0.5">
                      <input
                        ref={fileInput}
                        className="hidden"
                        type="file"
                        multiple
                        accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,image/*,audio/*,video/*"
                        onChange={addDocuments}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Adicionar arquivo"
                        title="Adicionar arquivo"
                        onClick={() => fileInput.current?.click()}
                      >
                        <Plus />
                      </Button>
                      <PresenceControls
                        token={agentToken}
                        onCapture={(attachment) =>
                          setAttachments((items) =>
                            [...items, attachment].slice(-4),
                          )
                        }
                        onNotice={setNotice}
                      />
                      <Button
                        size="icon-sm"
                        variant={voiceModeOpen ? 'secondary' : 'ghost'}
                        aria-label="Abrir conversa por voz"
                        title="Conversa por voz"
                        onClick={() => {
                          voiceModeRef.current = true;
                          voiceOutputRef.current = true;
                          setVoiceModeOpen(true);
                          setVoiceOutput(true);
                          window.setTimeout(() => startVoice(), 280);
                        }}
                      >
                        <NexoLivingEyeMini state={voiceEyeState} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant={voiceOutput ? 'secondary' : 'ghost'}
                        aria-label="Ler respostas em voz alta"
                        title="Voz do Nexo"
                        onClick={() => {
                          const enabled = !voiceOutputRef.current;
                          voiceOutputRef.current = enabled;
                          setVoiceOutput(enabled);
                          if (!enabled) interruptSpeechForBargeIn();
                        }}
                      >
                        {voiceOutput ? <Volume2 /> : <VolumeX />}
                      </Button>
                      <Button
                        size="sm"
                        variant={webSearch ? 'secondary' : 'ghost'}
                        className={
                          webSearch ? 'text-primary' : 'text-muted-foreground'
                        }
                        onClick={() => setWebSearch((value) => !value)}
                      >
                        <Search />
                        <span className="hidden sm:inline">
                          {webSearch ? 'Pesquisa ligada' : 'Pesquisar'}
                        </span>
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Pesquisar no Google"
                        title="Abrir pesquisa no Google"
                        onClick={openGoogleSearch}
                      >
                        <Globe2 />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <details className="group relative">
                        <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                          {mode === 'Geral' ? 'Auto' : mode}
                          <ChevronDown className="size-3 transition group-open:rotate-180" />
                        </summary>
                        <div className="absolute bottom-10 right-0 z-30 w-56 rounded-2xl border border-border bg-popover p-2 shadow-2xl">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Comportamento
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {MODES.map((item) => (
                              <Button
                                key={item.label}
                                size="sm"
                                variant={
                                  mode === item.label ? 'secondary' : 'ghost'
                                }
                                className="justify-start text-xs"
                                onClick={() => setMode(item.label)}
                              >
                                {item.label === 'Geral' ? 'Auto' : item.label}
                              </Button>
                            ))}
                          </div>
                          <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Esforço
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {EFFORTS.map((item) => (
                              <Button
                                key={item}
                                size="sm"
                                variant={
                                  effort === item ? 'secondary' : 'ghost'
                                }
                                className="justify-start text-xs"
                                onClick={() => changeEffort(item)}
                              >
                                {item}
                              </Button>
                            ))}
                          </div>
                          {mode === 'Imagens' && (
                            <NativeSelect
                              size="sm"
                              aria-label="Qualidade da imagem"
                              className="mt-2 w-full"
                              value={imageQuality}
                              onChange={(event) =>
                                setImageQuality(
                                  event.target.value as typeof imageQuality,
                                )
                              }
                            >
                              {['FAST', 'BALANCED', 'HIGH', 'MAX'].map(
                                (item) => (
                                  <NativeSelectOption key={item} value={item}>
                                    {item}
                                  </NativeSelectOption>
                                ),
                              )}
                            </NativeSelect>
                          )}
                        </div>
                      </details>
                      {loading ? (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="rounded-xl"
                          onClick={() => requestController.current?.abort()}
                          aria-label="Parar resposta"
                        >
                          <Square className="size-3.5 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          className="rounded-xl"
                          onClick={() => void askNexo()}
                          disabled={!prompt.trim()}
                          aria-label="Enviar mensagem"
                        >
                          <ArrowUp />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {notice && (
                  <button
                    className="mx-auto mt-2 flex max-w-[min(100%,38rem)] items-center gap-2 rounded-full border border-border/70 bg-popover/92 px-3.5 py-1.5 text-left text-xs text-popover-foreground shadow-lg shadow-black/5 transition hover:bg-accent"
                    onClick={() => setNotice('')}
                  >
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{notice}</span>
                    <X className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 border-l border-border bg-sidebar/60">
          <ScrollArea className="h-full">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Contexto ativo</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O que o Nexo está usando
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setProfileOpen(true)}
                >
                  <Settings2 />
                </Button>
              </div>
              <div className="mt-6 space-y-2.5">
                {[
                  {
                    name: 'Modelos locais',
                    detail: `Qwen 3B/7B · esforço ${effort.toLowerCase()}`,
                    active: true,
                    icon: NexoMark,
                  },
                  {
                    name: 'Nexo Core',
                    detail: agentHealth?.agent
                      ? `${agentHealth.agent.database} · ${agentHealth.agent.tasks.running} ativa(s)`
                      : agentOnline
                        ? 'Inicializando runtime'
                        : 'Offline',
                    active: !!agentHealth?.agent,
                    icon: Bot,
                  },
                  {
                    name: 'Segurança',
                    detail: agentHealth?.security
                      ? `Sessão autenticada · ${agentHealth.security.rateLimitPerMinute}/min`
                      : 'Aguardando agente',
                    active: !!agentHealth?.security,
                    icon: ShieldCheck,
                  },
                  {
                    name: 'Rede / VPN',
                    detail: agentHealth?.network?.vpnDetected
                      ? `Ativa · ${agentHealth.network.interfaces.find((item) => item.vpn)?.name}`
                      : 'Nenhuma VPN detectada',
                    active: !!agentHealth?.network?.vpnDetected,
                    icon: Network,
                  },
                  {
                    name: 'Perfil',
                    detail: `${profile.name || 'Usuário'} · ${profile.style}`,
                    active: true,
                    icon: Check,
                  },
                  {
                    name: 'Horário',
                    detail: currentTime || 'Sincronizando',
                    active: !!currentTime,
                    icon: Clock3,
                  },
                  {
                    name: 'Clima',
                    detail: weather
                      ? `${weather.label} · ${weather.temperature}°C`
                      : profile.city
                        ? weatherStatus === 'loading'
                          ? 'Atualizando…'
                          : 'Não encontrado'
                        : 'Defina sua cidade',
                    active: !!weather,
                    icon: CloudSun,
                  },
                  {
                    name: 'Pesquisa',
                    detail: webSearch
                      ? 'Wikipedia + fontes especializadas'
                      : 'Desativada',
                    active: webSearch,
                    icon: Search,
                  },
                  {
                    name: 'Browser Agent',
                    detail: agentHealth?.agent?.capabilities?.browser
                      ?.automation?.available
                      ? `Playwright real · ${agentHealth.agent.capabilities.browser.automation.actions.length} ações`
                      : 'Navegação segura disponível',
                    active:
                      !!agentHealth?.agent?.capabilities?.browser?.automation
                        ?.available,
                    icon: Globe2,
                  },
                  {
                    name: 'Skills',
                    detail: agentHealth?.agent?.capabilities?.skills
                      ? `${agentHealth.agent.capabilities.skills.enabled} ativa(s)`
                      : 'Carregando catálogo local',
                    active: !!agentHealth?.agent?.capabilities?.skills?.enabled,
                    icon: Sparkles,
                  },
                  {
                    name: 'Segundo plano',
                    detail: agentHealth?.agent?.capabilities?.background
                      ? `${agentHealth.agent.capabilities.background.active} agendamento(s)`
                      : 'Scheduler offline',
                    active:
                      !!agentHealth?.agent?.capabilities?.background?.running,
                    icon: Gauge,
                  },
                  {
                    name: 'Documentos',
                    detail: documents.length
                      ? `${documents.length} arquivo(s)`
                      : 'Nenhum arquivo',
                    active: documents.length > 0,
                    icon: Library,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-border bg-card/55 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{item.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.detail}
                          </p>
                        </div>
                        <span
                          className={`size-2 shrink-0 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {!weather && (
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  variant="outline"
                  onClick={useDeviceLocation}
                >
                  <CloudSun /> Usar localização
                </Button>
              )}
              <Button
                className="mt-3 w-full"
                size="sm"
                variant="outline"
                onClick={() => setSecurityOpen(true)}
              >
                <ShieldCheck /> Abrir central de segurança
              </Button>
              <Button
                className="mt-3 w-full"
                size="sm"
                variant="outline"
                onClick={() => setPersonalOpen(true)}
              >
                <LayoutDashboard /> Abrir meu dia
              </Button>
              <Button
                className="mt-3 w-full"
                size="sm"
                variant="outline"
                onClick={() => void openMemoryCenter()}
              >
                <Library /> Gerenciar memória
              </Button>
              <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/7 p-4">
                <p className="text-xs font-medium text-primary">
                  Nexo Core {agentHealth?.agent?.version || 'local'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  {[
                    'Objetivos pessoais',
                    'Tarefas + prazos',
                    'Prioridade por evidência',
                    'Smart Resume',
                    'Modo estudo',
                    'Recall ativo',
                    'Proatividade opt-in',
                    'Quiet hours',
                    'Busca unificada',
                    'Triggers seguros',
                    'DAG persistente',
                    'Capability tokens',
                    'Project Workspace',
                    'Context Engine',
                    'Memória V3',
                    'RAG incremental',
                  ].map((capability) => (
                    <span
                      key={capability}
                      className="rounded-lg bg-muted px-2 py-1.5"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[290px] border-border bg-sidebar p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do Nexo</SheetTitle>
            <SheetDescription>Chats e configurações</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <PersonalWorkspace
        open={personalOpen}
        commandOpen={commandOpen}
        token={agentToken}
        onOpenChange={setPersonalOpen}
        onCommandOpenChange={setCommandOpen}
        onPrompt={(value, nextMode) => {
          if (nextMode) setMode(nextMode);
          setPrompt(value);
          setNotice('Comando preparado. Revise e envie quando quiser.');
        }}
        onNotice={setNotice}
      />
      <CapabilityCenter
        open={capabilityOpen}
        token={agentToken}
        onOpenChange={setCapabilityOpen}
        onNotice={setNotice}
      />
      <ArtifactPanel
        message={selectedArtifact}
        token={agentToken}
        onClose={() => setSelectedArtifact(null)}
      />
      <NexoVoicePresence
        open={voiceModeOpen}
        onOpenChange={(open) => {
          voiceModeRef.current = open;
          setVoiceModeOpen(open);
          if (!open) stopVoicePresence();
        }}
        state={voiceEyeState}
        transcript={voiceInterim || prompt}
        caption={voiceCaption}
        outputLevel={
          voicePreviewState === 'speaking'
            ? (voicePreviewLevel ?? 0.58)
            : voiceOutputLevel
        }
        preview={voicePreviewState !== null}
        previewLevel={voicePreviewLevel ?? undefined}
        conversationEnabled={voiceConversation}
        onConversationChange={(enabled) => {
          voiceConversationRef.current = enabled;
          setVoiceConversation(enabled);
          localStorage.setItem(
            'nexo-voice-conversation',
            enabled ? 'on' : 'off',
          );
          if (enabled) scheduleVoiceListening(220);
        }}
        onSpeechEnd={() => recognitionRef.current?.stop()}
        onBargeIn={() => {
          requestController.current?.abort();
          loadingRef.current = false;
          setLoading(false);
          interruptSpeechForBargeIn();
          window.setTimeout(() => startVoice(), 80);
        }}
        onListen={() => {
          voiceOutputRef.current = true;
          setVoiceOutput(true);
          startVoice();
        }}
        onStop={stopVoicePresence}
      />

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seu perfil no Nexo</DialogTitle>
            <DialogDescription>
              Essas preferências ficam neste computador e orientam todas as
              respostas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="profile-name" className="text-xs font-medium">
                Seu nome
              </label>
              <Input
                id="profile-name"
                value={profile.name}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Como o Nexo deve chamar você?"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="profile-city" className="text-xs font-medium">
                Sua cidade
              </label>
              <Input
                id="profile-city"
                value={profile.city}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
                placeholder="Ex.: São Paulo"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="profile-style" className="text-xs font-medium">
                Estilo de resposta
              </label>
              <Input
                id="profile-style"
                value={profile.style}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    style: event.target.value,
                  }))
                }
                placeholder="Direto, detalhado, descontraído…"
              />
            </div>
            <div className="grid gap-1.5">
              <label
                htmlFor="profile-instructions"
                className="text-xs font-medium"
              >
                Instruções pessoais
              </label>
              <Textarea
                id="profile-instructions"
                value={profile.instructions}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
                placeholder="Ex.: explique código para iniciantes e responda em português."
                className="min-h-24"
              />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium">Personalidade adaptativa</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              O Nexo aprende gradualmente seu nível de formalidade, humor,
              iniciativa e tamanho preferido de resposta. Você pode apagar
              somente essa adaptação quando quiser.
            </p>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => void resetAdaptivePersonality()}
            >
              Apagar adaptação
            </Button>
            <Button onClick={saveProfile}>Salvar perfil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border border-border bg-card sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="text-primary" /> Memória do Nexo
            </DialogTitle>
            <DialogDescription>
              Pesquise, confira e controle o que o Nexo mantém no SQLite deste
              computador.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={memoryQuery}
              onChange={(event) => setMemoryQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadMemories();
              }}
              placeholder="Pesquisar pelo significado…"
            />
            <Button
              variant="outline"
              onClick={() => void loadMemories()}
              disabled={memoryLoading}
            >
              <Search /> Buscar
            </Button>
          </div>
          <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <ScrollArea className="h-[360px] rounded-2xl border border-border">
              <div className="space-y-1 p-2">
                {memories.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">
                    {memoryLoading
                      ? 'Carregando…'
                      : 'Nenhuma memória encontrada.'}
                  </p>
                ) : (
                  memories.map((item) => (
                    <button
                      key={item.id}
                      className={`w-full rounded-xl p-3 text-left transition ${item.id === selectedMemoryId ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted'}`}
                      onClick={() => {
                        setSelectedMemoryId(item.id);
                        setMemoryDraft(item.content);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[9px]">
                          {item.type}
                        </Badge>
                        <span
                          className={`text-[9px] ${item.status === 'UNCERTAIN' ? 'text-amber-500' : 'text-emerald-500'}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5">
                        {item.summary || item.content}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {item.scope} · {Math.round(item.confidence * 100)}% ·{' '}
                        {item.source}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            {(() => {
              const item = memories.find(
                (memory) => memory.id === selectedMemoryId,
              );
              return item ? (
                <div className="flex h-[360px] min-h-0 flex-col rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{item.type}</Badge>
                    <Badge variant="outline">{item.privacy}</Badge>
                    <Badge variant="outline">{item.scope}</Badge>
                  </div>
                  <Textarea
                    className="mt-3 min-h-0 flex-1 resize-none"
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                  />
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Observado em{' '}
                    {new Date(item.observedAt).toLocaleString('pt-BR')} ·
                    confiança {Math.round(item.confidence * 100)}%
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void manageSelectedMemory('update')}
                      disabled={memoryLoading}
                    >
                      <FilePenLine /> Salvar
                    </Button>
                    {item.status === 'UNCERTAIN' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void manageSelectedMemory('confirm')}
                        disabled={memoryLoading}
                      >
                        <Check /> Confirmar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void manageSelectedMemory('forget')}
                      disabled={memoryLoading}
                    >
                      Arquivar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void manageSelectedMemory('delete')}
                      disabled={memoryLoading}
                    >
                      <Trash2 /> Apagar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid h-[360px] place-items-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
                  Selecione uma memória.
                </div>
              );
            })()}
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Memórias restritas nunca são enviadas a serviços externos. “Apagar”
            remove o registro; “Arquivar” o preserva fora da recuperação normal.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" /> Central de segurança
            </DialogTitle>
            <DialogDescription>
              O modelo sugere ações; o agente local valida caminhos, permissões
              e sua aprovação antes de executar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                title: 'Acesso local',
                detail: agentHealth?.security?.loopbackOnly
                  ? 'Restrito a 127.0.0.1'
                  : 'Agente offline',
                active: !!agentHealth?.security?.loopbackOnly,
                icon: Server,
              },
              {
                title: 'Sessão autenticada',
                detail: agentHealth?.security?.authenticatedSession
                  ? 'Token temporário ativo'
                  : 'Sem sessão',
                active: !!agentHealth?.security?.authenticatedSession,
                icon: ShieldCheck,
              },
              {
                title: 'Aprovação humana',
                detail: 'Obrigatória para toda escrita',
                active: true,
                icon: Check,
              },
              {
                title: 'Backups',
                detail: 'Antes de sobrescrever arquivos',
                active: agentOnline,
                icon: FilePenLine,
              },
              {
                title: 'Limite de ações',
                detail: agentHealth?.security
                  ? `${agentHealth.security.rateLimitPerMinute} por minuto`
                  : 'Agente offline',
                active: !!agentHealth?.security,
                icon: Clock3,
              },
              {
                title: 'Auditoria',
                detail: agentHealth?.security
                  ? `${agentHealth.security.auditEntries} evento(s) nesta sessão`
                  : 'Agente offline',
                active: !!agentHealth?.security,
                icon: Library,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-muted/35 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-xl bg-background text-muted-foreground">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{item.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <span
                      className={`ml-auto size-2 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <Network className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">VPN</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {agentHealth?.network?.vpnDetected
                    ? `Interface protegida detectada: ${agentHealth.network.interfaces.find((item) => item.vpn)?.name}.`
                    : 'Nenhuma VPN foi detectada. Para integrar conexão real com segurança, escolha e configure um provedor como WireGuard; o Nexo não altera sua rede sem uma configuração explícita.'}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">Área permitida:</span>{' '}
            {agentHealth?.workspace ?? 'agente local offline'}. Exclusão de
            arquivos, terminal irrestrito e mudanças de sistema permanecem
            bloqueados.
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
