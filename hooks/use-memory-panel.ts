'use client';

import { useState } from 'react';
import { NexoClient } from '@/lib/nexo/client';
import type { NexoMemory } from '@/lib/nexo/types';

type MemoryAction = 'update' | 'confirm' | 'forget' | 'delete';

export function useMemoryPanel(
  agentToken: string,
  onNotice: (message: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [memories, setMemories] = useState<NexoMemory[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(nextQuery = query) {
    if (!agentToken) {
      onNotice('O Nexo Runtime está offline.');
      return;
    }
    setLoading(true);
    try {
      const items = await new NexoClient(agentToken).listMemories({
        query: nextQuery.trim() || undefined,
        limit: 100,
      });
      setMemories(items);
      const selected = items.find((item) => item.id === selectedId) || items[0];
      setSelectedId(selected?.id || '');
      setDraft(selected?.content || '');
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui abrir a memória.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function openPanel() {
    setOpen(true);
    await load('');
  }

  async function manage(action: MemoryAction) {
    if (!agentToken || !selectedId) return;
    setLoading(true);
    try {
      await new NexoClient(agentToken).manageMemory(
        selectedId,
        action,
        action === 'update' ? { content: draft } : undefined,
      );
      onNotice(
        action === 'delete'
          ? 'Memória apagada definitivamente.'
          : action === 'forget'
            ? 'Memória arquivada.'
            : action === 'confirm'
              ? 'Memória confirmada.'
              : 'Memória atualizada.',
      );
      await load(query);
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui alterar a memória.',
      );
    } finally {
      setLoading(false);
    }
  }

  function select(item: NexoMemory) {
    setSelectedId(item.id);
    setDraft(item.content);
  }

  return {
    open,
    memories,
    query,
    selectedId,
    draft,
    loading,
    setOpen,
    setQuery,
    setDraft,
    openPanel,
    load,
    manage,
    select,
  };
}

export type MemoryPanelController = ReturnType<typeof useMemoryPanel>;
