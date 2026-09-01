'use client';

import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { NexoClient } from '@/lib/nexo/client';
import type { LocalAttachment, LocalDocument } from '@/lib/nexo/types';

type FileAttachmentOptions = {
  agentToken: string;
  documents: LocalDocument[];
  attachments: LocalAttachment[];
  onDocumentsChange: (documents: LocalDocument[]) => void;
  onAttachmentsChange: (attachments: LocalAttachment[]) => void;
  onDragChange: (active: boolean) => void;
  onNotice: (notice: string) => void;
};

export function useFileAttachments(options: FileAttachmentOptions) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(files: File[]) {
    const accepted: LocalDocument[] = [];
    const media: LocalAttachment[] = [];
    for (const file of files) {
      if (/^(image|audio|video)\//.test(file.type)) {
        if (file.size > 8_000_000) {
          options.onNotice(`${file.name} é maior que 8 MB e não foi anexado.`);
          continue;
        }
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === 'string'
                ? resolve(reader.result)
                : reject(new Error('Formato inválido.'));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          media.push({
            type: file.type.split('/')[0] as LocalAttachment['type'],
            name: file.name,
            mimeType: file.type,
            dataUrl,
          });
        } catch {
          options.onNotice(`Não consegui ler ${file.name}.`);
        }
        continue;
      }
      if (file.size > 2_000_000) {
        options.onNotice(`${file.name} é maior que 2 MB e não foi adicionado.`);
        continue;
      }
      try {
        accepted.push({
          name: file.name,
          content: (await file.text()).slice(0, 40_000),
        });
      } catch {
        options.onNotice(`Não consegui ler ${file.name}.`);
      }
    }
    options.onDocumentsChange([...options.documents, ...accepted].slice(-8));
    options.onAttachmentsChange([...options.attachments, ...media].slice(-4));
    if (options.agentToken) {
      for (const document of accepted) {
        void new NexoClient(options.agentToken)
          .indexText(`upload:${document.name}`, document.content, {
            uploadedFromBrowser: true,
            trust: 'untrusted',
          })
          .catch(() => undefined);
      }
    }
  }

  async function addDocuments(event: ChangeEvent<HTMLInputElement>) {
    await addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    options.onDragChange(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length) {
      event.preventDefault();
      void addFiles(images);
    }
  }

  return { fileInput, addFiles, addDocuments, handleDrop, handlePaste };
}
