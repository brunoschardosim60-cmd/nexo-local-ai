'use client';
/* oxlint-disable react/react-compiler */

import type { ChangeEvent, RefObject } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Globe2,
  Plus,
  Search,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { NexoLivingEyeMini } from '@/components/nexo/nexo-living-eye';
import { PresenceControls } from '@/components/nexo/presence-controls';
import { ComposerAttachments } from '@/components/nexo/composer-attachments';
import type { Effort, LocalAttachment, LocalDocument } from '@/lib/nexo/types';

const EFFORTS: Effort[] = ['Baixo', 'Médio', 'Alto', 'Extra alto'];
const MODES = [
  'Geral',
  'Programar',
  'Documentos',
  'Planilhas',
  'Imagens',
  'Vídeos',
  'Agente',
];

type ComposerProps = {
  documents: LocalDocument[];
  attachments: LocalAttachment[];
  prompt: string;
  mode: string;
  effort: Effort;
  imageQuality: 'FAST' | 'BALANCED' | 'HIGH' | 'MAX';
  loading: boolean;
  notice: string;
  webSearch: boolean;
  agentToken: string;
  voiceModeOpen: boolean;
  voiceOutput: boolean;
  voiceEyeState: Parameters<typeof NexoLivingEyeMini>[0]['state'];
  fileInput: RefObject<HTMLInputElement | null>;
  onDocumentsChange: (documents: LocalDocument[]) => void;
  onAttachmentsChange: (attachments: LocalAttachment[]) => void;
  onPromptChange: (prompt: string) => void;
  onModeChange: (mode: string) => void;
  onEffortChange: (effort: Effort) => void;
  onImageQualityChange: (quality: 'FAST' | 'BALANCED' | 'HIGH' | 'MAX') => void;
  onWebSearchChange: (enabled: boolean) => void;
  onNotice: (notice: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenVoice: () => void;
  onVoiceOutputChange: (enabled: boolean) => void;
  onGoogleSearch: () => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function Composer(props: ComposerProps) {
  const placeholder =
    props.mode === 'Planilhas'
      ? 'Descreva a planilha que precisa…'
      : props.mode === 'Imagens'
        ? 'Descreva a imagem que quer gerar…'
        : props.mode === 'Vídeos'
          ? 'Descreva um vídeo curto…'
          : props.mode === 'Programar'
            ? 'Descreva o código avançado…'
            : props.mode === 'Agente'
              ? 'Descreva a alteração no projeto…'
              : 'Pode falar do seu jeito…';

  return (
    <div className="nexo-composer-wrap shrink-0 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-[52rem]">
        <ComposerAttachments
          documents={props.documents}
          attachments={props.attachments}
          onDocumentsChange={props.onDocumentsChange}
          onAttachmentsChange={props.onAttachmentsChange}
        />
        <div className="composer rounded-[22px] border border-border/90 p-2 focus-within:border-primary/35">
          <Textarea
            value={props.prompt}
            onChange={(event) => props.onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                props.onSubmit();
              }
            }}
            placeholder={placeholder}
            className="min-h-14 max-h-32 resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-0.5">
              <input
                ref={props.fileInput}
                className="hidden"
                type="file"
                multiple
                accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,image/*,audio/*,video/*"
                onChange={props.onFileChange}
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Adicionar arquivo"
                title="Adicionar arquivo"
                onClick={() => props.fileInput.current?.click()}
              >
                <Plus />
              </Button>
              <PresenceControls
                token={props.agentToken}
                onCapture={(attachment) =>
                  props.onAttachmentsChange(
                    [...props.attachments, attachment].slice(-4),
                  )
                }
                onNotice={props.onNotice}
              />
              <Button
                size="icon-sm"
                variant={props.voiceModeOpen ? 'secondary' : 'ghost'}
                aria-label="Abrir conversa por voz"
                title="Conversa por voz"
                onClick={props.onOpenVoice}
              >
                <NexoLivingEyeMini state={props.voiceEyeState} />
              </Button>
              <Button
                size="icon-sm"
                variant={props.voiceOutput ? 'secondary' : 'ghost'}
                aria-label="Ler respostas em voz alta"
                title="Voz do Nexo"
                onClick={() => props.onVoiceOutputChange(!props.voiceOutput)}
              >
                {props.voiceOutput ? <Volume2 /> : <VolumeX />}
              </Button>
              <Button
                size="sm"
                variant={props.webSearch ? 'secondary' : 'ghost'}
                className={
                  props.webSearch ? 'text-primary' : 'text-muted-foreground'
                }
                onClick={() => props.onWebSearchChange(!props.webSearch)}
              >
                <Search />
                <span className="hidden sm:inline">
                  {props.webSearch ? 'Pesquisa ligada' : 'Pesquisar'}
                </span>
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Pesquisar no Google"
                title="Abrir pesquisa no Google"
                onClick={props.onGoogleSearch}
              >
                <Globe2 />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <details className="group relative">
                <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  {props.mode === 'Geral' ? 'Auto' : props.mode}
                  <ChevronDown className="size-3 transition group-open:rotate-180" />
                </summary>
                <div className="absolute bottom-10 right-0 z-30 w-56 rounded-2xl border border-border bg-popover p-2 shadow-2xl">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Comportamento
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {MODES.map((item) => (
                      <Button
                        key={item}
                        size="sm"
                        variant={props.mode === item ? 'secondary' : 'ghost'}
                        className="justify-start text-xs"
                        onClick={() => props.onModeChange(item)}
                      >
                        {item === 'Geral' ? 'Auto' : item}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Esforço
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {EFFORTS.map((item) => (
                      <Button
                        key={item}
                        size="sm"
                        variant={props.effort === item ? 'secondary' : 'ghost'}
                        className="justify-start text-xs"
                        onClick={() => props.onEffortChange(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                  {props.mode === 'Imagens' && (
                    <NativeSelect
                      size="sm"
                      aria-label="Qualidade da imagem"
                      className="mt-2 w-full"
                      value={props.imageQuality}
                      onChange={(event) =>
                        props.onImageQualityChange(
                          event.target.value as ComposerProps['imageQuality'],
                        )
                      }
                    >
                      {['FAST', 'BALANCED', 'HIGH', 'MAX'].map((item) => (
                        <NativeSelectOption key={item} value={item}>
                          {item}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              </details>
              {props.loading ? (
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={props.onCancel}
                  aria-label="Parar resposta"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="rounded-xl"
                  onClick={props.onSubmit}
                  disabled={!props.prompt.trim()}
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </div>
        {props.notice && (
          <button
            className="mx-auto mt-2 flex max-w-[min(100%,38rem)] items-center gap-2 rounded-full border border-border/70 bg-popover/92 px-3.5 py-1.5 text-left text-xs text-popover-foreground shadow-lg shadow-black/5 transition hover:bg-accent"
            onClick={() => props.onNotice('')}
          >
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{props.notice}</span>
            <X className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
