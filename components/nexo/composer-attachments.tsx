'use client';

import { FileText, Film, Image as ImageIcon, Mic, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LocalAttachment, LocalDocument } from '@/lib/nexo/types';

type ComposerAttachmentsProps = {
  documents: LocalDocument[];
  attachments: LocalAttachment[];
  onDocumentsChange: (documents: LocalDocument[]) => void;
  onAttachmentsChange: (attachments: LocalAttachment[]) => void;
};

export function ComposerAttachments(props: ComposerAttachmentsProps) {
  if (!props.documents.length && !props.attachments.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {props.documents.map((doc, index) => (
        <Badge
          key={`${doc.name}-${index}`}
          variant="secondary"
          className="h-7 gap-1.5 px-2.5"
        >
          <FileText /> {doc.name}
          <button
            aria-label={`Remover ${doc.name}`}
            onClick={() =>
              props.onDocumentsChange(
                props.documents.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {props.attachments.map((item, index) => (
        <Badge
          key={`${item.name}-${index}`}
          variant="secondary"
          className="h-7 gap-1.5 px-2.5"
        >
          {['image', 'screen', 'camera'].includes(item.type) ? (
            <ImageIcon />
          ) : item.type === 'video' ? (
            <Film />
          ) : (
            <Mic />
          )}
          {item.name}
          <button
            aria-label={`Remover ${item.name}`}
            onClick={() =>
              props.onAttachmentsChange(
                props.attachments.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
