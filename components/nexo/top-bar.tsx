'use client';

import {
  Keyboard,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type TopBarProps = {
  title: string;
  mounted: boolean;
  theme: 'system' | 'light' | 'dark';
  agentOnline: boolean;
  onOpenMenu: () => void;
  onOpenPersonal: () => void;
  onOpenCommands: () => void;
  onOpenSecurity: () => void;
  onToggleTheme: () => void;
};

export function TopBar(props: TopBarProps) {
  const themeLabel =
    props.theme === 'system'
      ? 'automático'
      : props.theme === 'dark'
        ? 'escuro'
        : 'claro';
  return (
    <header className="nexo-header flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          className="lg:hidden"
          size="icon"
          variant="ghost"
          aria-label="Abrir menu"
          onClick={props.onOpenMenu}
        >
          <Menu />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{props.title}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Abrir inteligência pessoal"
          title="Meu dia"
          onClick={props.onOpenPersonal}
        >
          <LayoutDashboard />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Abrir paleta de comandos"
          title="Comandos (Ctrl+K)"
          onClick={props.onOpenCommands}
        >
          <Keyboard />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Central de segurança"
          title="Central de segurança"
          onClick={props.onOpenSecurity}
        >
          <ShieldCheck />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Tema atual: ${themeLabel}. Alterar tema`}
          title={`Tema: ${themeLabel}`}
          onClick={props.onToggleTheme}
        >
          {props.mounted && props.theme === 'system' ? (
            <Monitor />
          ) : props.theme === 'dark' ? (
            <Moon />
          ) : (
            <Sun />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="hidden gap-2 text-xs text-muted-foreground sm:flex"
          onClick={props.onOpenSecurity}
          title="Runtime e privacidade"
        >
          <span
            className={`size-1.5 rounded-full ${props.agentOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
          {props.agentOnline ? 'Local' : 'Offline'}
        </Button>
      </div>
    </header>
  );
}
