'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { NexoClient } from '@/lib/nexo/client';
import { parseAgentTask, type AgentTask, type Chat, type UserProfile } from '@/lib/nexo/types';

export function useNexoTaskSync({ chats, setChats, token, profile, setOnline }: {
  chats: Chat[]; setChats: Dispatch<SetStateAction<Chat[]>>; token: string; profile: UserProfile; setOnline: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (!token) return;
    const activeTasks = chats.flatMap(chat => chat.messages.flatMap(message => {
      if (message.kind !== 'task') return [];
      const task = parseAgentTask(message.content);
      return task && ['planning', 'running'].includes(task.status) ? [{ chatId: chat.id, taskId: task.id }] : [];
    }));
    if (!activeTasks.length) return;
    const controller = new AbortController(); const client = new NexoClient(token);
    const timer = window.setTimeout(async () => {
      try {
        const updates = await Promise.all(activeTasks.map(async target => {
          try { return { ...target, task: await client.getTask(target.taskId, controller.signal) }; } catch { return null; }
        }));
        const byTask = new Map(updates.filter((item): item is { chatId: string; taskId: string; task: AgentTask } => Boolean(item)).map(item => [item.taskId, item.task]));
        if (!byTask.size) return;
        let changed = false;
        const nextChats = chats.map(chat => {
          let chatChanged = false;
          const messages = chat.messages.map(message => {
            if (message.kind !== 'task') return message;
            const current = parseAgentTask(message.content); const task = current ? byTask.get(current.id) : undefined;
            if (!task || JSON.stringify(task) === message.content) return message;
            changed = true; chatChanged = true; return { ...message, content: JSON.stringify(task) };
          });
          return chatChanged ? { ...chat, messages, updatedAt: Date.now() } : chat;
        });
        if (changed) {
          setChats(nextChats); try { localStorage.setItem('nexo-chats', JSON.stringify(nextChats)); } catch { /* SQLite continua autoritativo */ }
          void client.saveSession(nextChats, profile).catch(() => undefined);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setOnline(false);
      }
    }, 1_500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [chats, profile, setChats, setOnline, token]);
}
