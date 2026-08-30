'use client';
/* oxlint-disable react/react-compiler jsx-a11y/media-has-caption */

import { ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Bot, Check, Clock3, CloudSun, Code2, Copy, Download, Film, Gauge,
  FilePenLine, FileText, FolderPlus, Globe2, ImageIcon, Library, Menu, Mic, MicOff,
  Moon, Network, Paperclip, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles,
  Sun, Table2, Trash2, Volume2, VolumeX, X,
} from 'lucide-react';
import Image from 'next/image';
import { useNexoTaskSync } from '@/hooks/use-nexo-task-sync';
import { NexoClient, NEXO_AGENT_URL } from '@/lib/nexo/client';
import {
  parseAgentTask, taskStatusLabel, type AgentHealth, type AgentPermission, type AgentTask,
  type Chat, type ChatMessage, type Effort, type LocalAttachment, type LocalDocument, type MediaArtifact, type MessageKind, type NexoAction, type NexoMemory, type UserProfile,
} from '@/lib/nexo/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { NexoMark } from '@/components/nexo-mark';
import { AgentTaskCard } from '@/components/nexo/agent-task-card';

type Weather = { label: string; temperature: number; apparent: number; wind: number; code: number };
type WeatherApiResponse = { current: { temperature_2m: number; apparent_temperature: number; wind_speed_10m: number; weather_code: number } };
type GeocodingApiResponse = { results?: Array<{ name: string; admin1?: string; latitude: number; longitude: number }> };
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type LocalSpeechRecognition = {
  lang: string; interimResults: boolean; start(): void;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null;
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
  name: 'Bruno', city: '', style: 'Natural, acolhedor e proativo', instructions: '',
};

function safeParse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function stripFence(content: string) {
  return content.replace(/^```(?:csv|svg|xml)?\s*/i, '').replace(/```\s*$/i, '').trim();
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

function hasDetailedVisual(svg: string) {
  const shapes = svg.match(/<(?:path|circle|ellipse|rect|polygon|polyline|line)\b/gi)?.length ?? 0;
  const organicShapes = svg.match(/<(?:path|circle|ellipse|polygon|polyline)\b/gi)?.length ?? 0;
  const textElements = svg.match(/<text\b/gi)?.length ?? 0;
  return shapes >= 8 && organicShapes >= 3 && !(textElements > 0 && shapes < 12);
}


function normalizeInput(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[?!.,]+$/g, '');
}

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return '';
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}



