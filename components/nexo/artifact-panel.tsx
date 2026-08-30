'use client';
/* oxlint-disable jsx-a11y/media-has-caption */
import Image from 'next/image';
import { Download, FileCode2, X } from 'lucide-react';
import { NexoClient } from '@/lib/nexo/client';
import type { ChatMessage } from '@/lib/nexo/types';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
export function ArtifactPanel({
  message,
  token,
  onClose,
}: {
  message: ChatMessage | null;
  token: string;
  onClose: () => void;
}) {
  const url = message?.artifact
    ? new NexoClient(token).artifactUrl(message.artifact.id)
    : '';
  const code = message?.content.match(/```(?:[\w-]+)?\n([\s\S]*?)```/)?.[1];
  return (
    <Sheet
      open={Boolean(message)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="artifact-sheet w-full gap-0 p-0 sm:max-w-[min(760px,58vw)]">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileCode2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle>
                {(message?.artifact?.metadata?.filename as string) ||
                  message?.artifact?.type ||
                  'Artefato'}
              </SheetTitle>
              <SheetDescription>
                {message?.artifact?.provider ||
                  message?.model ||
                  'Criado pelo Nexo'}
              </SheetDescription>
            </div>
            {url && (
              <a
                href={url}
                download
                className="inline-flex size-9 items-center justify-center rounded-xl border border-border"
                aria-label="Baixar artefato"
              >
                <Download className="size-4" />
              </a>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Fechar artefato"
            >
              <X />
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-raised)] p-4 sm:p-6">
          {message?.artifact?.type === 'image' ? (
            <Image
              unoptimized
              src={url}
              width={1400}
              height={1400}
              alt={message.sourcePrompt || 'Imagem criada pelo Nexo'}
              className="mx-auto max-h-[calc(100dvh-130px)] w-auto rounded-2xl object-contain shadow-2xl"
            />
          ) : message?.artifact?.type === 'video' ? (
            <video
              src={url}
              controls
              className="mx-auto max-h-[calc(100dvh-130px)] w-full rounded-2xl bg-black"
            />
          ) : message?.artifact?.type === 'audio' ? (
            <audio src={url} controls className="mt-12 w-full" />
          ) : code ? (
            <pre className="nexo-code m-0 max-h-none overflow-auto p-5 text-xs leading-6">
              <code>{code}</code>
            </pre>
          ) : (
            <div className="nexo-rich-text mx-auto max-w-2xl whitespace-pre-wrap leading-7">
              {message?.content}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
