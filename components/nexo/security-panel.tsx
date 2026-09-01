'use client';

import {
  Check,
  Clock3,
  FilePenLine,
  Library,
  Network,
  Server,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AgentHealth } from '@/lib/nexo/types';

type SecurityPanelProps = {
  open: boolean;
  health: AgentHealth | null;
  online: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SecurityPanel({
  open,
  health,
  online,
  onOpenChange,
}: SecurityPanelProps) {
  const items = [
    {
      title: 'Acesso local',
      detail: health?.security?.loopbackOnly
        ? 'Restrito a 127.0.0.1'
        : 'Agente offline',
      active: !!health?.security?.loopbackOnly,
      icon: Server,
    },
    {
      title: 'Sessão autenticada',
      detail: health?.security?.authenticatedSession
        ? 'Token temporário ativo'
        : 'Sem sessão',
      active: !!health?.security?.authenticatedSession,
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
      active: online,
      icon: FilePenLine,
    },
    {
      title: 'Limite de ações',
      detail: health?.security
        ? `${health.security.rateLimitPerMinute} por minuto`
        : 'Agente offline',
      active: !!health?.security,
      icon: Clock3,
    },
    {
      title: 'Auditoria',
      detail: health?.security
        ? `${health.security.auditEntries} evento(s) nesta sessão`
        : 'Agente offline',
      active: !!health?.security,
      icon: Library,
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Central de segurança
          </DialogTitle>
          <DialogDescription>
            O modelo sugere ações; o agente local valida caminhos, permissões e
            sua aprovação antes de executar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => {
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
                {health?.network?.vpnDetected
                  ? `Interface protegida detectada: ${health.network.interfaces.find((item) => item.vpn)?.name}.`
                  : 'Nenhuma VPN foi detectada. Para integrar conexão real com segurança, escolha e configure um provedor como WireGuard; o Nexo não altera sua rede sem uma configuração explícita.'}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Área permitida:</span>{' '}
          {health?.workspace ?? 'agente local offline'}. Exclusão de arquivos,
          terminal irrestrito e mudanças de sistema permanecem bloqueados.
        </div>
      </DialogContent>
    </Dialog>
  );
}
