'use client';
/* oxlint-disable jsx-a11y/media-has-caption */

import Image from 'next/image';
import {
  Copy,
  Download,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { AgentTaskCard } from '@/components/nexo/agent-task-card';
import { ActionRequest } from '@/components/nexo/action-request';
import { NexoOrb } from '@/components/nexo/nexo-orb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NexoClient } from '@/lib/nexo/client';
import {
  cleanSvg,
  formatDuration,
  parseAction,
  RichText,
  stripFence,
} from '@/lib/nexo/page-helpers';
import {
  parseAgentTask,
  type AgentPermission,
  type AgentTask,
  type ChatMessage,
  type NexoAction,
} from '@/lib/nexo/types';

type MessageBubbleProps = {
  message: ChatMessage;
  index: number;
  history: ChatMessage[];
  loading: boolean;
  agentToken: string;
  agentOnline: boolean;
  actionLoading: boolean;
  onVariation: (prompt: string) => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onTaskPermission: (
    index: number,
    task: AgentTask,
    permission: AgentPermission,
    decision: 'approved' | 'denied',
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

export function MessageBubble(props: MessageBubbleProps) {
  const { message, index } = props;
  const imagePrompt =
    message.sourcePrompt ??
    (props.history[index - 1]?.role === 'user'
      ? props.history[index - 1].content
      : '');
  const svg =
    message.kind === 'image' && !message.artifact
      ? cleanSvg(message.content)
      : '';
  const streaming =
    props.loading &&
    index === props.history.length - 1 &&
    message.role === 'assistant';
  const artifactUrl = message.artifact
    ? new NexoClient(props.agentToken).artifactUrl(message.artifact.id)
    : '';
  const task =
    message.kind === 'task' ? parseAgentTask(message.content) : undefined;
  const action =
    message.kind === 'action' ? parseAction(message.content) : undefined;

  return (
    <article
      className={`nexo-message flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {message.role === 'assistant' && (
        <NexoOrb
          state={streaming ? 'thinking' : 'idle'}
          className="mt-0.5 size-7 shrink-0"
        />
      )}
      <div
        className={`rounded-2xl text-[15px] leading-7 ${message.role === 'user' ? 'nexo-message-user rounded-br-md px-4 py-2.5' : 'nexo-message-assistant min-w-0 px-1 py-0.5'}`}
      >
        {message.artifact?.type === 'image' ? (
          <>
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="max-h-[560px] w-full rounded-xl bg-black/5 object-contain"
              src={artifactUrl}
              alt={message.sourcePrompt || 'Imagem criada pelo Nexo'}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"
                href={artifactUrl}
                download
              >
                <Download className="size-3.5" /> Baixar imagem
              </a>
              {imagePrompt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => props.onVariation(imagePrompt)}
                >
                  <RefreshCw /> Criar variação
                </Button>
              )}
            </div>
          </>
        ) : message.artifact?.type === 'video' ? (
          <>
            <video
              className="max-h-[560px] w-full rounded-xl bg-black"
              controls
              src={artifactUrl}
            />
            <a
              className="mt-3 inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"
              href={artifactUrl}
              download
            >
              <Download className="size-3.5" /> Baixar vídeo
            </a>
          </>
        ) : message.artifact?.type === 'audio' ? (
          <audio className="w-full" controls src={artifactUrl} />
        ) : message.kind === 'image' && svg ? (
          <>
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="aspect-square w-full rounded-xl bg-white object-contain"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              alt="Diagrama SVG criado pelo Nexo"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">
                SVG legado · não é imagem gerada por modelo
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  props.onDownload(svg, 'diagrama-nexo.svg', 'image/svg+xml')
                }
              >
                <Download /> Baixar SVG
              </Button>
            </div>
          </>
        ) : message.kind === 'sheet' ? (
          <>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
              {stripFence(message.content)}
            </pre>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() =>
                props.onDownload(
                  '\ufeff' + stripFence(message.content),
                  'planilha-nexo.csv',
                  'text/csv;charset=utf-8',
                )
              }
            >
              <Download /> Baixar planilha
            </Button>
          </>
        ) : task ? (
          <AgentTaskCard
            task={task}
            busy={props.actionLoading}
            onPermission={(permission, decision) =>
              props.onTaskPermission(index, task, permission, decision)
            }
            onControl={(control) =>
              props.onTaskControl(index, task.id, control)
            }
            onRefresh={() => props.onTaskRefresh(index, task.id)}
          />
        ) : action ? (
          <ActionRequest
            action={action}
            index={index}
            agentOnline={props.agentOnline}
            agentToken={props.agentToken}
            actionLoading={props.actionLoading}
            onRun={props.onRunAction}
          />
        ) : message.role === 'assistant' ? (
          <RichText content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        {message.role === 'assistant' && message.content && (
          <div className="message-actions border-0">
            <span className="response-metrics">
              {streaming ? (
                <>
                  <i /> Escrevendo
                  {message.firstTokenMs !== undefined
                    ? ` · iniciou em ${formatDuration(message.firstTokenMs)}`
                    : '…'}
                </>
              ) : (
                <details>
                  <summary className="cursor-pointer list-none rounded-md px-1 py-0.5 hover:bg-muted">
                    Detalhes
                  </summary>
                  <div className="absolute z-20 mt-1 rounded-xl border border-border bg-popover p-3 shadow-xl">
                    {message.model || 'Nexo'}
                    {message.firstTokenMs !== undefined &&
                      ` · início ${formatDuration(message.firstTokenMs)}`}
                    {message.elapsedMs !== undefined &&
                      ` · total ${formatDuration(message.elapsedMs)}`}
                    {message.effort && ` · ${message.effort}`}
                  </div>
                </details>
              )}
            </span>
            <span className="flex items-center gap-1">
              {!streaming &&
                (message.artifact || message.content.includes('```')) && (
                  <button
                    aria-label="Abrir artefato"
                    onClick={() => props.onOpenArtifact(message)}
                  >
                    <FileText /> Abrir
                  </button>
                )}
              {!streaming && message.kind === 'text' && (
                <button
                  aria-label="Copiar resposta"
                  onClick={() => props.onCopy(message.content)}
                >
                  <Copy /> Copiar
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
