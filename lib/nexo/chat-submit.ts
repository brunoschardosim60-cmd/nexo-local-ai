'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { NexoClient } from '@/lib/nexo/client';
import {
  isImageCreationRequest,
  weatherDescription,
} from '@/lib/nexo/page-helpers';
import {
  taskStatusLabel,
  type Chat,
  type ChatMessage,
  type Effort,
  type LocalAttachment,
  type LocalDocument,
  type MediaArtifact,
  type MessageKind,
  type UserProfile,
} from '@/lib/nexo/types';
import type { Weather } from '@/hooks/use-clock-and-weather';

type VoiceBridge = {
  beginResponse: () => void;
  streamSpeech: (text: string, done?: boolean) => void;
  speak: (text: string) => void;
  resumeAfterResponse: () => void;
};

export type ChatSubmitOptions = {
  question: string;
  inputSource: 'text' | 'voice';
  mode: string;
  effort: Effort;
  imageQuality: 'FAST' | 'BALANCED' | 'HIGH' | 'MAX';
  profile: UserProfile;
  activeChat?: Chat;
  chats: Chat[];
  documents: LocalDocument[];
  attachments: LocalAttachment[];
  webSearch: boolean;
  weather: Weather | null;
  agentOnline: boolean;
  agentToken: string;
  loadingRef: MutableRefObject<boolean>;
  requestController: MutableRefObject<AbortController | null>;
  voice: VoiceBridge;
  setActivityLabel: (label: string) => void;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
  setPrompt: (prompt: string) => void;
  setActiveChatId: (id: string) => void;
  setAttachments: Dispatch<SetStateAction<LocalAttachment[]>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  persistChats: (chats: Chat[]) => void;
};

async function waitForMedia(
  client: NexoClient,
  jobId: string,
  onActivity: (label: string) => void,
) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const job = await client.getMediaJob(jobId);
    onActivity(
      job.status === 'queued'
        ? 'Na fila de mídia local…'
        : job.status === 'running'
          ? 'Gerando no seu computador…'
          : 'Finalizando artefato…',
    );
    if (job.status === 'completed' && job.artifactId) {
      const artifact = await client.getArtifact(job.artifactId);
      if (!artifact)
        throw new Error('O artefato terminou, mas não foi encontrado.');
      return artifact;
    }
    if (job.status === 'failed' || job.status === 'cancelled')
      throw new Error(job.error || `Geração ${job.status}.`);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }
  throw new Error(
    'A geração ultrapassou 10 minutos. O job permanece salvo no Nexo Core.',
  );
}

