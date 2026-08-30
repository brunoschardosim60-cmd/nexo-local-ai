'use client';
/* oxlint-disable react/react-compiler */

import { ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Bot, Check, Clock3, CloudSun, Code2, Copy, Download, Gauge,
  FilePenLine, FileText, FolderPlus, Globe2, ImageIcon, Library, Menu, Mic, MicOff,
  Moon, Network, Paperclip, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles,
  Sun, Table2, Trash2, Volume2, VolumeX, X,
} from 'lucide-react';
import Image from 'next/image';
import { useNexoTaskSync } from '@/hooks/use-nexo-task-sync';
import { NexoClient, NEXO_AGENT_URL } from '@/lib/nexo/client';
import {
  parseAgentTask, taskStatusLabel, type AgentHealth, type AgentPermission, type AgentTask,
  type Chat, type ChatMessage, type Effort, type LocalDocument, type MessageKind, type NexoAction, type UserProfile,
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
type WikiApiResponse = { query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> } };
type OpenAlexApiResponse = { results?: Array<{ title: string; publication_year?: number; doi?: string; abstract_inverted_index?: Record<string, number[]> }> };
type StackApiResponse = { items?: Array<{ title: string; link: string; tags?: string[]; score?: number; is_answered?: boolean }> };
type OllamaApiResponse = { message?: { content?: string } };
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

const MODEL = 'qwen2.5-coder:7b-instruct-q3_K_S';
const FAST_MODEL = 'qwen2.5-coder:3b';
const AGENT_URL = NEXO_AGENT_URL;
const EFFORTS: Effort[] = ['Baixo', 'Médio', 'Alto', 'Extra alto'];

