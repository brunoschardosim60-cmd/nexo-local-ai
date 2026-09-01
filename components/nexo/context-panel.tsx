'use client';

import {
  Bot,
  Check,
  Clock3,
  CloudSun,
  Gauge,
  Globe2,
  Library,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NexoMark } from '@/components/nexo-mark';
import type { Weather } from '@/hooks/use-clock-and-weather';
import type {
  AgentHealth,
  Effort,
  LocalDocument,
  UserProfile,
} from '@/lib/nexo/types';

type ContextPanelProps = {
  effort: Effort;
  health: AgentHealth | null;
  online: boolean;
  profile: UserProfile;
  currentTime: string;
  weather: Weather | null;
  weatherStatus: 'idle' | 'loading' | 'error';
  webSearch: boolean;
  documents: LocalDocument[];
  onOpenProfile: () => void;
  onUseLocation: () => void;
  onOpenSecurity: () => void;
  onOpenPersonal: () => void;
  onOpenMemory: () => void;
};

export function ContextPanel(props: ContextPanelProps) {
  const items = [
    {
      name: 'Modelos locais',
      detail: `Qwen 3B/7B · esforço ${props.effort.toLowerCase()}`,
      active: true,
      icon: NexoMark,
    },
    {
      name: 'Nexo Core',
      detail: props.health?.agent
        ? `${props.health.agent.database} · ${props.health.agent.tasks.running} ativa(s)`
        : props.online
          ? 'Inicializando runtime'
          : 'Offline',
      active: !!props.health?.agent,
      icon: Bot,
    },
    {
      name: 'Segurança',
      detail: props.health?.security
        ? `Sessão autenticada · ${props.health.security.rateLimitPerMinute}/min`
        : 'Aguardando agente',
      active: !!props.health?.security,
      icon: ShieldCheck,
    },
    {
      name: 'Rede / VPN',
      detail: props.health?.network?.vpnDetected
        ? `Ativa · ${props.health.network.interfaces.find((item) => item.vpn)?.name}`
        : 'Nenhuma VPN detectada',
      active: !!props.health?.network?.vpnDetected,
      icon: Network,
    },
    {
      name: 'Perfil',
      detail: `${props.profile.name || 'Usuário'} · ${props.profile.style}`,
      active: true,
      icon: Check,
    },
    {
      name: 'Horário',
      detail: props.currentTime || 'Sincronizando',
      active: !!props.currentTime,
      icon: Clock3,
    },
    {
      name: 'Clima',
      detail: props.weather
        ? `${props.weather.label} · ${props.weather.temperature}°C`
        : props.profile.city
          ? props.weatherStatus === 'loading'
            ? 'Atualizando…'
            : 'Não encontrado'
          : 'Defina sua cidade',
      active: !!props.weather,
      icon: CloudSun,
    },
    {
      name: 'Pesquisa',
      detail: props.webSearch
        ? 'Wikipedia + fontes especializadas'
        : 'Desativada',
      active: props.webSearch,
      icon: Search,
    },
    {
      name: 'Browser Agent',
      detail: props.health?.agent?.capabilities?.browser?.automation?.available
        ? `Playwright real · ${props.health.agent.capabilities.browser.automation.actions.length} ações`
        : 'Navegação segura disponível',
      active:
        !!props.health?.agent?.capabilities?.browser?.automation?.available,
      icon: Globe2,
    },
    {
      name: 'Skills',
      detail: props.health?.agent?.capabilities?.skills
        ? `${props.health.agent.capabilities.skills.enabled} ativa(s)`
        : 'Carregando catálogo local',
      active: !!props.health?.agent?.capabilities?.skills?.enabled,
      icon: Sparkles,
    },
    {
      name: 'Segundo plano',
      detail: props.health?.agent?.capabilities?.background
        ? `${props.health.agent.capabilities.background.active} agendamento(s)`
        : 'Scheduler offline',
      active: !!props.health?.agent?.capabilities?.background?.running,
      icon: Gauge,
    },
    {
      name: 'Documentos',
      detail: props.documents.length
        ? `${props.documents.length} arquivo(s)`
        : 'Nenhum arquivo',
      active: props.documents.length > 0,
      icon: Library,
    },
  ];

  return (
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
              onClick={props.onOpenProfile}
            >
              <Settings2 />
            </Button>
          </div>
          <div className="mt-6 space-y-2.5">
            {items.map((item) => {
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
          {!props.weather && (
            <Button
              className="mt-3 w-full"
              size="sm"
              variant="outline"
              onClick={props.onUseLocation}
            >
              <CloudSun /> Usar localização
            </Button>
          )}
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="outline"
            onClick={props.onOpenSecurity}
          >
            <ShieldCheck /> Abrir central de segurança
          </Button>
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="outline"
            onClick={props.onOpenPersonal}
          >
            <LayoutDashboard /> Abrir meu dia
          </Button>
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="outline"
            onClick={props.onOpenMemory}
          >
            <Library /> Gerenciar memória
          </Button>
          <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/7 p-4">
            <p className="text-xs font-medium text-primary">
              Nexo Core {props.health?.agent?.version || 'local'}
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
  );
}