export async function submitChat(options: ChatSubmitOptions) {
  const question = options.question.trim();
  if (!question || options.loadingRef.current) return;
  const requestStarted = performance.now();
  const requestLooksLikeImage =
    options.mode === 'Imagens' ||
    isImageCreationRequest(question, options.activeChat?.messages ?? []);
  options.setActivityLabel(
    requestLooksLikeImage
      ? 'Criando a imagem localmente…'
      : options.effort === 'Extra alto'
        ? 'Analisando com esforço extra alto…'
        : 'Preparando a resposta…',
  );
  options.loadingRef.current = true;
  options.setLoading(true);
  options.setNotice('');
  options.setPrompt('');
  options.requestController.current?.abort();
  options.requestController.current = new AbortController();

  const baseChat = options.activeChat ?? {
    id: crypto.randomUUID(),
    title: question.slice(0, 42),
    messages: [],
    updatedAt: Date.now(),
  };
  const requestAttachments = options.attachments;
  const userMessage: ChatMessage = {
    role: 'user',
    content: question,
    kind: 'text',
    input: options.inputSource,
    attachments: requestAttachments.map(({ type, name, mimeType }) => ({
      type,
      name,
      mimeType,
    })),
  };
  const pendingChat = {
    ...baseChat,
    title: baseChat.messages.length ? baseChat.title : question.slice(0, 42),
    messages: [...baseChat.messages, userMessage],
    updatedAt: Date.now(),
  };
  options.persistChats([
    pendingChat,
    ...options.chats.filter((chat) => chat.id !== baseChat.id),
  ]);
  options.setActiveChatId(baseChat.id);

  try {
    if (!options.agentOnline || !options.agentToken)
      throw new Error('O Nexo Runtime está offline. Inicie o Nexo novamente.');
    const effectiveMode =
      options.mode === 'Imagens' ||
      isImageCreationRequest(question, baseChat.messages)
        ? 'Imagens'
        : options.mode;
    const displayStreaming = !['Imagens', 'Planilhas'].includes(effectiveMode);
    let responseText = '';
    let firstToken: number | undefined;
    let modelLabel = 'Nexo Runtime V4';
    options.voice.beginResponse();
    const immediate = await new NexoClient(options.agentToken).streamChat(
      {
        question,
        sessionId: baseChat.id,
        mode: effectiveMode,
        effort: options.effort,
        profile: options.profile,
        history: baseChat.messages,
        documents: options.documents,
        attachments: requestAttachments,
        webSearch: options.webSearch,
        weather: options.weather
          ? {
              ...options.weather,
              description: weatherDescription(options.weather.code),
            }
          : null,
        imageQuality: options.imageQuality,
      },
      (event) => {
        if (event.type === 'meta') {
          modelLabel = event.model;
          options.setActivityLabel(
            event.route === 'fast'
              ? 'Respondendo pelo caminho rápido…'
              : 'Analisando com contexto progressivo…',
          );
        } else if (event.type === 'token') {
          if (firstToken === undefined)
            firstToken = performance.now() - requestStarted;
          responseText += event.content;
          options.voice.streamSpeech(responseText);
          if (displayStreaming) {
            const visible = responseText;
            options.setChats((current) =>
              current.map((chat) =>
                chat.id === baseChat.id
                  ? {
                      ...pendingChat,
                      messages: [
                        ...pendingChat.messages,
                        {
                          role: 'assistant',
                          content: visible,
                          kind: 'text',
                          firstTokenMs: firstToken,
                          effort: options.effort,
                          model: modelLabel,
                        },
                      ],
                      updatedAt: Date.now(),
                    }
                  : chat,
              ),
            );
          }
        } else if (event.type === 'done') {
          responseText = event.content;
          modelLabel = event.model;
          options.voice.streamSpeech(responseText, true);
        }
      },
      options.requestController.current.signal,
    );

    const elapsedMs = performance.now() - requestStarted;
    let assistantMessage: ChatMessage;
    if (immediate?.kind === 'task') {
      assistantMessage = {
        role: 'assistant',
        content: JSON.stringify(immediate.task),
        kind: 'task',
        elapsedMs,
        firstTokenMs: elapsedMs,
        effort: options.effort,
        model: 'Nexo Agent',
      };
      options.setNotice(
        immediate.task.status === 'awaiting_approval'
          ? 'O agente aguarda sua aprovação.'
          : `Tarefa: ${taskStatusLabel(immediate.task.status)}.`,
      );
    } else if (immediate?.kind === 'unavailable') {
      assistantMessage = {
        role: 'assistant',
        content: immediate.content,
        kind: 'unavailable',
        elapsedMs,
        firstTokenMs: elapsedMs,
        effort: options.effort,
        model: immediate.model,
      };
    } else if (immediate?.kind === 'media') {
      const artifact: MediaArtifact = await waitForMedia(
        new NexoClient(options.agentToken),
        immediate.job.id,
        options.setActivityLabel,
      );
      assistantMessage = {
        role: 'assistant',
        content: `Artefato criado por ${artifact.provider}.`,
        kind: artifact.type as MessageKind,
        artifact,
        elapsedMs: performance.now() - requestStarted,
        firstTokenMs: performance.now() - requestStarted,
        effort: options.effort,
        model: artifact.model || immediate.model,
        sourcePrompt: question,
      };
    } else if (immediate?.kind === 'instant') {
      assistantMessage = {
        role: 'assistant',
        content: immediate.content,
        kind: 'text',
        elapsedMs,
        firstTokenMs: elapsedMs,
        effort: options.effort,
        model: 'Nexo Instant',
      };
      options.voice.speak(immediate.content);
    } else {
      responseText = responseText.trim();
      if (!responseText)
        throw new Error('O Runtime V4 não produziu uma resposta.');
      assistantMessage = {
        role: 'assistant',
        content: responseText,
        kind: effectiveMode === 'Planilhas' ? 'sheet' : 'text',
        elapsedMs,
        firstTokenMs: firstToken ?? elapsedMs,
        effort: options.effort,
        model: modelLabel,
      };
    }
    const completeChat = {
      ...pendingChat,
      messages: [...pendingChat.messages, assistantMessage],
      updatedAt: Date.now(),
    };
    options.persistChats([
      completeChat,
      ...options.chats.filter((chat) => chat.id !== baseChat.id),
    ]);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      options.setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui acessar o modelo local. Confirme se o Ollama está aberto e tente novamente.',
      );
  } finally {
    options.loadingRef.current = false;
    options.setLoading(false);
    options.setAttachments([]);
    options.requestController.current = null;
    options.voice.resumeAfterResponse();
  }
}
