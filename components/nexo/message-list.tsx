'use client';

import type { RefObject } from 'react';
import { MessageBubble } from '@/components/nexo/message-bubble';
import { NexoOrb } from '@/components/nexo/nexo-orb';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BRAND_NAME } from '@/lib/nexo/brand';
import type {
  AgentPermission,
  AgentTask,
  ChatMessage,
  NexoAction,
} from '@/lib/nexo/types';

type MessageListProps = {
  history: ChatMessage[];
  loading: boolean;
  listening: boolean;
  profileName: string;
  activityLabel: string;
  agentToken: string;
  agentOnline: boolean;
  actionLoading: boolean;
  endRef: RefObject<HTMLDivElement | null>;
  onVariation: (prompt: string) => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onTaskPermission: (
    index: number,
    task: AgentTask,
    permission: AgentPermission,
    decision: 'approve' | 'deny',
  ) => void;
  onTaskControl: (
    index: number,
    taskId: string,
    action: 'pause' | 'resume' | 'cancel',
  ) => void;
  onTaskRefresh: (index: number, taskId: string) => void;
  onRunAction: (index: number, action: NexoAction) => void;
  onOpenArtifact: (message: ChatMessage) => void;
  onCopy: (content: string) => void;
};

export function MessageList(props: MessageListProps) {
  const greeting =
    new Date().getHours() >= 18
      ? 'Boa noite'
      : new Date().getHours() >= 12
        ? 'Boa tarde'
        : 'Bom dia';
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="nexo-conversation flex min-h-full flex-col px-4 py-6 sm:px-7 sm:py-8">
        {props.history.length === 0 ? (
          <div className="m-auto max-w-xl py-10 text-center">
            <NexoOrb
              state={
                props.loading
                  ? 'thinking'
                  : props.listening
                    ? 'listening'
                    : 'idle'
              }
              className="mx-auto mb-7 size-20"
            />
            <p className="text-sm text-muted-foreground">
              {greeting}
              {props.profileName ? `, ${props.profileName}` : ''}.
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] sm:text-[2.6rem]">
              O que vamos fazer?
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Converse normalmente. Quando a tarefa pedir mais, o {BRAND_NAME}{' '}
              abre as ferramentas certas.
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-2 sm:space-y-8">
            {props.history.map((message, index) => (
              <MessageBubble
                key={`${message.role}-${index}`}
                {...props}
                message={message}
                index={index}
              />
            ))}
            {props.loading &&
              props.history[props.history.length - 1]?.role !== 'assistant' && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <NexoOrb state="thinking" className="size-7" />
                  <span>{props.activityLabel}</span>
                </div>
              )}
            <div ref={props.endRef} />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
