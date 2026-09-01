'use client';

import { SidebarChatList } from '@/components/nexo/sidebar-chat-list';
import type { useChatSessions } from '@/hooks/use-chat-sessions';
import type { useInterfaceState } from '@/hooks/use-interface-state';
import type { useComposerState } from '@/hooks/use-composer-state';

type NexoSidebarProps = {
  sessions: ReturnType<typeof useChatSessions>;
  ui: ReturnType<typeof useInterfaceState>;
  composer: ReturnType<typeof useComposerState>;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenMemory: () => Promise<void>;
};

export function NexoSidebar(props: NexoSidebarProps) {
  const {
    chats,
    visibleChats,
    activeChatId,
    setActiveChatId,
    chatSearch,
    setChatSearch,
  } = props.sessions;
  const { mounted, setMobileOpen } = props.ui;
  return (
    <SidebarChatList
      mounted={mounted}
      chats={chats}
      visibleChats={visibleChats}
      activeChatId={activeChatId}
      chatSearch={chatSearch}
      onChatSearchChange={setChatSearch}
      onCreateChat={props.onCreateChat}
      onSelectChat={(chatId) => {
        setActiveChatId(chatId);
        setMobileOpen(false);
        props.composer.setNotice('');
      }}
      onDeleteChat={props.onDeleteChat}
      onOpenProjects={() => {
        props.ui.setPersonalOpen(true);
        setMobileOpen(false);
      }}
      onOpenMemory={() => void props.onOpenMemory()}
      onOpenCapabilities={() => {
        props.ui.setCapabilityOpen(true);
        setMobileOpen(false);
      }}
      onOpenCommands={() => {
        props.ui.setCommandOpen(true);
        setMobileOpen(false);
      }}
      onOpenSettings={() => {
        props.ui.setProfileOpen(true);
        setMobileOpen(false);
      }}
    />
  );
}