function polishPortuguese(content: string) {
  return content
    .replace(/Como posso eu ajudar/gi, 'Como posso ajudar')
    .replace(/Como posso ajudar você hoje\??/gi, 'O que está passando pela sua cabeça hoje?')
    .replace(/Como posso assisti-lo hoje\??/gi, 'O que está passando pela sua cabeça hoje?')
    .replace(/Posso respondo/gi, 'Posso responder')
    .replace(/\bSou informações\b/gi, 'Tenho informações')
    .replace(/\bSou capacidade\b/gi, 'Tenho capacidade')
    .replace(/\bSou habilidade\b/gi, 'Tenho habilidade')
    .replace(/aprendizado continuo/gi, 'aprendizado contínuo')
    .replace(/conforme você me interage/gi, 'conforme interagimos')
    .replace(/Como vai as coisas\?/gi, 'Como vão as coisas?')
    .replace(/Se (?:você )?tiver mais alguma (?:pergunta|dúvida)[\s\S]*?sinta-se à vontade para perguntar!?/gi, 'Qual parte disso você gostaria de explorar primeiro?')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function isImageCreationRequest(question: string, history: ChatMessage[]) {
  const normalized = normalizeInput(question);
  const direct = /\b(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper|foto)\b/.test(normalized)
    || /\b(quero|preciso de)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper)\b/.test(normalized);
  if (direct) return true;
  const isShortCommand = /^(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b/.test(normalized) && normalized.length < 100;
  const recentImageContext = history.slice(-4).some(message => /\b(imagem|ilustracao|desenho|svg|logo|icone)\b/.test(normalizeInput(message.content)));
  return isShortCommand && recentImageContext;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

function fallbackSvg(prompt: string) {
  const normalized = normalizeInput(prompt);
  const isNotebook = /\b(note|notebook|laptop|computador)\b/.test(normalized);
  const isComputerMouse = /\bmouse\b/.test(normalized) && !/\b(rato|camundongo|animal)\b/.test(normalized);
  const title = escapeXml(prompt.slice(0, 54) || 'Criação do Nexo');
  const subject = isComputerMouse
    ? `<g transform="translate(512 430)"><ellipse cx="18" cy="238" rx="238" ry="64" fill="#07091a" opacity=".55"/><path d="M4-284C-122-282-224-178-228-42l-3 126c-4 180 91 294 235 294S243 264 239 84l-3-126C232-178 130-282 4-284Z" fill="url(#mouseBody)" stroke="#b9aeff" stroke-width="11"/><path d="M4-277V-54" fill="none" stroke="#a89cff" stroke-width="8" opacity=".8"/><path d="M-214-45C-146-7-72 9 4 9S154-7 222-45" fill="none" stroke="#33267e" stroke-width="8"/><rect x="-25" y="-151" width="58" height="116" rx="29" fill="#12162f" stroke="#7df4dd" stroke-width="7"/><rect x="-8" y="-128" width="24" height="58" rx="12" fill="#baff78"/><path d="M-172 87C-133 149-76 181 4 181S141 149 180 87" fill="none" stroke="#8a78ef" stroke-width="6" opacity=".7"/><rect x="-220" y="58" width="18" height="82" rx="9" fill="#7df4dd"/><rect x="202" y="58" width="18" height="82" rx="9" fill="#7df4dd"/><circle cx="4" cy="257" r="12" fill="#c8ff7c"/><path d="M4 269c0 86 81 74 81 152 0 51-37 77-87 77" fill="none" stroke="#9f91ef" stroke-width="10" stroke-linecap="round"/></g>`
    : isNotebook
    ? `<g transform="translate(142 210)"><rect x="62" y="16" width="616" height="420" rx="34" fill="#11142a" stroke="#9f8cff" stroke-width="14"/><rect x="94" y="50" width="552" height="352" rx="16" fill="url(#screen)"/><circle cx="370" cy="34" r="6" fill="#d8d0ff"/><path d="M18 448h704l82 92c12 14 2 36-17 36H-47c-19 0-29-22-17-36l82-92Z" fill="#dad7ee"/><path d="M270 469h200l28 38H242l28-38Z" fill="#aaa5c5"/><rect x="-26" y="540" width="788" height="18" rx="9" fill="#7363d5"/></g>`
    : `<g transform="translate(512 430)"><circle r="238" fill="url(#orb)" opacity=".95"/><path d="M-208 76C-92-122 60-170 212-58C96-48 8 24-38 164C-92 122-150 92-208 76Z" fill="#c9ff72" opacity=".88"/><circle cx="112" cy="-108" r="76" fill="#fff" opacity=".78"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="${title}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c1025"/><stop offset="1" stop-color="#37266c"/></linearGradient><linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6847e8"/><stop offset=".52" stop-color="#27c7d7"/><stop offset="1" stop-color="#b9ff73"/></linearGradient><linearGradient id="mouseBody" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8170ee"/><stop offset=".48" stop-color="#4e3bb5"/><stop offset="1" stop-color="#211b58"/></linearGradient><radialGradient id="orb"><stop stop-color="#9a84ff"/><stop offset=".58" stop-color="#4f37c8"/><stop offset="1" stop-color="#171b49"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="28"/></filter></defs><rect width="1024" height="1024" rx="72" fill="url(#bg)"/><circle cx="770" cy="190" r="130" fill="#745cff" opacity=".26" filter="url(#glow)"/>${subject}<rect x="96" y="828" width="832" height="110" rx="30" fill="#080b1c" opacity=".66"/><text x="512" y="875" fill="#fff" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700">CRIADO LOCALMENTE PELO NEXO</text><text x="512" y="912" fill="#cbc5eb" text-anchor="middle" font-family="Arial, sans-serif" font-size="19">${title}</text></svg>`;
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
  const parts = content.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

function RichText({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  const isBlockStart = (line: string) => !line.trim() || /^```|^#{1,3}\s+|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) { code.push(lines[index]); index += 1; }
      index += 1;
      blocks.push(<div className="nexo-code" key={`code-${index}`}><div><span>{language || 'código'}</span></div><pre><code>{code.join('\n')}</code></pre></div>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(level === 1 ? <h2 key={index}>{renderInline(heading[2])}</h2> : level === 2 ? <h3 key={index}>{renderInline(heading[2])}</h3> : <h4 key={index}>{renderInline(heading[2])}</h4>);
      index += 1; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        if (/^\s*[-*]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*[-*]\s+/, '')); index += 1; continue; }
        if (!lines[index].trim() && /^\s*[-*]\s+/.test(lines[index + 1] ?? '')) { index += 1; continue; }
        break;
      }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      const start = Number(line.match(/^\s*(\d+)[.)]\s+/)?.[1] ?? 1);
      while (index < lines.length) {
        if (/^\s*\d+[.)]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*\d+[.)]\s+/, '')); index += 1; continue; }
        if (!lines[index].trim() && /^\s*\d+[.)]\s+/.test(lines[index + 1] ?? '')) { index += 1; continue; }
        break;
      }
      blocks.push(<ol start={start} key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('>')) { quote.push(lines[index].replace(/^>\s?/, '')); index += 1; }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '))}</blockquote>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) { paragraph.push(lines[index].trim()); index += 1; }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }
  return <div className="nexo-rich-text">{blocks}</div>;
}

function parseAction(content: string): NexoAction | null {
  try {
    const parsed = JSON.parse(stripFence(content)) as { nexo_action?: NexoAction };
    const action = parsed.nexo_action;
    if (!action || !['write_file', 'create_folder', 'read_file', 'list_files', 'create_project'].includes(action.type) || !action.path || !action.reason) return null;
    if (action.type === 'create_project' && !['static-site', 'node-api', 'python-api', 'ai-service'].includes(action.template ?? '')) return null;
    return { ...action, status: action.status ?? 'pending' };
  } catch { return null; }
}

function actionTitle(action: NexoAction) {
  return {
    write_file: 'Criar ou alterar arquivo', create_folder: 'Criar pasta', read_file: 'Ler arquivo',
    list_files: 'Listar pasta', create_project: `Criar projeto · ${action.template ?? ''}`,
  }[action.type];
}

function actionButton(action: NexoAction) {
  return ['write_file', 'create_folder', 'create_project'].includes(action.type) ? 'Revisar e aprovar' : 'Permitir leitura';
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState('Geral');
  const [effort, setEffort] = useState<Effort>('Médio');
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<NexoMemory[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [selectedMemoryId, setSelectedMemoryId] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [currentTime, setCurrentTime] = useState('');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentToken, setAgentToken] = useState('');
  const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId),
    [chats, activeChatId],
  );
  const history = activeChat?.messages ?? [];

  useEffect(() => {
    const storedChats = safeParse<Chat[]>(localStorage.getItem('nexo-chats'), []);
    const storedProfile = { ...DEFAULT_PROFILE, ...safeParse<Partial<UserProfile>>(localStorage.getItem('nexo-profile'), {}) };
    if (!localStorage.getItem('nexo-personality-v2') && storedProfile.style === 'Direto e amigável') {
      storedProfile.style = 'Natural, acolhedor e proativo';
      localStorage.setItem('nexo-profile', JSON.stringify(storedProfile));
      localStorage.setItem('nexo-personality-v2', '1');
    }
    const legacy = safeParse<ChatMessage[]>(localStorage.getItem('nexo-history'), []);
    const initialChats = storedChats.length ? storedChats : legacy.length ? [{ id: crypto.randomUUID(), title: 'Conversa anterior', messages: legacy, updatedAt: Date.now() }] : [];
    const storedTheme = localStorage.getItem('nexo-theme');
    const storedEffort = localStorage.getItem('nexo-effort') as Effort | null;
    const nextTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(nextTheme); document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    if (storedEffort && EFFORTS.includes(storedEffort)) setEffort(storedEffort);
    setProfile(storedProfile); setChats(initialChats); setActiveChatId(initialChats[0]?.id ?? ''); setMounted(true);
    if (initialChats.length && !storedChats.length) localStorage.setItem('nexo-chats', JSON.stringify(initialChats));

    const updateClock = () => setCurrentTime(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date()));
    updateClock(); const timer = window.setInterval(updateClock, 30_000);
    if (storedProfile.city) void loadWeatherByCity(storedProfile.city);
    new NexoClient().health().then(async (data: AgentHealth) => {
      setAgentOnline(true); setAgentToken(data.sessionToken); setAgentHealth(data);
      const client = new NexoClient(data.sessionToken);
      void client.warmRuntime(storedEffort && EFFORTS.includes(storedEffort) ? storedEffort : 'Médio').catch(() => undefined);
      const payload = await client.getSession();
      if (payload) {
        const remoteChats = payload.session?.state?.chats ?? [];
        if (remoteChats.length) {
          const merged = new Map<string, Chat>();
          for (const chat of [...initialChats, ...remoteChats]) {
            const existing = merged.get(chat.id);
            if (!existing || chat.updatedAt > existing.updatedAt) merged.set(chat.id, chat);
          }
          const restored = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
          setChats(restored); setActiveChatId(current => current || restored[0]?.id || '');
          localStorage.setItem('nexo-chats', JSON.stringify(restored));
        }
        if (payload.session?.state?.profile) setProfile(current => ({ ...current, ...payload.session!.state!.profile }));
      }
    }).catch(() => { setAgentOnline(false); setAgentToken(''); setAgentHealth(null); });
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, loading]);

  useNexoTaskSync({ chats, setChats, token: agentToken, profile, setOnline: setAgentOnline });

  function persistChats(next: Chat[]) {
    const limited = next
      .map(chat => ({ ...chat, messages: chat.messages.slice(-80) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
    setChats(limited);
    try { localStorage.setItem('nexo-chats', JSON.stringify(limited)); } catch { setNotice('A memória local está cheia. Exclua chats antigos.'); }
    syncAgentSession(limited, profile);
  }

  function syncAgentSession(nextChats: Chat[], nextProfile: UserProfile) {
    if (!agentToken) return;
    void new NexoClient(agentToken).saveSession(nextChats, nextProfile).catch(() => undefined);
  }


  function createChat() {
    if (activeChat && activeChat.messages.length === 0) { setMobileOpen(false); return; }
    const chat: Chat = { id: crypto.randomUUID(), title: 'Nova conversa', messages: [], updatedAt: Date.now() };
    persistChats([chat, ...chats]); setActiveChatId(chat.id); setPrompt(''); setNotice(''); setMobileOpen(false);
  }

  function deleteChat(id: string) {
    const next = chats.filter(chat => chat.id !== id); persistChats(next);
    if (activeChatId === id) setActiveChatId(next[0]?.id ?? '');
  }

  async function fetchWeather(latitude: number, longitude: number, label: string) {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
    if (!response.ok) throw new Error('weather');
    const data = await response.json() as WeatherApiResponse; const current = data.current;
    const next = { label, temperature: current.temperature_2m, apparent: current.apparent_temperature, wind: current.wind_speed_10m, code: current.weather_code };
    setWeather(next); setWeatherStatus('idle'); return next;
  }

  async function loadWeatherByCity(city: string) {
    if (!city.trim()) return null;
    setWeatherStatus('loading');
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`);
      const data = await response.json() as GeocodingApiResponse; const place = data.results?.[0];
      if (!place) throw new Error('city');
      return await fetchWeather(place.latitude, place.longitude, `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}`);
    } catch { setWeatherStatus('error'); setWeather(null); return null; }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) { setWeatherStatus('error'); return; }
    setWeatherStatus('loading');
    navigator.geolocation.getCurrentPosition(
      position => void fetchWeather(position.coords.latitude, position.coords.longitude, 'Sua localização').catch(() => setWeatherStatus('error')),
      () => setWeatherStatus('error'),
      { timeout: 12_000 },
    );
  }

  function saveProfile() {
    localStorage.setItem('nexo-profile', JSON.stringify(profile)); setProfileOpen(false);
    syncAgentSession(chats, profile);
    if (profile.city) void loadWeatherByCity(profile.city);
  }

  async function resetAdaptivePersonality() {
    if (!agentToken) { setNotice('O Nexo Runtime está offline.'); return; }
    try {
      await new NexoClient(agentToken).resetPersonality();
      setNotice('Adaptação aprendida apagada. A identidade-base do Nexo foi mantida.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não consegui apagar a adaptação.'); }
  }

  async function loadMemories(query = memoryQuery) {
    if (!agentToken) { setNotice('O Nexo Runtime está offline.'); return; }
    setMemoryLoading(true);
    try {
      const items = await new NexoClient(agentToken).listMemories({ query: query.trim() || undefined, limit: 100 });
      setMemories(items); const selected = items.find(item => item.id === selectedMemoryId) || items[0];
      setSelectedMemoryId(selected?.id || ''); setMemoryDraft(selected?.content || '');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não consegui abrir a memória.'); }
    finally { setMemoryLoading(false); }
  }

  async function openMemoryCenter() { setMemoryOpen(true); setMobileOpen(false); await loadMemories(''); }
  async function manageSelectedMemory(action: 'update' | 'confirm' | 'forget' | 'delete') {
    if (!agentToken || !selectedMemoryId) return;
    setMemoryLoading(true);
    try {
      await new NexoClient(agentToken).manageMemory(selectedMemoryId, action, action === 'update' ? { content: memoryDraft } : undefined);
      setNotice(action === 'delete' ? 'Memória apagada definitivamente.' : action === 'forget' ? 'Memória arquivada.' : action === 'confirm' ? 'Memória confirmada.' : 'Memória atualizada.');
      await loadMemories(memoryQuery);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não consegui alterar a memória.'); }
    finally { setMemoryLoading(false); }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); localStorage.setItem('nexo-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  function changeEffort(next: Effort) {
    setEffort(next); localStorage.setItem('nexo-effort', next);
    if (agentToken) void new NexoClient(agentToken).warmRuntime(next).catch(() => undefined);
  }

  async function addDocuments(event: ChangeEvent<HTMLInputElement>) {
    const accepted: LocalDocument[] = [];
    const media: LocalAttachment[] = [];
    for (const file of Array.from(event.target.files ?? [])) {
      if (/^(image|audio|video)\//.test(file.type)) {
        if (file.size > 8_000_000) { setNotice(`${file.name} é maior que 8 MB e não foi anexado.`); continue; }
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Formato inválido.')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
          media.push({ type: file.type.split('/')[0] as LocalAttachment['type'], name: file.name, mimeType: file.type, dataUrl });
        } catch { setNotice(`Não consegui ler ${file.name}.`); }
        continue;
      }
      if (file.size > 2_000_000) { setNotice(`${file.name} é maior que 2 MB e não foi adicionado.`); continue; }
      try { accepted.push({ name: file.name, content: (await file.text()).slice(0, 40_000) }); } catch { setNotice(`Não consegui ler ${file.name}.`); }
    }
    setDocuments(current => [...current, ...accepted].slice(-8)); event.target.value = '';
    setAttachments(current => [...current, ...media].slice(-4));
    if (agentToken) for (const document of accepted) {
      void new NexoClient(agentToken).indexText(`upload:${document.name}`, document.content, { uploadedFromBrowser: true, trust: 'untrusted' }).catch(() => undefined);
    }
  }

  async function waitForMedia(client: NexoClient, jobId: string) {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const job = await client.getMediaJob(jobId);
      setActivityLabel(job.status === 'queued' ? 'Na fila de mídia local…' : job.status === 'running' ? 'Gerando no seu computador…' : 'Finalizando artefato…');
      if (job.status === 'completed' && job.artifactId) { const artifact = await client.getArtifact(job.artifactId); if (!artifact) throw new Error('O artefato terminou, mas não foi encontrado.'); return artifact; }
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error || `Geração ${job.status}.`);
      await new Promise(resolve => window.setTimeout(resolve, 900));
    }
    throw new Error('A geração ultrapassou 10 minutos. O job permanece salvo no Nexo Core.');
  }


  function startVoice() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setNotice('O reconhecimento de voz não está disponível neste navegador.'); return; }
    const recognition = new Recognition(); recognition.lang = 'pt-BR'; recognition.interimResults = false;
    recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false); recognition.onerror = () => setListening(false);
    recognition.onresult = event => setPrompt(event.results[0][0].transcript); recognition.start();
  }

  function speak(text: string) {
    if (!voiceOutput || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'pt-BR'; speechSynthesis.speak(utterance);
  }

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }

  async function copyText(content: string) {
    try { await navigator.clipboard.writeText(content); setNotice('Resposta copiada.'); }
    catch { setNotice('Não consegui copiar automaticamente.'); }
  }


  function openGoogleSearch() {
    const query = prompt.trim();
    if (!query) { setNotice('Digite o que deseja pesquisar primeiro.'); return; }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  async function runAction(messageIndex: number, action: NexoAction) {
    if (!activeChat || action.status !== 'pending' || actionLoading) return;
    setActionLoading(true); setNotice('');
    try {
      const endpoints: Record<NexoAction['type'], string> = {
        write_file: '/files/write', create_folder: '/folders/create', read_file: '/files/read',
        list_files: '/files/list', create_project: '/projects/create',
      };
      const needsApproval = ['write_file', 'create_folder', 'create_project'].includes(action.type);
      const response = await fetch(`${AGENT_URL}${endpoints[action.type]}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexo-Token': agentToken },
        body: JSON.stringify({ path: action.path, content: action.content, template: action.template, confirmation: needsApproval ? 'APPROVED' : undefined }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; result?: unknown };
      const resultObject = data.result && typeof data.result === 'object' && !Array.isArray(data.result) ? data.result as { path?: string; content?: string; files?: string[] } : null;
      const output = action.type === 'read_file' ? resultObject?.content : action.type === 'list_files' && Array.isArray(data.result) ? data.result.map(item => {
        const entry = item as { type?: string; path?: string; size?: number | null };
        return `${entry.type === 'folder' ? '📁' : '📄'} ${entry.path}${entry.size ? ` · ${entry.size} bytes` : ''}`;
      }).join('\n') : resultObject?.files?.join(', ');
      if (response.ok && output && ['read_file', 'list_files'].includes(action.type)) {
        setDocuments(current => [...current, { name: `Agente: ${action.path}`, content: output.slice(0, 40_000) }].slice(-8));
      }
      const summary = response.ok
        ? action.type === 'read_file' || action.type === 'list_files' ? 'Leitura adicionada ao contexto' : `Concluído em ${resultObject?.path ?? action.path}`
        : data.error ?? 'Falha ao executar.';
      const nextAction = { ...action, status: response.ok ? 'completed' as const : 'failed' as const, result: summary, output: output?.slice(0, 8000) };
      const messages = activeChat.messages.map((message, index) => index === messageIndex ? { ...message, content: JSON.stringify({ nexo_action: nextAction }) } : message);
      const updated = { ...activeChat, messages, updatedAt: Date.now() };
      persistChats([updated, ...chats.filter(chat => chat.id !== activeChat.id)]);
    } catch { setNotice('O agente local não respondeu. Confirme se ele está ativo.'); setAgentOnline(false); }
    finally { setActionLoading(false); }
  }

  function updateTaskMessage(messageIndex: number, task: AgentTask) {
    if (!activeChat) return;
    const messages = activeChat.messages.map((message, index) => index === messageIndex ? { ...message, content: JSON.stringify(task), kind: 'task' as const } : message);
    const updated = { ...activeChat, messages, updatedAt: Date.now() };
    persistChats([updated, ...chats.filter(chat => chat.id !== activeChat.id)]);
  }

  async function decideTaskPermission(messageIndex: number, task: AgentTask, permission: AgentPermission, decision: 'approved' | 'denied') {
    if (!agentToken || actionLoading) return;
    setActionLoading(true); setNotice(decision === 'approved' ? 'Ação aprovada. O agente retomou a tarefa…' : 'Ação negada.');
    try {
      const nextTask = await new NexoClient(agentToken).decidePermission(task.id, permission.id, decision);
      updateTaskMessage(messageIndex, nextTask);
      setNotice(nextTask.status === 'awaiting_approval' ? 'O agente precisa de uma nova aprovação.' : `Tarefa: ${taskStatusLabel(nextTask.status)}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'O agente local não respondeu.'); }
    finally { setActionLoading(false); }
  }

  async function refreshAgentTask(messageIndex: number, taskId: string) {
    if (!agentToken || actionLoading) return;
    setActionLoading(true);
    try {
      const task = await new NexoClient(agentToken).getTask(taskId);
      updateTaskMessage(messageIndex, task); setNotice('Estado da tarefa atualizado.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não consegui atualizar a tarefa.'); }
    finally { setActionLoading(false); }
  }

  async function controlAgentTask(messageIndex: number, taskId: string, action: 'pause' | 'resume' | 'cancel') {
    if (!agentToken || actionLoading) return;
    setActionLoading(true);
    try {
      const task = await new NexoClient(agentToken).controlTask(taskId, action); updateTaskMessage(messageIndex, task);
      setNotice(action === 'pause' ? 'Tarefa pausada e salva em checkpoint.' : action === 'resume' ? 'Tarefa retomada do estado persistido.' : 'Tarefa cancelada.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não consegui controlar a tarefa.'); }
    finally { setActionLoading(false); }
  }

  async function askNexo() {
    const question = prompt.trim();
    if (!question || loading) return;
    const requestStarted = performance.now();
    const requestLooksLikeImage = mode === 'Imagens' || isImageCreationRequest(question, activeChat?.messages ?? []);
    setActivityLabel(requestLooksLikeImage ? 'Criando a imagem localmente…' : effort === 'Extra alto' ? 'Analisando com esforço extra alto…' : 'Preparando a resposta…');
    setLoading(true); setNotice(''); setPrompt('');

    const baseChat = activeChat ?? { id: crypto.randomUUID(), title: question.slice(0, 42), messages: [], updatedAt: Date.now() };
    const requestAttachments = attachments;
    const userMessage: ChatMessage = { role: 'user', content: question, kind: 'text', attachments: requestAttachments.map(({ type, name, mimeType }) => ({ type, name, mimeType })) };
    const pendingChat = { ...baseChat, title: baseChat.messages.length ? baseChat.title : question.slice(0, 42), messages: [...baseChat.messages, userMessage], updatedAt: Date.now() };
    persistChats([pendingChat, ...chats.filter(chat => chat.id !== baseChat.id)]); setActiveChatId(baseChat.id);

    try {
      if (!agentOnline || !agentToken) throw new Error('O Nexo Runtime está offline. Inicie o Nexo novamente.');
      const effectiveModeV3 = mode === 'Imagens' || isImageCreationRequest(question, baseChat.messages) ? 'Imagens' : mode;
      const displayStreamingV3 = !['Imagens', 'Planilhas'].includes(effectiveModeV3);
      let responseTextV3 = ''; let firstTokenV3: number | undefined; let modelLabelV3 = 'Nexo Runtime V4';
      const immediate = await new NexoClient(agentToken).streamChat({
        question, mode: effectiveModeV3, effort, profile, history: baseChat.messages, documents, attachments: requestAttachments, webSearch,
        weather: weather ? { ...weather, description: weatherDescription(weather.code) } : null,
      }, event => {
        if (event.type === 'meta') {
          modelLabelV3 = event.model;
          setActivityLabel(event.route === 'fast' ? 'Respondendo pelo caminho rápido…' : 'Analisando com contexto progressivo…');
          return;
        }
        if (event.type === 'token') {
          if (firstTokenV3 === undefined) firstTokenV3 = performance.now() - requestStarted;
          responseTextV3 += event.content;
          if (displayStreamingV3) {
            const visible = responseTextV3;
            setChats(current => current.map(chat => chat.id === baseChat.id ? { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant', content: visible, kind: 'text', firstTokenMs: firstTokenV3, effort, model: modelLabelV3 }], updatedAt: Date.now() } : chat));
          }
          return;
        }
        if (event.type === 'done') { responseTextV3 = event.content; modelLabelV3 = event.model; }
      });
      if (immediate?.kind === 'task') {
        const elapsedMs = performance.now() - requestStarted; const task = immediate.task;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: JSON.stringify(task), kind: 'task' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: 'Nexo Agent' }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]);
        setNotice(task.status === 'awaiting_approval' ? 'O agente aguarda sua aprovação.' : `Tarefa: ${taskStatusLabel(task.status)}.`);
        return;
      }
      if (immediate?.kind === 'unavailable') {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: immediate.content, kind: 'unavailable' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: immediate.model }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]); return;
      }
      if (immediate?.kind === 'media') {
        const artifact: MediaArtifact = await waitForMedia(new NexoClient(agentToken), immediate.job.id); const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: `Artefato criado por ${artifact.provider}.`, kind: artifact.type as MessageKind, artifact, elapsedMs, firstTokenMs: elapsedMs, effort, model: artifact.model || immediate.model, sourcePrompt: question }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]); return;
      }
      if (immediate?.kind === 'instant') {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: immediate.content, kind: 'text' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: 'Nexo Instant' }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]); speak(immediate.content); return;
      }
      responseTextV3 = responseTextV3.trim(); if (!responseTextV3) throw new Error('O Runtime V4 não produziu uma resposta.');
      const kindV3: MessageKind = effectiveModeV3 === 'Planilhas' ? 'sheet' : 'text';
      if (kindV3 === 'text') responseTextV3 = polishPortuguese(responseTextV3);
      const elapsedMsV3 = performance.now() - requestStarted;
      const completeChatV3 = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: responseTextV3, kind: kindV3, elapsedMs: elapsedMsV3, firstTokenMs: firstTokenV3 ?? elapsedMsV3, effort, model: modelLabelV3 }], updatedAt: Date.now() };
      persistChats([completeChatV3, ...chats.filter(chat => chat.id !== baseChat.id)]);
      if (kindV3 === 'text') speak(responseTextV3);
      return;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não consegui acessar o modelo local. Confirme se o Ollama está aberto e tente novamente.');
    } finally { setLoading(false); setAttachments([]); }
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <div className="nexo-logo grid size-10 place-items-center rounded-[14px] text-white shadow-[0_0_32px_var(--glow)]"><NexoMark className="size-6" /></div>
        <div><p className="font-semibold tracking-[-.02em]">Nexo</p><p className="text-xs text-muted-foreground">Inteligência local</p></div>
      </div>
      <Button className="mt-6 h-10 justify-start rounded-xl" variant="secondary" onClick={createChat}><Plus /> Nova conversa</Button>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Seus chats</p>
        <ScrollArea className="min-h-0 flex-1 pr-1"><div className="space-y-1">
          {mounted && chats.length === 0 && <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">Suas conversas aparecerão aqui.</p>}
          {chats.map(chat => <div key={chat.id} className={`group flex items-center rounded-xl transition ${chat.id === activeChatId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}>
            <button className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs" onClick={() => { setActiveChatId(chat.id); setMobileOpen(false); setNotice(''); }}>{chat.title}</button>
            <Button size="icon-xs" variant="ghost" className="mr-1 opacity-0 group-hover:opacity-100" aria-label={`Excluir ${chat.title}`} onClick={() => deleteChat(chat.id)}><Trash2 /></Button>
          </div>)}
        </div></ScrollArea>
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3.5">
        <div className="flex items-center gap-2 text-xs font-medium"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />Privacidade local</div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Chats e perfil ficam neste computador.</p>
      </div>
      <Button className="mt-2 justify-start" variant="ghost" onClick={() => { setSecurityOpen(true); setMobileOpen(false); }}><ShieldCheck /> Segurança e rede</Button>
      <Button className="justify-start" variant="ghost" onClick={() => void openMemoryCenter()}><Library /> Memória do Nexo</Button>
      <Button className="justify-start" variant="ghost" onClick={() => { setProfileOpen(true); setMobileOpen(false); }}><Settings2 /> Meu perfil</Button>
    </div>
  );

  return <main className="h-[100dvh] overflow-hidden bg-background text-foreground">
    <div className="mx-auto grid h-full max-w-[1680px] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_310px]">
      <aside className="hidden min-h-0 border-r border-border bg-sidebar lg:block">{sidebar}</aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button className="lg:hidden" size="icon" variant="ghost" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu /></Button>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{activeChat?.title ?? 'Nova conversa'}</p><p className="truncate text-xs text-muted-foreground">Local 3B/7B · esforço {effort.toLowerCase()} · perfil de {profile.name || 'usuário'}</p></div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="icon-sm" variant="ghost" aria-label="Central de segurança" title="Central de segurança" onClick={() => setSecurityOpen(true)}><ShieldCheck /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`} title={`Tema ${theme === 'dark' ? 'claro' : 'escuro'}`} onClick={toggleTheme}>{mounted && theme === 'dark' ? <Sun /> : <Moon />}</Button>
            <Badge variant="outline" className="hidden border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" /> Local · sem tokens</Badge>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-8">
              {history.length === 0 ? <div className="m-auto max-w-xl py-10 text-center">
                <div className="nexo-logo mx-auto mb-6 grid size-16 place-items-center rounded-[22px] text-white shadow-[0_0_48px_var(--glow)]"><NexoMark className="size-9" /></div>
                <p className="text-sm text-primary">Oi{profile.name ? `, ${profile.name}` : ''}. Pode chegar do seu jeito.</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">O que está passando pela sua cabeça?</h1>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Você não precisa trazer um comando pronto. Conte uma ideia, uma dúvida ou como está seu dia — o Nexo conversa, pensa junto e também transforma isso em projetos.</p>
              </div> : <div className="space-y-5 py-2">
                {history.map((message, index) => {
                  const imagePrompt = message.sourcePrompt ?? (history[index - 1]?.role === 'user' ? history[index - 1].content : '');
                  const cleanedSvg = message.kind === 'image' && !message.artifact ? cleanSvg(message.content) : '';
                  const svg = message.kind === 'image' && !message.artifact ? hasDetailedVisual(cleanedSvg) ? cleanedSvg : fallbackSvg(imagePrompt) : '';
                  const streaming = loading && index === history.length - 1 && message.role === 'assistant';
                  return <article key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && <div className="nexo-logo mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-white"><NexoMark className="size-4" /></div>}
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[82%] ${message.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'assistant-message rounded-bl-md border border-border bg-card/80'}`}>
                      {message.artifact?.type === 'image' ? <><Image unoptimized width={1024} height={1024} className="max-h-[560px] w-full rounded-xl bg-black/5 object-contain" src={new NexoClient(agentToken).artifactUrl(message.artifact.id)} alt={message.sourcePrompt || 'Imagem criada pelo Nexo'} /><div className="mt-3 flex flex-wrap gap-2"><a className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs" href={new NexoClient(agentToken).artifactUrl(message.artifact.id)} download><Download className="size-3.5" /> Baixar imagem</a>{imagePrompt && <Button size="sm" variant="ghost" onClick={() => { setMode('Imagens'); setPrompt(`Crie uma variação de: ${imagePrompt}`); }}><RefreshCw /> Criar variação</Button>}</div></>
                        : message.artifact?.type === 'video' ? <><video className="max-h-[560px] w-full rounded-xl bg-black" controls src={new NexoClient(agentToken).artifactUrl(message.artifact.id)} /><a className="mt-3 inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs" href={new NexoClient(agentToken).artifactUrl(message.artifact.id)} download><Download className="size-3.5" /> Baixar vídeo</a></>
                        : message.artifact?.type === 'audio' ? <audio className="w-full" controls src={new NexoClient(agentToken).artifactUrl(message.artifact.id)} />
                        : message.kind === 'image' && svg ? <><Image unoptimized width={1024} height={1024} className="aspect-square w-full rounded-xl bg-white object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Diagrama SVG criado pelo Nexo" /><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">SVG vetorial</Badge><Button size="sm" variant="outline" onClick={() => download(svg, 'diagrama-nexo.svg', 'image/svg+xml')}><Download /> Baixar SVG</Button></div></>
                        : message.kind === 'sheet' ? <><pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">{stripFence(message.content)}</pre><Button className="mt-3" size="sm" variant="outline" onClick={() => download('\ufeff' + stripFence(message.content), 'planilha-nexo.csv', 'text/csv;charset=utf-8')}><Download /> Baixar planilha</Button></>
                        : message.kind === 'task' && parseAgentTask(message.content) ? (() => { const task = parseAgentTask(message.content)!; return <AgentTaskCard task={task} busy={actionLoading} onPermission={(permission, decision) => void decideTaskPermission(index, task, permission, decision)} onControl={action => void controlAgentTask(index, task.id, action)} onRefresh={() => void refreshAgentTask(index, task.id)} />; })()
                        : message.kind === 'action' && parseAction(message.content) ? (() => { const action = parseAction(message.content)!; const readOnly = ['read_file', 'list_files'].includes(action.type); return <div className="min-w-[260px] space-y-3"><div className="flex items-center gap-2 text-primary"><ShieldCheck className="size-4" /><span className="text-xs font-semibold uppercase tracking-wide">{readOnly ? 'Acesso local solicitado' : 'Ação protegida'}</span></div><div><p className="font-medium">{actionTitle(action)}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{action.path}</p><p className="mt-2 text-xs text-muted-foreground">{action.reason}</p></div>{action.content && <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-2 font-mono text-[10px]">{action.content.slice(0, 1800)}</pre>}{action.output && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono text-[10px]">{action.output}</pre>}{action.status === 'pending' ? <Button size="sm" disabled={!agentOnline || !agentToken || actionLoading} onClick={() => void runAction(index, action)}>{action.type === 'write_file' ? <FilePenLine /> : action.type === 'create_folder' ? <FolderPlus /> : action.type === 'create_project' ? <Server /> : <Library />}{agentOnline ? actionLoading ? 'Executando…' : actionButton(action) : 'Agente local offline'}</Button> : <Badge variant={action.status === 'completed' ? 'secondary' : 'destructive'}>{action.result}</Badge>}</div>; })()
                        : message.role === 'assistant' ? <RichText content={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                      {message.role === 'assistant' && message.content && <div className="message-actions">
                        <span className="response-metrics">{streaming
                          ? <><i /> Escrevendo{message.firstTokenMs !== undefined ? ` · iniciou em ${formatDuration(message.firstTokenMs)}` : '…'}</>
                          : <>{message.firstTokenMs !== undefined && `Início ${formatDuration(message.firstTokenMs)}`}{message.elapsedMs !== undefined && ` · Total ${formatDuration(message.elapsedMs)}`}{message.effort && ` · ${message.effort}`}{message.model && ` · ${message.model}`}</>}</span>
                        {!streaming && message.kind === 'text' && <button aria-label="Copiar resposta" onClick={() => void copyText(message.content)}><Copy /> Copiar</button>}
                      </div>}
                    </div>
                  </article>;
                })}
                {loading && history[history.length - 1]?.role !== 'assistant' && <div className="flex items-center gap-3 text-sm text-muted-foreground"><div className="nexo-logo grid size-7 place-items-center rounded-lg text-white"><NexoMark className="size-4 animate-pulse" /></div><span>{activityLabel}</span></div>}
                <div ref={messagesEnd} />
              </div>}
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border bg-background/90 px-3 pb-3 pt-2 backdrop-blur-xl sm:px-6 sm:pb-5">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex items-center gap-2">
                <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto py-1">{MODES.map(({ label, icon: Icon }) => <Button key={label} size="sm" variant={mode === label ? 'secondary' : 'ghost'} className={`shrink-0 ${mode === label ? 'border border-primary/20 bg-primary/10 text-primary' : 'text-muted-foreground'}`} onClick={() => setMode(label)}><Icon />{label}</Button>)}</div>
                <div className="effort-control flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card/70 p-1 pl-2" title="Mais esforço melhora respostas complexas, mas usa mais memória e demora mais">
                  <Gauge className="size-3.5 text-primary" /><span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">Esforço</span>
                  <NativeSelect size="sm" aria-label="Nível de esforço" value={effort} onChange={event => changeEffort(event.target.value as Effort)}>
                    {EFFORTS.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
              </div>
              {(documents.length > 0 || attachments.length > 0) && <div className="mb-2 flex flex-wrap gap-1.5">{documents.map((doc, index) => <Badge key={`${doc.name}-${index}`} variant="secondary" className="h-7 gap-1.5 px-2.5"><FileText />{doc.name}<button aria-label={`Remover ${doc.name}`} onClick={() => setDocuments(items => items.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3" /></button></Badge>)}{attachments.map((item, index) => <Badge key={`${item.name}-${index}`} variant="secondary" className="h-7 gap-1.5 px-2.5">{item.type === 'image' ? <ImageIcon /> : item.type === 'video' ? <Film /> : <Mic />}{item.name}<button aria-label={`Remover ${item.name}`} onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3" /></button></Badge>)}</div>}
              <div className="composer rounded-[20px] border border-border p-2 shadow-[0_18px_55px_rgb(0_0_0/18%)] focus-within:border-primary/30">
                <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void askNexo(); } }} placeholder={mode === 'Planilhas' ? 'Descreva a planilha que precisa…' : mode === 'Imagens' ? 'Descreva a imagem que quer gerar…' : mode === 'Vídeos' ? 'Descreva um vídeo curto…' : mode === 'Programar' ? 'Descreva o código avançado…' : mode === 'Agente' ? 'Descreva a alteração no projeto…' : 'Pode falar do seu jeito…'} className="min-h-14 max-h-32 resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:ring-0" />
                <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-0.5"><input ref={fileInput} className="hidden" type="file" multiple accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,image/*,audio/*,video/*" onChange={addDocuments} /><Button size="icon-sm" variant="ghost" aria-label="Anexar arquivo" onClick={() => fileInput.current?.click()}><Paperclip /></Button><Button size="icon-sm" variant={listening ? 'secondary' : 'ghost'} className={listening ? 'text-rose-400' : ''} aria-label="Falar" onClick={startVoice}>{listening ? <MicOff /> : <Mic />}</Button><Button size="icon-sm" variant={voiceOutput ? 'secondary' : 'ghost'} aria-label="Ler respostas em voz alta" onClick={() => { setVoiceOutput(value => !value); speechSynthesis?.cancel(); }}>{voiceOutput ? <Volume2 /> : <VolumeX />}</Button><Button size="sm" variant={webSearch ? 'secondary' : 'ghost'} className={webSearch ? 'text-primary' : 'text-muted-foreground'} onClick={() => setWebSearch(value => !value)}><Search /><span className="hidden sm:inline">{webSearch ? 'Web ligada' : 'Pesquisar'}</span></Button><Button size="icon-sm" variant="ghost" aria-label="Pesquisar no Google" title="Pesquisar no Google em uma nova aba" onClick={openGoogleSearch}><Globe2 /></Button></div><Button size="icon" className="rounded-xl" onClick={() => void askNexo()} disabled={!prompt.trim() || loading} aria-label="Enviar"><ArrowUp /></Button></div>
              </div>
              {notice && <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-300">{notice}</p>}
              <p className="mt-2 text-center text-[10px] text-muted-foreground">O Nexo pode cometer erros. Confirme informações importantes.</p>
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 border-l border-border bg-sidebar/60 2xl:block">
        <ScrollArea className="h-full"><div className="p-5">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Contexto ativo</p><p className="mt-1 text-xs text-muted-foreground">O que o Nexo está usando</p></div><Button size="icon-sm" variant="ghost" onClick={() => setProfileOpen(true)}><Settings2 /></Button></div>
          <div className="mt-6 space-y-2.5">{[
            { name: 'Modelos locais', detail: `Qwen 3B/7B · esforço ${effort.toLowerCase()}`, active: true, icon: NexoMark },
            { name: 'Nexo Core', detail: agentHealth?.agent ? `${agentHealth.agent.database} · ${agentHealth.agent.tasks.running} ativa(s)` : agentOnline ? 'Inicializando runtime' : 'Offline', active: !!agentHealth?.agent, icon: Bot },
            { name: 'Segurança', detail: agentHealth?.security ? `Sessão autenticada · ${agentHealth.security.rateLimitPerMinute}/min` : 'Aguardando agente', active: !!agentHealth?.security, icon: ShieldCheck },
            { name: 'Rede / VPN', detail: agentHealth?.network?.vpnDetected ? `Ativa · ${agentHealth.network.interfaces.find(item => item.vpn)?.name}` : 'Nenhuma VPN detectada', active: !!agentHealth?.network?.vpnDetected, icon: Network },
            { name: 'Perfil', detail: `${profile.name || 'Usuário'} · ${profile.style}`, active: true, icon: Check },
            { name: 'Horário', detail: currentTime || 'Sincronizando', active: !!currentTime, icon: Clock3 },
            { name: 'Clima', detail: weather ? `${weather.label} · ${weather.temperature}°C` : profile.city ? weatherStatus === 'loading' ? 'Atualizando…' : 'Não encontrado' : 'Defina sua cidade', active: !!weather, icon: CloudSun },
            { name: 'Pesquisa', detail: webSearch ? 'Wikipedia + fontes especializadas' : 'Desativada', active: webSearch, icon: Search },
            { name: 'Browser Agent', detail: agentHealth?.agent?.capabilities?.browser?.automation?.available ? `Playwright real · ${agentHealth.agent.capabilities.browser.automation.actions.length} ações` : 'Navegação segura disponível', active: !!agentHealth?.agent?.capabilities?.browser?.automation?.available, icon: Globe2 },
            { name: 'Skills', detail: agentHealth?.agent?.capabilities?.skills ? `${agentHealth.agent.capabilities.skills.enabled} ativa(s)` : 'Carregando catálogo local', active: !!agentHealth?.agent?.capabilities?.skills?.enabled, icon: Sparkles },
            { name: 'Segundo plano', detail: agentHealth?.agent?.capabilities?.background ? `${agentHealth.agent.capabilities.background.active} agendamento(s)` : 'Scheduler offline', active: !!agentHealth?.agent?.capabilities?.background?.running, icon: Gauge },
            { name: 'Documentos', detail: documents.length ? `${documents.length} arquivo(s)` : 'Nenhum arquivo', active: documents.length > 0, icon: Library },
          ].map(item => { const Icon = item.icon; return <div key={item.name} className="rounded-2xl border border-border bg-card/55 p-3.5"><div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p></div><span className={`size-2 shrink-0 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`} /></div></div>; })}</div>
          {!weather && <Button className="mt-3 w-full" size="sm" variant="outline" onClick={useDeviceLocation}><CloudSun /> Usar localização</Button>}
          <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => setSecurityOpen(true)}><ShieldCheck /> Abrir central de segurança</Button>
          <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => void openMemoryCenter()}><Library /> Gerenciar memória</Button>
          <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/7 p-4"><p className="text-xs font-medium text-primary">Nexo Core {agentHealth?.agent?.version || 'local'}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">{['Goal Engine', 'DAG persistente', 'Capability tokens', 'Cancelamento real', 'Project Workspace', 'AST TypeScript', 'Playwright real', 'Context Engine', 'Memória V3', 'Grafo local', 'Continuidade', 'RAG incremental', 'Research Agent', 'Skills + MCP', 'Multi-agent 4×', 'Visual verifier'].map(capability => <span key={capability} className="rounded-lg bg-muted px-2 py-1.5">{capability}</span>)}</div></div>
        </div></ScrollArea>
      </aside>
    </div>

    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-[290px] border-border bg-sidebar p-0"><SheetHeader className="sr-only"><SheetTitle>Menu do Nexo</SheetTitle><SheetDescription>Chats e configurações</SheetDescription></SheetHeader>{sidebar}</SheetContent></Sheet>

    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seu perfil no Nexo</DialogTitle>
          <DialogDescription>Essas preferências ficam neste computador e orientam todas as respostas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><label htmlFor="profile-name" className="text-xs font-medium">Seu nome</label><Input id="profile-name" value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} placeholder="Como o Nexo deve chamar você?" /></div>
          <div className="grid gap-1.5"><label htmlFor="profile-city" className="text-xs font-medium">Sua cidade</label><Input id="profile-city" value={profile.city} onChange={event => setProfile(current => ({ ...current, city: event.target.value }))} placeholder="Ex.: São Paulo" /></div>
          <div className="grid gap-1.5"><label htmlFor="profile-style" className="text-xs font-medium">Estilo de resposta</label><Input id="profile-style" value={profile.style} onChange={event => setProfile(current => ({ ...current, style: event.target.value }))} placeholder="Direto, detalhado, descontraído…" /></div>
          <div className="grid gap-1.5"><label htmlFor="profile-instructions" className="text-xs font-medium">Instruções pessoais</label><Textarea id="profile-instructions" value={profile.instructions} onChange={event => setProfile(current => ({ ...current, instructions: event.target.value }))} placeholder="Ex.: explique código para iniciantes e responda em português." className="min-h-24" /></div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-medium">Personalidade adaptativa</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">O Nexo aprende gradualmente seu nível de formalidade, humor, iniciativa e tamanho preferido de resposta. Você pode apagar somente essa adaptação quando quiser.</p></div>
        <DialogFooter className="justify-between sm:justify-between"><Button variant="ghost" onClick={() => void resetAdaptivePersonality()}>Apagar adaptação</Button><Button onClick={saveProfile}>Salvar perfil</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border border-border bg-card sm:max-w-4xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Library className="text-primary" /> Memória do Nexo</DialogTitle><DialogDescription>Pesquise, confira e controle o que o Nexo mantém no SQLite deste computador.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><Input value={memoryQuery} onChange={event => setMemoryQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void loadMemories(); }} placeholder="Pesquisar pelo significado…" /><Button variant="outline" onClick={() => void loadMemories()} disabled={memoryLoading}><Search /> Buscar</Button></div>
        <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <ScrollArea className="h-[360px] rounded-2xl border border-border"><div className="space-y-1 p-2">{memories.length === 0 ? <p className="p-4 text-xs text-muted-foreground">{memoryLoading ? 'Carregando…' : 'Nenhuma memória encontrada.'}</p> : memories.map(item => <button key={item.id} className={`w-full rounded-xl p-3 text-left transition ${item.id === selectedMemoryId ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted'}`} onClick={() => { setSelectedMemoryId(item.id); setMemoryDraft(item.content); }}><div className="flex items-center justify-between gap-2"><Badge variant="outline" className="text-[9px]">{item.type}</Badge><span className={`text-[9px] ${item.status === 'UNCERTAIN' ? 'text-amber-500' : 'text-emerald-500'}`}>{item.status}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5">{item.summary || item.content}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.scope} · {Math.round(item.confidence * 100)}% · {item.source}</p></button>)}</div></ScrollArea>
          {(() => { const item = memories.find(memory => memory.id === selectedMemoryId); return item ? <div className="flex h-[360px] min-h-0 flex-col rounded-2xl border border-border p-4"><div className="flex flex-wrap gap-1.5"><Badge>{item.type}</Badge><Badge variant="outline">{item.privacy}</Badge><Badge variant="outline">{item.scope}</Badge></div><Textarea className="mt-3 min-h-0 flex-1 resize-none" value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} /><p className="mt-2 text-[10px] text-muted-foreground">Observado em {new Date(item.observedAt).toLocaleString('pt-BR')} · confiança {Math.round(item.confidence * 100)}%</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void manageSelectedMemory('update')} disabled={memoryLoading}><FilePenLine /> Salvar</Button>{item.status === 'UNCERTAIN' && <Button size="sm" variant="outline" onClick={() => void manageSelectedMemory('confirm')} disabled={memoryLoading}><Check /> Confirmar</Button>}<Button size="sm" variant="outline" onClick={() => void manageSelectedMemory('forget')} disabled={memoryLoading}>Arquivar</Button><Button size="sm" variant="destructive" onClick={() => void manageSelectedMemory('delete')} disabled={memoryLoading}><Trash2 /> Apagar</Button></div></div> : <div className="grid h-[360px] place-items-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">Selecione uma memória.</div>; })()}
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">Memórias restritas nunca são enviadas a serviços externos. “Apagar” remove o registro; “Arquivar” o preserva fora da recuperação normal.</p>
      </DialogContent>
    </Dialog>

    <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Central de segurança</DialogTitle>
          <DialogDescription>O modelo sugere ações; o agente local valida caminhos, permissões e sua aprovação antes de executar.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: 'Acesso local', detail: agentHealth?.security?.loopbackOnly ? 'Restrito a 127.0.0.1' : 'Agente offline', active: !!agentHealth?.security?.loopbackOnly, icon: Server },
            { title: 'Sessão autenticada', detail: agentHealth?.security?.authenticatedSession ? 'Token temporário ativo' : 'Sem sessão', active: !!agentHealth?.security?.authenticatedSession, icon: ShieldCheck },
            { title: 'Aprovação humana', detail: 'Obrigatória para toda escrita', active: true, icon: Check },
            { title: 'Backups', detail: 'Antes de sobrescrever arquivos', active: agentOnline, icon: FilePenLine },
            { title: 'Limite de ações', detail: agentHealth?.security ? `${agentHealth.security.rateLimitPerMinute} por minuto` : 'Agente offline', active: !!agentHealth?.security, icon: Clock3 },
            { title: 'Auditoria', detail: agentHealth?.security ? `${agentHealth.security.auditEntries} evento(s) nesta sessão` : 'Agente offline', active: !!agentHealth?.security, icon: Library },
          ].map(item => { const Icon = item.icon; return <div key={item.title} className="rounded-2xl border border-border bg-muted/35 p-3.5"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-background text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0"><p className="text-xs font-medium">{item.title}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p></div><span className={`ml-auto size-2 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`} /></div></div>; })}
        </div>
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3"><Network className="mt-0.5 size-5 text-primary" /><div><p className="text-sm font-medium">VPN</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{agentHealth?.network?.vpnDetected ? `Interface protegida detectada: ${agentHealth.network.interfaces.find(item => item.vpn)?.name}.` : 'Nenhuma VPN foi detectada. Para integrar conexão real com segurança, escolha e configure um provedor como WireGuard; o Nexo não altera sua rede sem uma configuração explícita.'}</p></div></div>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Área permitida:</span> {agentHealth?.workspace ?? 'agente local offline'}. Exclusão de arquivos, terminal irrestrito e mudanças de sistema permanecem bloqueados.</div>
      </DialogContent>
    </Dialog>
  </main>;
}
