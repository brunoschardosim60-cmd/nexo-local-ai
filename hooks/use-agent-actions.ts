'use client';

import type { Dispatch, SetStateAction } from 'react';
import { NexoClient, NEXO_AGENT_URL } from '@/lib/nexo/client';
import {
  taskStatusLabel,
  type AgentPermission,
  type AgentTask,
  type Chat,
  type LocalDocument,
  type NexoAction,
} from '@/lib/nexo/types';

type AgentActionsOptions = {
  activeChat: Chat | undefined;
  chats: Chat[];
  agentToken: string;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  setAgentOnline: (online: boolean) => void;
  setDocuments: Dispatch<SetStateAction<LocalDocument[]>>;
  persistChats: (chats: Chat[]) => void;
  setNotice: (notice: string) => void;
};

export function useAgentActions(options: AgentActionsOptions) {
  function updateTaskMessage(messageIndex: number, task: AgentTask) {
    if (!options.activeChat) return;
    const messages = options.activeChat.messages.map((message, index) =>
      index === messageIndex
        ? { ...message, content: JSON.stringify(task), kind: 'task' as const }
        : message,
    );
    const updated = { ...options.activeChat, messages, updatedAt: Date.now() };
    options.persistChats([
      updated,
      ...options.chats.filter((chat) => chat.id !== options.activeChat?.id),
    ]);
  }

  async function runAction(messageIndex: number, action: NexoAction) {
    if (
      !options.activeChat ||
      action.status !== 'pending' ||
      options.actionLoading
    )
      return;
    options.setActionLoading(true);
    options.setNotice('');
    try {
      const endpoints: Record<NexoAction['type'], string> = {
        write_file: '/files/write',
        create_folder: '/folders/create',
        read_file: '/files/read',
        list_files: '/files/list',
        create_project: '/projects/create',
      };
      const needsApproval = [
        'write_file',
        'create_folder',
        'create_project',
      ].includes(action.type);
      const response = await fetch(
        `${NEXO_AGENT_URL}${endpoints[action.type]}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Nexo-Token': options.agentToken,
          },
          body: JSON.stringify({
            path: action.path,
            content: action.content,
            template: action.template,
            confirmation: needsApproval ? 'APPROVED' : undefined,
          }),
        },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: unknown;
      };
      const resultObject =
        data.result &&
        typeof data.result === 'object' &&
        !Array.isArray(data.result)
          ? (data.result as {
              path?: string;
              content?: string;
              files?: string[];
            })
          : null;
      const output =
        action.type === 'read_file'
          ? resultObject?.content
          : action.type === 'list_files' && Array.isArray(data.result)
            ? data.result
                .map((item) => {
                  const entry = item as {
                    type?: string;
                    path?: string;
                    size?: number | null;
                  };
                  return `${entry.type === 'folder' ? '📁' : '📄'} ${entry.path}${entry.size ? ` · ${entry.size} bytes` : ''}`;
                })
                .join('\n')
            : resultObject?.files?.join(', ');
      if (
        response.ok &&
        output &&
        ['read_file', 'list_files'].includes(action.type)
      ) {
        options.setDocuments((current) =>
          [
            ...current,
            {
              name: `Agente: ${action.path}`,
              content: output.slice(0, 40_000),
            },
          ].slice(-8),
        );
      }
      const summary = response.ok
        ? action.type === 'read_file' || action.type === 'list_files'
          ? 'Leitura adicionada ao contexto'
          : `Concluído em ${resultObject?.path ?? action.path}`
        : (data.error ?? 'Falha ao executar.');
      const nextAction = {
        ...action,
        status: response.ok ? ('completed' as const) : ('failed' as const),
        result: summary,
        output: output?.slice(0, 8000),
      };
      const messages = options.activeChat.messages.map((message, index) =>
        index === messageIndex
          ? { ...message, content: JSON.stringify({ nexo_action: nextAction }) }
          : message,
      );
      const updated = {
        ...options.activeChat,
        messages,
        updatedAt: Date.now(),
      };
      options.persistChats([
        updated,
        ...options.chats.filter((chat) => chat.id !== options.activeChat?.id),
      ]);
    } catch {
      options.setNotice(
        'O agente local não respondeu. Confirme se ele está ativo.',
      );
      options.setAgentOnline(false);
    } finally {
      options.setActionLoading(false);
    }
  }

  async function decideTaskPermission(
    messageIndex: number,
    task: AgentTask,
    permission: AgentPermission,
    decision: 'approved' | 'denied',
  ) {
    if (!options.agentToken || options.actionLoading) return;
    options.setActionLoading(true);
    options.setNotice(
      decision === 'approved'
        ? 'Ação aprovada. O agente retomou a tarefa…'
        : 'Ação negada.',
    );
    try {
      const nextTask = await new NexoClient(
        options.agentToken,
      ).decidePermission(task.id, permission.id, decision);
      updateTaskMessage(messageIndex, nextTask);
      options.setNotice(
        nextTask.status === 'awaiting_approval'
          ? 'O agente precisa de uma nova aprovação.'
          : `Tarefa: ${taskStatusLabel(nextTask.status)}.`,
      );
    } catch (error) {
      options.setNotice(
        error instanceof Error
          ? error.message
          : 'O agente local não respondeu.',
      );
    } finally {
      options.setActionLoading(false);
    }
  }

  async function refreshAgentTask(messageIndex: number, taskId: string) {
    if (!options.agentToken || options.actionLoading) return;
    options.setActionLoading(true);
    try {
      updateTaskMessage(
        messageIndex,
        await new NexoClient(options.agentToken).getTask(taskId),
      );
      options.setNotice('Estado da tarefa atualizado.');
    } catch (error) {
      options.setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui atualizar a tarefa.',
      );
    } finally {
      options.setActionLoading(false);
    }
  }

  async function controlAgentTask(
    messageIndex: number,
    taskId: string,
    action: 'pause' | 'resume' | 'cancel',
  ) {
    if (!options.agentToken || options.actionLoading) return;
    options.setActionLoading(true);
    try {
      updateTaskMessage(
        messageIndex,
        await new NexoClient(options.agentToken).controlTask(taskId, action),
      );
      options.setNotice(
        action === 'pause'
          ? 'Tarefa pausada e salva em checkpoint.'
          : action === 'resume'
            ? 'Tarefa retomada do estado persistido.'
            : 'Tarefa cancelada.',
      );
    } catch (error) {
      options.setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui controlar a tarefa.',
      );
    } finally {
      options.setActionLoading(false);
    }
  }

  return {
    runAction,
    decideTaskPermission,
    refreshAgentTask,
    controlAgentTask,
  };
}
