'use client';

import {
  Blocks,
  FolderPlus,
  Keyboard,
  LayoutDashboard,
  Library,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { NexoOrb } from '@/components/nexo/nexo-orb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BRAND_NAME } from '@/lib/nexo/brand';
import type { Chat } from '@/lib/nexo/types';

type SidebarChatListProps = {
  mounted: boolean;
  chats: Chat[];
  visibleChats: Chat[];
  activeChatId: string;
  chatSearch: string;
  onChatSearchChange: (value: string) => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onOpenProjects: () => void;
  onOpenMemory: () => void;
  onOpenCapabilities: () => void;
  onOpenCommands: () => void;
  onOpenSettings: () => void;
};

export function SidebarChatList(props: SidebarChatListProps) {
  return (
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
        onClick={props.onCreateChat}
      >
        <Plus /> Novo
      </Button>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.chatSearch}
          onChange={(event) => props.onChatSearchChange(event.target.value)}
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
            {props.mounted && props.chats.length === 0 && (
              <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
                Suas conversas aparecerão aqui.
              </p>
            )}
            {props.visibleChats.map((chat) => (
              <div
                key={chat.id}
                className={`group flex items-center rounded-xl transition ${chat.id === props.activeChatId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}
              >
                <button
                  className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs"
                  onClick={() => props.onSelectChat(chat.id)}
                >
                  {chat.title}
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="mr-1 opacity-0 group-hover:opacity-100"
                  aria-label={`Excluir ${chat.title}`}
                  onClick={() => props.onDeleteChat(chat.id)}
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
        onClick={props.onOpenProjects}
      >
        <FolderPlus /> Projetos
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={props.onOpenMemory}
      >
        <Library /> Memória
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={props.onOpenProjects}
      >
        <LayoutDashboard /> Meu dia
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={props.onOpenCapabilities}
      >
        <Blocks /> Capacidades
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={props.onOpenCommands}
      >
        <Keyboard /> Comandos{' '}
        <kbd className="ml-auto text-[9px] text-muted-foreground">Ctrl K</kbd>
      </Button>
      <Button
        className="justify-start"
        variant="ghost"
        onClick={props.onOpenSettings}
      >
        <Settings2 /> Configurações
      </Button>
    </div>
  );
}
