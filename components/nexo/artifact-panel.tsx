'use client';
/* oxlint-disable jsx-a11y/media-has-caption */
import { useState } from 'react';
import Image from 'next/image';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  History,
  X,
} from 'lucide-react';
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
  const [view, setView] = useState<'preview' | 'source'>('preview');
  const [copied, setCopied] = useState(false);
  const url = message?.artifact
    ? new NexoClient(token).artifactUrl(message.artifact.id)
    : '';
  const codeMatch = message?.content.match(/```([\w-]+)?\n([\s\S]*?)```/);
  const language = codeMatch?.[1]?.toLowerCase() || 'texto';
  const code = codeMatch?.[2];
  const canPreview = Boolean(code && ['html', 'svg', 'xml'].includes(language));
  const effectiveView = canPreview ? view : 'source';
  const previewDocument =
    language === 'svg'
      ? `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#090d14">${code}</body></html>`
      : code || '';

  async function copyArtifact() {
    const content = code || message?.content || '';
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  }

  function downloadSource() {
    if (!code) return;
    const extension =
      language === 'javascript'
        ? 'js'
        : language === 'typescript'
          ? 'ts'
          : language === 'texto'
            ? 'txt'
            : language;
    const href = URL.createObjectURL(
      new Blob([code], { type: 'text/plain;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `nexo-artifact.${extension}`;
    anchor.click();
    URL.revokeObjectURL(href);
  }
  return (
    <Sheet
      open={Boolean(message)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        className="artifact-sheet !w-full gap-0 p-0 sm:!max-w-[min(760px,58vw)]"
      >
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
            {(code || message?.content) && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => void copyArtifact()}
                aria-label="Copiar artefato"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            )}
            {code && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={downloadSource}
                aria-label="Baixar código-fonte"
              >
                <Download />
              </Button>
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
        {(code || message?.artifact) && (
          <div className="flex min-h-12 items-center gap-1 border-b border-border px-4">
            {canPreview && (
              <Button
                size="sm"
                variant={effectiveView === 'preview' ? 'secondary' : 'ghost'}
                onClick={() => setView('preview')}
              >
                <Eye /> Preview
              </Button>
            )}
            {code && (
              <Button
                size="sm"
                variant={effectiveView === 'source' ? 'secondary' : 'ghost'}
                onClick={() => setView('source')}
              >
                <Code2 /> Código
              </Button>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <History className="size-3.5" /> Versão atual
            </span>
          </div>
        )}
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
          ) : canPreview && effectiveView === 'preview' ? (
            <iframe
              title="Preview seguro do artefato"
              sandbox="allow-scripts"
              srcDoc={previewDocument}
              className="h-[calc(100dvh-190px)] min-h-[32rem] w-full rounded-2xl border border-border bg-white shadow-xl"
            />
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