const MODES = [
  { label: 'Geral', icon: Sparkles },
  { label: 'Programar', icon: Code2 },
  { label: 'Documentos', icon: FileText },
  { label: 'Planilhas', icon: Table2 },
  { label: 'Imagens', icon: ImageIcon },
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

function imageSubjectGuide(prompt: string) {
  const normalized = normalizeInput(prompt);
  if (/\bmouse\b/.test(normalized) && !/\b(rato|camundongo|animal)\b/.test(normalized)) {
    return 'O objeto é um MOUSE DE COMPUTADOR, visto de cima em perspectiva: corpo curvo ergonômico, botões esquerdo e direito separados, roda de rolagem central, detalhe lateral e sombra. Ele deve ser reconhecível sem nenhuma palavra.';
  }
  if (/\b(gato|gatinho)\b/.test(normalized)) return 'Desenhe um gato reconhecível com cabeça, orelhas triangulares, olhos, focinho, corpo, patas, cauda curva e sombra; não use texto.';
  if (/\b(cachorro|cao|dog)\b/.test(normalized)) return 'Desenhe um cachorro reconhecível com cabeça, focinho, orelhas, corpo, quatro patas, cauda e sombra; não use texto.';
  if (/\b(carro|automovel)\b/.test(normalized)) return 'Desenhe um carro reconhecível em perspectiva, com carroceria, para-brisa, janelas, faróis, rodas completas, reflexos e sombra; não use texto.';
  if (/\b(casa|lar)\b/.test(normalized)) return 'Desenhe uma casa reconhecível com telhado, paredes, porta, janelas, profundidade, terreno e sombra; não use texto.';
  if (/\b(celular|smartphone|telefone)\b/.test(normalized)) return 'Desenhe um smartphone reconhecível em perspectiva, com corpo, tela, câmeras, botões, reflexos e sombra; não use texto.';
  return 'Represente visualmente o objeto ou a cena com silhueta clara, profundidade, detalhes característicos, iluminação e sombra. A imagem deve ser compreensível sem texto.';
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

function restoreAbstract(index?: Record<string, number[]>) {
  if (!index) return '';
  return Object.entries(index)
    .flatMap(([word, positions]) => positions.map(position => ({ word, position })))
    .sort((a, b) => a.position - b.position)
    .map(item => item.word)
    .join(' ')
    .slice(0, 1800);
}

function decodeHtml(value: string) {
  const document = new DOMParser().parseFromString(value, 'text/html');
  return document.documentElement.textContent ?? value;
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
  const [webSearch, setWebSearch] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
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
      const payload = await new NexoClient(data.sessionToken).getSession();
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
    const warmup = window.setTimeout(() => {
      void fetch('http://localhost:11434/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: FAST_MODEL, prompt: '', stream: false, keep_alive: '30m' }),
      }).catch(() => undefined);
    }, 900);
    return () => { window.clearInterval(timer); window.clearTimeout(warmup); };
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

  function rememberExchange(question: string, answer: string) {
    if (!agentToken || question.length + answer.length < 120) return;
    const preference = /(eu gosto|eu prefiro|sempre|nunca|meu projeto|meu objetivo|lembre|importante para mim)/i.test(question);
    void new NexoClient(agentToken).remember(`Usuário: ${question}\nNexo: ${answer.slice(0, 4000)}`, {
      kind: preference ? 'user' : 'episodic', importance: preference ? 0.85 : 0.55, confidence: preference ? 0.86 : 0.65,
      source: 'conversation', metadata: { chatId: activeChatId },
    }).catch(() => undefined);
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

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); localStorage.setItem('nexo-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  function changeEffort(next: Effort) {
    setEffort(next); localStorage.setItem('nexo-effort', next);
    const warmModel = next === 'Alto' || next === 'Extra alto' ? MODEL : FAST_MODEL;
    void fetch('http://localhost:11434/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: warmModel, prompt: '', stream: false, keep_alive: '30m' }),
    }).catch(() => undefined);
  }

  async function addDocuments(event: ChangeEvent<HTMLInputElement>) {
    const accepted: LocalDocument[] = [];
    for (const file of Array.from(event.target.files ?? [])) {
      if (file.size > 2_000_000) { setNotice(`${file.name} é maior que 2 MB e não foi adicionado.`); continue; }
      try { accepted.push({ name: file.name, content: (await file.text()).slice(0, 40_000) }); } catch { setNotice(`Não consegui ler ${file.name}.`); }
    }
    setDocuments(current => [...current, ...accepted].slice(-8)); event.target.value = '';
    if (agentToken) for (const document of accepted) {
      void new NexoClient(agentToken).indexText(`upload:${document.name}`, document.content, { uploadedFromBrowser: true, trust: 'untrusted' }).catch(() => undefined);
    }
  }

  async function searchKnowledge(query: string) {
    if (!webSearch) return '';
    const wikipedia = async () => {
      const url = new URL('https://pt.wikipedia.org/w/api.php');
      url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '4', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', format: 'json', origin: '*' }).toString();
      const response = await fetch(url); const data = await response.json() as WikiApiResponse;
      const pages = Object.values(data.query?.pages ?? {}) as Array<{ title: string; extract?: string; fullurl?: string }>;
      return pages.map(page => `[WIKIPEDIA · ${page.title}] ${page.extract?.slice(0, 1400) ?? ''}\nFonte: ${page.fullurl ?? ''}`).join('\n\n');
    };
    const openAlex = async () => {
      const url = new URL('https://api.openalex.org/works');
      url.search = new URLSearchParams({ search: query, 'per-page': '3', select: 'title,publication_year,doi,abstract_inverted_index' }).toString();
      const response = await fetch(url); const data = await response.json() as OpenAlexApiResponse;
      return (data.results ?? []).map(work => `[OPENALEX · ${work.publication_year ?? 's.d.'}] ${work.title}\n${restoreAbstract(work.abstract_inverted_index)}\nFonte: ${work.doi ?? 'OpenAlex'}`).join('\n\n');
    };
    const stackOverflow = async () => {
      if (!['Programar', 'Agente'].includes(mode)) return '';
      const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
      url.search = new URLSearchParams({ order: 'desc', sort: 'relevance', q: query, site: 'stackoverflow', pagesize: '3' }).toString();
      const response = await fetch(url); const data = await response.json() as StackApiResponse;
      return (data.items ?? []).map(item => `[STACK OVERFLOW · ${item.is_answered ? 'respondida' : 'em aberto'} · score ${item.score ?? 0}] ${decodeHtml(item.title)}\nTags: ${item.tags?.join(', ') ?? 'sem tags'}\nFonte: ${item.link}`).join('\n\n');
    };
    const results = await Promise.allSettled([wikipedia(), openAlex(), stackOverflow()]);
    return results.map(result => result.status === 'fulfilled' ? result.value : '').filter(Boolean).join('\n\n---\n\n').slice(0, 18_000);
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

  function quickAnswer(question: string) {
    const normalized = normalizeInput(question);
    if (/^(?:o+i+|ola+|iai+|e\s*a+i+|eae+|eai+|opa+|fala(?:\s+ai)?|salve|hey|hello|bom dia|boa tarde|boa noite)(?:\s+nexo+)?$/.test(normalized)) {
      return `E aí${profile.name ? `, **${profile.name}**` : ''}! Tô por aqui — como você tá?`;
    }
    if (/^(como voce esta|como vc ta|como ce ta|tudo bem|td bem|suave|beleza|blz|como vai)$/.test(normalized)) {
      return '**Tudo certo por aqui.** E você, como está de verdade? Pode responder do seu jeito — não precisa transformar tudo em um pedido.';
    }
    if (/^(obrigado|obrigada|valeu|vlw|agradecido|tmj)$/.test(normalized)) return 'Tamo junto! O que mais está passando pela sua cabeça?';
    if (/^(tchau|ate mais|falou|flw|boa noite entao)$/.test(normalized)) return 'Até mais! Gostei da conversa. Quando voltar, a gente continua de onde parou.';
    if (/^(?:k+k+|ha(?:ha)+|rs+)$/.test(normalized)) return 'Hahaha 😄 Essa foi boa. O que aconteceu?';
    if (/^(teste|testando|ta funcionando|esta funcionando)$/.test(normalized)) return '**Funcionando e respondendo na hora.** Pode mandar algo mais interessante agora 😄';
    if (/(quero conversar|vamos conversar|bora conversar|so conversar|to entediado|estou entediado)/.test(normalized)) {
      return `Claro${profile.name ? `, **${profile.name}**` : ''}. Você não precisa chegar com uma pergunta pronta. Como foi seu dia — teve algo bom, estranho ou cansativo que ficou na cabeça?`;
    }
    if (/(nao sei o que fazer|estou perdido|to perdido|nao sei por onde comecar)/.test(normalized)) {
      return 'Tudo bem não ter isso organizado ainda. Me conte a situação como vier, mesmo pela metade, e eu ajudo a transformar em um próximo passo. O que está pesando mais agora?';
    }
    if (question.length > 120) return null;
    if (/(que horas|qual.*horario|horas agora|data de hoje|que dia e hoje)/.test(normalized)) {
      return `## Agora\n\n${currentTime || new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}`;
    }
    if (/(clima|tempo hoje|temperatura|previsao do tempo)/.test(normalized)) {
      return weather
        ? `## Clima em ${weather.label}\n\n- **Temperatura:** ${weather.temperature}°C\n- **Sensação:** ${weather.apparent}°C\n- **Condição:** ${weatherDescription(weather.code)}\n- **Vento:** ${weather.wind} km/h`
        : 'Ainda não tenho uma localização definida. Abra **Meu perfil**, informe sua cidade ou use **Usar localização**.';
    }
    if (/(consegue|pode|sabe).*(gerar|criar|fazer).*(imagem|desenho|logo|icone)/.test(normalized)) {
      return '## Sim, consigo criar imagens\n\nGero **imagens vetoriais simples em SVG**, totalmente neste computador e sem cobrança por tokens. Podemos construir uma juntos: você prefere começar por um personagem, um objeto, um logo ou uma cena simples?';
    }
    if (/(o que voce faz|o que consegue fazer|oq.*(tu|voce)?.*(sabe|consegue).*fazer|que.*(tu|voce).*sabe fazer|suas capacidades|quem e voce)/.test(normalized)) {
      return '## O que eu sei fazer\n\n- **Conversar e pensar junto:** você pode trazer uma dúvida, uma ideia incompleta ou simplesmente contar como está.\n- **Programar:** crio, explico e reviso código, sites, APIs e serviços locais.\n- **Documentos e planilhas:** analiso arquivos, redijo conteúdo e gero CSV para baixar.\n- **Imagens:** crio ilustrações vetoriais simples em SVG.\n- **Pesquisa:** consulto fontes online quando você ativa **Pesquisar**.\n- **Ações no computador:** proponho mudanças em arquivos e projetos, sempre com sua aprovação.\n\nNão precisa falar comigo como se estivesse dando comandos. O que você tem vontade de explorar agora?';
    }
    const math = normalized.match(/^(?:quanto e|calcule|resultado de)?\s*(-?\d+(?:[.,]\d+)?)\s*([+\-*/x])\s*(-?\d+(?:[.,]\d+)?)$/);
    if (math) {
      const left = Number(math[1].replace(',', '.')); const right = Number(math[3].replace(',', '.'));
      const result = math[2] === '+' ? left + right : math[2] === '-' ? left - right : math[2] === '*' || math[2] === 'x' ? left * right : right === 0 ? NaN : left / right;
      return Number.isFinite(result) ? `**Resultado:** ${result.toLocaleString('pt-BR', { maximumFractionDigits: 10 })}` : 'Não é possível dividir por zero.';
    }
    return null;
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
    const userMessage: ChatMessage = { role: 'user', content: question, kind: 'text' };
    const pendingChat = { ...baseChat, title: baseChat.messages.length ? baseChat.title : question.slice(0, 42), messages: [...baseChat.messages, userMessage], updatedAt: Date.now() };
    persistChats([pendingChat, ...chats.filter(chat => chat.id !== baseChat.id)]); setActiveChatId(baseChat.id);

    try {
      if (mode === 'Agente') {
        if (!agentOnline || !agentToken) throw new Error('O agente local está offline. Inicie o Nexo novamente.');
        setActivityLabel('Planejando e executando a tarefa local…');
        const task = await new NexoClient(agentToken).createTask(question, { maxSteps: effort === 'Baixo' ? 6 : effort === 'Médio' ? 10 : 14, maxRetries: effort === 'Baixo' ? 1 : 2 });
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: JSON.stringify(task), kind: 'task' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: 'Nexo Core' }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]);
        setNotice(task.status === 'awaiting_approval' ? 'O agente preparou o próximo passo e aguarda sua aprovação.' : `Tarefa: ${taskStatusLabel(task.status)}.`);
        return;
      }
      const instant = quickAnswer(question);
      if (instant) {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: instant, kind: 'text' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: 'Resposta rápida' }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]); rememberExchange(question, instant); speak(instant); return;
      }
      const effectiveMode = mode === 'Imagens' || isImageCreationRequest(question, baseChat.messages) ? 'Imagens' : mode;
      const normalizedImageQuestion = normalizeInput(question);
      const hasInstantImageTemplate = /\b(note|notebook|laptop|computador)\b/.test(normalizedImageQuestion)
        || (/\bmouse\b/.test(normalizedImageQuestion) && !/\b(rato|camundongo|animal)\b/.test(normalizedImageQuestion));
      if (effectiveMode === 'Imagens' && hasInstantImageTemplate) {
        const elapsedMs = performance.now() - requestStarted;
        const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: fallbackSvg(question), kind: 'image' as const, elapsedMs, firstTokenMs: elapsedMs, effort, model: 'Gerador SVG', sourcePrompt: question }], updatedAt: Date.now() };
        persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]); return;
      }
      const onlineContext = await searchKnowledge(question);
      const documentContext = documents.map(doc => `ARQUIVO ${doc.name}:\n${doc.content}`).join('\n\n');
      const modeInstruction = effectiveMode === 'Planilhas'
        ? 'Crie CSV válido com cabeçalhos claros e ponto e vírgula como separador. Responda somente o CSV.'
        : effectiveMode === 'Imagens'
          ? `Crie uma imagem vetorial bonita, reconhecível e bem composta em SVG, com viewBox="0 0 1024 1024". ${imageSubjectGuide(question)} Use no mínimo 10 formas visuais relevantes entre path, circle, ellipse, rect e polygon, com profundidade, detalhes e composição central. É PROIBIDO substituir o desenho por uma palavra, legenda, janela, cartão ou retângulo genérico. Não use elemento <text>, scripts nem imagens externas. Responda SOMENTE com o SVG completo, iniciando em <svg e terminando em </svg>. Interprete português informal pelo contexto: em um pedido de imagem, “note” significa notebook/laptop, salvo se o usuário disser anotação.`
          : effectiveMode === 'Agente'
            ? 'Você pode propor UMA ferramenta por resposta e deve responder SOMENTE JSON. Formato base: {"nexo_action":{"type":"TIPO","path":"caminho/relativo","reason":"explicação curta"}}. Tipos permitidos: read_file para ler texto; list_files para listar pasta; write_file com content completo; create_folder; create_project com template static-site, node-api, python-api ou ai-service. Ao criar um site, API, servidor ou serviço de IA novo, prefira create_project. Depois use read_file/write_file em passos separados para personalizar. Nunca proponha exclusões, terminal, comandos, caminhos absolutos, registro, configurações do sistema, instalação ou mudanças de VPN. Toda escrita e criação exigem aprovação humana.'
            : '';
      const weatherContext = weather
        ? `${weather.label}: ${weather.temperature}°C, sensação ${weather.apparent}°C, ${weatherDescription(weather.code)}, vento ${weather.wind} km/h.`
        : 'Clima indisponível. Explique que o usuário pode definir sua cidade no perfil; não diga que você nunca possui acesso ao clima.';
      const lightRequest = effectiveMode === 'Geral' && !documents.length && !onlineContext && question.length < 240;
      const useFastModel = effort === 'Baixo' || (effort === 'Médio' && lightRequest);
      const selectedModel = useFastModel ? FAST_MODEL : MODEL;
      let selectedModelLabel = useFastModel ? 'Qwen 3B' : 'Qwen 7B';
      const isStructured = ['Imagens', 'Planilhas', 'Agente'].includes(effectiveMode);
      const displayStreaming = !isStructured;
      const numContext = effort === 'Baixo' ? 3072 : effort === 'Médio' ? documents.length || onlineContext ? 6144 : 4096 : effort === 'Alto' ? 6144 : 8192;
      const numPredict = effectiveMode === 'Imagens'
        ? effort === 'Baixo' ? 1050 : effort === 'Médio' ? 1500 : effort === 'Alto' ? 1900 : 2400
        : effectiveMode === 'Programar' || effectiveMode === 'Agente'
          ? effort === 'Baixo' ? 750 : effort === 'Médio' ? 1300 : effort === 'Alto' ? 1800 : 2400
          : question.length < 120
            ? effort === 'Baixo' ? 120 : effort === 'Médio' ? 220 : effort === 'Alto' ? 480 : 800
            : effort === 'Baixo' ? 300 : effort === 'Médio' ? 600 : effort === 'Alto' ? 1100 : 1700;
      const effortInstruction = effort === 'Baixo'
        ? 'Seja muito direto e econômico. Priorize velocidade e responda apenas o necessário.'
        : effort === 'Médio'
          ? 'Equilibre velocidade, clareza e profundidade.'
          : effort === 'Alto'
            ? 'Analise cuidadosamente, confira coerência e inclua detalhes úteis.'
            : 'Faça uma análise profunda e uma revisão rigorosa antes de concluir. Cubra casos importantes sem repetição.';

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel, stream: true, keep_alive: '30m',
          options: {
            temperature: isStructured ? 0.18 : useFastModel ? 0.22 : 0.38,
            top_p: 0.9, repeat_penalty: 1.12,
            num_ctx: numContext,
            num_predict: numPredict,
          },
          messages: [
            { role: 'system', content: `Você é Nexo, o parceiro pessoal local de ${profile.name || 'seu usuário'}. Você não é apenas um executor de comandos: conversa, pensa junto e ajuda a pessoa a desenvolver ideias. Adapte vocabulário, profundidade, humor leve e exemplos ao jeito do usuário. Estilo preferido: ${profile.style}. Instruções: ${profile.instructions || 'Nenhuma'}. Use o histórico para manter continuidade e perceber interesses, preferências e o momento da conversa.\n\nPERSONALIDADE E CONVERSA:\n- Fale como um parceiro inteligente, caloroso, curioso e seguro, nunca como um manual ou atendente automático.\n- Primeiro reconheça a intenção ou o sentimento por trás da mensagem; depois ajude. Em tarefas objetivas, vá direto sem perder o tom humano.\n- Quando for natural, ofereça uma ideia complementar ou faça UMA pergunta relevante que mova a conversa adiante. Não termine toda resposta com “se quiser, posso ajudar” e não interrogue o usuário.\n- Aceite pensamentos incompletos, gírias e mensagens curtas. Ajude a dar forma à ideia em vez de exigir um comando perfeito.\n- Use o nome ${profile.name || 'do usuário'} com moderação, em momentos acolhedores, não em toda resposta.\n- Não alegue ter corpo, sentimentos ou experiências humanas. Ainda assim, pode demonstrar atenção, leveza e interesse pela conversa.\n\nEXEMPLOS DE TOM:\nUsuário: “tô meio perdido hoje”\nNexo: “Tudo bem não ter as coisas organizadas agora. Me conta o que está mais pesado, mesmo que venha pela metade, e a gente encontra um primeiro passo.”\nUsuário: “me explica isso”\nNexo: responda de forma clara e depois faça uma pergunta ligada ao contexto, como “Onde você encontrou isso?” ou “Quer entender a ideia ou aplicar em algo?”.\n\nESFORÇO ${effort.toUpperCase()}: ${effortInstruction}\n\nCAPACIDADES REAIS DO NEXO:\n- Conversa, programação, documentos, planilhas CSV, pesquisa opcional e ações locais protegidas.\n- Gera imagens vetoriais simples em SVG localmente. Nunca diga que não consegue criar imagens; quando solicitado, siga o modo Imagens.\n\nREGRAS DE QUALIDADE:\n- Responda sempre em português brasileiro correto, natural e coerente. Não use construções como “posso respondo”, “sou capacidade” ou “como posso eu ajudar”. Revise concordância, regência e acentuação antes de concluir.\n- Comece pela resposta direta. Não repita a pergunta e não acrescente fatos irrelevantes.\n- Não invente dados, fontes, recursos ou capacidades. Se não souber, diga claramente.\n- Siga literalmente os limites e o formato pedidos pelo usuário, inclusive quantidade de frases, tópicos ou exemplos.\n- Em perguntas simples, use de 2 a 5 frases, salvo se o usuário pedir outra quantidade. Em temas complexos, explique com profundidade e exemplos concretos.\n- Para respostas textuais, use Markdown limpo: títulos ## apenas quando ajudarem, listas para etapas ou comparações, **negrito** para pontos-chave e blocos de código com a linguagem correta. Não use HTML.\n- Quando houver PESQUISA ONLINE, diferencie fatos encontrados de inferências e cite o nome ou link da fonte relevante.\n\nModo: ${effectiveMode}. Data e hora: ${currentTime}. Clima: ${weatherContext}\n${modeInstruction}\n\nDOCUMENTOS:\n${documentContext || 'Nenhum'}\n\nPESQUISA ONLINE:\n${onlineContext || 'Desativada ou sem resultados'}` },
            ...baseChat.messages.slice(-14), userMessage,
          ],
        }),
      });
      if (!response.ok) throw new Error('ollama');
      if (!response.body) throw new Error('stream');
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      let buffer = ''; let responseText = ''; let firstTokenMs: number | undefined;
      const streamingChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: '', kind: 'text' as const, effort, model: selectedModelLabel }], updatedAt: Date.now() };
      if (displayStreaming) setChats(current => [streamingChat, ...current.filter(chat => chat.id !== baseChat.id)]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const data = JSON.parse(line) as OllamaApiResponse;
          const chunk = data.message?.content ?? '';
          if (chunk && firstTokenMs === undefined) firstTokenMs = performance.now() - requestStarted;
          responseText += chunk;
        }
        if (displayStreaming) {
          const visibleText = responseText;
          setChats(current => current.map(chat => chat.id === baseChat.id ? { ...streamingChat, messages: [...pendingChat.messages, { role: 'assistant', content: visibleText, kind: 'text', firstTokenMs, effort, model: selectedModelLabel }] } : chat));
        }
      }
      if (buffer.trim()) {
        const data = JSON.parse(buffer) as OllamaApiResponse;
        const chunk = data.message?.content ?? '';
        if (chunk && firstTokenMs === undefined) firstTokenMs = performance.now() - requestStarted;
        responseText += chunk;
      }
      responseText = responseText.trim();
      if (!responseText) throw new Error('empty');
      if (effectiveMode === 'Imagens') {
        let candidate = cleanSvg(responseText);
        if (!hasDetailedVisual(candidate)) {
          setActivityLabel('Refinando os detalhes da imagem…');
          const retryModel = effort === 'Baixo' ? FAST_MODEL : MODEL;
          const retry = await fetch('http://localhost:11434/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: retryModel, stream: false, keep_alive: '30m',
              options: { temperature: 0.16, top_p: 0.86, repeat_penalty: 1.1, num_ctx: 4096, num_predict: effort === 'Baixo' ? 1200 : 1900 },
              messages: [
                { role: 'system', content: 'Você é um ilustrador SVG. Entregue somente SVG 1024x1024 seguro e completo. Desenhe o objeto de forma reconhecível usando pelo menos 12 formas, silhueta clara, detalhes, luz e sombra. Não use texto, legenda, janela, cartão ou imagem externa.' },
                { role: 'user', content: `O primeiro desenho ficou genérico e foi rejeitado. Refaça do zero: ${question}. ${imageSubjectGuide(question)}` },
              ],
            }),
          });
          if (retry.ok) {
            const retryData = await retry.json() as OllamaApiResponse;
            const refined = cleanSvg(retryData.message?.content ?? '');
            if (hasDetailedVisual(refined)) { candidate = refined; selectedModelLabel = `${retryModel === MODEL ? 'Qwen 7B' : 'Qwen 3B'} · revisado`; }
          }
        }
        responseText = hasDetailedVisual(candidate) ? candidate : fallbackSvg(question);
      }
      const proposedAction = effectiveMode === 'Agente' ? parseAction(responseText) : null;
      const kind: MessageKind = effectiveMode === 'Planilhas' ? 'sheet' : effectiveMode === 'Imagens' ? 'image' : proposedAction ? 'action' : 'text';
      if (kind === 'text') responseText = polishPortuguese(responseText);
      const elapsedMs = performance.now() - requestStarted;
      const completeChat = { ...pendingChat, messages: [...pendingChat.messages, { role: 'assistant' as const, content: responseText, kind, elapsedMs, firstTokenMs: firstTokenMs ?? elapsedMs, effort, model: selectedModelLabel, sourcePrompt: kind === 'image' ? question : undefined }], updatedAt: Date.now() };
      persistChats([completeChat, ...chats.filter(chat => chat.id !== baseChat.id)]);
      if (kind === 'text') { rememberExchange(question, responseText); speak(responseText); }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não consegui acessar o modelo local. Confirme se o Ollama está aberto e tente novamente.');
    } finally { setLoading(false); }
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
                  const cleanedSvg = message.kind === 'image' ? cleanSvg(message.content) : '';
                  const svg = message.kind === 'image' ? hasDetailedVisual(cleanedSvg) ? cleanedSvg : fallbackSvg(imagePrompt) : '';
                  const streaming = loading && index === history.length - 1 && message.role === 'assistant';
                  return <article key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && <div className="nexo-logo mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-white"><NexoMark className="size-4" /></div>}
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[82%] ${message.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'assistant-message rounded-bl-md border border-border bg-card/80'}`}>
                      {message.kind === 'image' && svg ? <><Image unoptimized width={1024} height={1024} className="aspect-square w-full rounded-xl bg-white object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Imagem criada pelo Nexo" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => download(svg, 'imagem-nexo.svg', 'image/svg+xml')}><Download /> Baixar SVG</Button>{imagePrompt && <Button size="sm" variant="ghost" onClick={() => { setMode('Imagens'); setPrompt(`Crie uma nova versão mais detalhada de: ${imagePrompt}`); }}><RefreshCw /> Criar variação</Button>}</div></>
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
              {documents.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{documents.map((doc, index) => <Badge key={`${doc.name}-${index}`} variant="secondary" className="h-7 gap-1.5 px-2.5"><FileText />{doc.name}<button aria-label={`Remover ${doc.name}`} onClick={() => setDocuments(items => items.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3" /></button></Badge>)}</div>}
              <div className="composer rounded-[20px] border border-border p-2 shadow-[0_18px_55px_rgb(0_0_0/18%)] focus-within:border-primary/30">
                <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void askNexo(); } }} placeholder={mode === 'Planilhas' ? 'Descreva a planilha que precisa…' : mode === 'Imagens' ? 'Descreva uma imagem simples…' : mode === 'Programar' ? 'Descreva o código avançado…' : mode === 'Agente' ? 'Descreva a alteração no projeto…' : 'Pode falar do seu jeito…'} className="min-h-14 max-h-32 resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:ring-0" />
                <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-0.5"><input ref={fileInput} className="hidden" type="file" multiple accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log" onChange={addDocuments} /><Button size="icon-sm" variant="ghost" aria-label="Anexar arquivo" onClick={() => fileInput.current?.click()}><Paperclip /></Button><Button size="icon-sm" variant={listening ? 'secondary' : 'ghost'} className={listening ? 'text-rose-400' : ''} aria-label="Falar" onClick={startVoice}>{listening ? <MicOff /> : <Mic />}</Button><Button size="icon-sm" variant={voiceOutput ? 'secondary' : 'ghost'} aria-label="Ler respostas em voz alta" onClick={() => { setVoiceOutput(value => !value); speechSynthesis?.cancel(); }}>{voiceOutput ? <Volume2 /> : <VolumeX />}</Button><Button size="sm" variant={webSearch ? 'secondary' : 'ghost'} className={webSearch ? 'text-primary' : 'text-muted-foreground'} onClick={() => setWebSearch(value => !value)}><Search /><span className="hidden sm:inline">{webSearch ? 'Web ligada' : 'Pesquisar'}</span></Button><Button size="icon-sm" variant="ghost" aria-label="Pesquisar no Google" title="Pesquisar no Google em uma nova aba" onClick={openGoogleSearch}><Globe2 /></Button></div><Button size="icon" className="rounded-xl" onClick={() => void askNexo()} disabled={!prompt.trim() || loading} aria-label="Enviar"><ArrowUp /></Button></div>
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
            { name: 'Documentos', detail: documents.length ? `${documents.length} arquivo(s)` : 'Nenhum arquivo', active: documents.length > 0, icon: Library },
          ].map(item => { const Icon = item.icon; return <div key={item.name} className="rounded-2xl border border-border bg-card/55 p-3.5"><div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p></div><span className={`size-2 shrink-0 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`} /></div></div>; })}</div>
          {!weather && <Button className="mt-3 w-full" size="sm" variant="outline" onClick={useDeviceLocation}><CloudSun /> Usar localização</Button>}
          <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => setSecurityOpen(true)}><ShieldCheck /> Abrir central de segurança</Button>
          <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/7 p-4"><p className="text-xs font-medium text-primary">Runtime cognitivo local</p><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg bg-muted px-2 py-1.5">Task Graph</span><span className="rounded-lg bg-muted px-2 py-1.5">Checkpoints</span><span className="rounded-lg bg-muted px-2 py-1.5">Tool contracts</span><span className="rounded-lg bg-muted px-2 py-1.5">Repository map</span><span className="rounded-lg bg-muted px-2 py-1.5">Context Engine</span><span className="rounded-lg bg-muted px-2 py-1.5">RAG local</span></div></div>
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
        <DialogFooter><Button onClick={saveProfile}>Salvar perfil</Button></DialogFooter>
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
