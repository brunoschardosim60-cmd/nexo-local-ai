'use client';
/* oxlint-disable react/react-compiler */

import { useEffect, useMemo, useState } from 'react';
import { safeParse } from '@/lib/nexo/page-helpers';
import type {
  Chat,
  ChatMessage,
  LocalAttachment,
  LocalDocument,
} from '@/lib/nexo/types';

export function useChatSessions(
  onStorageError: (message: string) => void,
  onPersist?: (chats: Chat[]) => void,
) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [chatSearch, setChatSearch] = useState('');
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

  useEffect(() => {
    const storedChats = safeParse<Chat[]>(
      localStorage.getItem('nexo-chats'),
      [],
    );
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
    setChats(initialChats);
    setActiveChatId(initialChats[0]?.id ?? '');
    if (initialChats.length && !storedChats.length)
      localStorage.setItem('nexo-chats', JSON.stringify(initialChats));
  }, []);

  function persistChats(next: Chat[]) {
    const limited = next
      .map((chat) => ({ ...chat, messages: chat.messages.slice(-80) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
    setChats(limited);
    try {
      localStorage.setItem('nexo-chats', JSON.stringify(limited));
    } catch {
      onStorageError('A memória local está cheia. Exclua chats antigos.');
    }
    onPersist?.(limited);
  }

  function mergeRemoteChats(remoteChats: Chat[]) {
    if (!remoteChats.length) return;
    setChats((current) => {
      const merged = new Map<string, Chat>();
      for (const chat of [...current, ...remoteChats]) {
        const existing = merged.get(chat.id);
        if (!existing || chat.updatedAt > existing.updatedAt)
          merged.set(chat.id, chat);
      }
      const restored = [...merged.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 40);
      localStorage.setItem('nexo-chats', JSON.stringify(restored));
      setActiveChatId((active) => active || restored[0]?.id || '');
      return restored;
    });
  }

  return {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    documents,
    setDocuments,
    attachments,
    setAttachments,
    chatSearch,
    setChatSearch,
    activeChat,
    history,
    visibleChats,
    persistChats,
    mergeRemoteChats,
  };
}
