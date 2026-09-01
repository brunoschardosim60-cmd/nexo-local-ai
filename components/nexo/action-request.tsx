'use client';

import {
  FilePenLine,
  FolderPlus,
  Library,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { actionButton, actionTitle } from '@/lib/nexo/page-helpers';
import type { NexoAction } from '@/lib/nexo/types';

type ActionRequestProps = {
  action: NexoAction;
  index: number;
  agentOnline: boolean;
  agentToken: string;
  actionLoading: boolean;
  onRun: (index: number, action: NexoAction) => void;
};

export function ActionRequest(props: ActionRequestProps) {
  const readOnly = ['read_file', 'list_files'].includes(props.action.type);
  const icon =
    props.action.type === 'write_file' ? (
      <FilePenLine />
    ) : props.action.type === 'create_folder' ? (
      <FolderPlus />
    ) : props.action.type === 'create_project' ? (
      <Server />
    ) : (
      <Library />
    );
  return (
    <div className="min-w-[260px] space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <ShieldCheck className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {readOnly ? 'Acesso local solicitado' : 'Ação protegida'}
        </span>
      </div>
      <div>
        <p className="font-medium">{actionTitle(props.action)}</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {props.action.path}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {props.action.reason}
        </p>
      </div>
      {props.action.content && (
        <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-2 font-mono text-[10px]">
          {props.action.content.slice(0, 1800)}
        </pre>
      )}
      {props.action.output && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono text-[10px]">
          {props.action.output}
        </pre>
      )}
      {props.action.status === 'pending' ? (
        <Button
          size="sm"
          disabled={
            !props.agentOnline || !props.agentToken || props.actionLoading
          }
          onClick={() => props.onRun(props.index, props.action)}
        >
          {icon}
          {props.agentOnline
            ? props.actionLoading
              ? 'Executando…'
              : actionButton(props.action)
            : 'Agente local offline'}
        </Button>
      ) : (
        <Badge
          variant={
            props.action.status === 'completed' ? 'secondary' : 'destructive'
          }
        >
          {props.action.result}
        </Badge>
      )}
    </div>
  );
}
