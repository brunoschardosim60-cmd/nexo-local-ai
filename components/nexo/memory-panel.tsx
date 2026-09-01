'use client';

import { Check, FilePenLine, Library, Search, Trash2 } from 'lucide-react';
import type { MemoryPanelController } from '@/hooks/use-memory-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

export function MemoryPanel({ panel }: { panel: MemoryPanelController }) {
  const selected = panel.memories.find(
    (memory) => memory.id === panel.selectedId,
  );
  return (
    <Dialog open={panel.open} onOpenChange={panel.setOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border border-border bg-card sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="text-primary" /> Memória do Nexo
          </DialogTitle>
          <DialogDescription>
            Pesquise, confira e controle o que o Nexo mantém no SQLite deste
            computador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={panel.query}
            onChange={(event) => panel.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void panel.load();
            }}
            placeholder="Pesquisar pelo significado…"
          />
          <Button
            variant="outline"
            onClick={() => void panel.load()}
            disabled={panel.loading}
          >
            <Search /> Buscar
          </Button>
        </div>
        <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <ScrollArea className="h-[360px] rounded-2xl border border-border">
            <div className="space-y-1 p-2">
              {panel.memories.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  {panel.loading
                    ? 'Carregando…'
                    : 'Nenhuma memória encontrada.'}
                </p>
              ) : (
                panel.memories.map((item) => (
                  <button
                    key={item.id}
                    className={`w-full rounded-xl p-3 text-left transition ${item.id === panel.selectedId ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted'}`}
                    onClick={() => panel.select(item)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[9px]">
                        {item.type}
                      </Badge>
                      <span
                        className={`text-[9px] ${item.status === 'UNCERTAIN' ? 'text-amber-500' : 'text-emerald-500'}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5">
                      {item.summary || item.content}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.scope} · {Math.round(item.confidence * 100)}% ·{' '}
                      {item.source}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
          {selected ? (
            <div className="flex h-[360px] min-h-0 flex-col rounded-2xl border border-border p-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge>{selected.type}</Badge>
                <Badge variant="outline">{selected.privacy}</Badge>
                <Badge variant="outline">{selected.scope}</Badge>
              </div>
              <Textarea
                className="mt-3 min-h-0 flex-1 resize-none"
                value={panel.draft}
                onChange={(event) => panel.setDraft(event.target.value)}
              />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Observado em{' '}
                {new Date(selected.observedAt).toLocaleString('pt-BR')} ·
                confiança {Math.round(selected.confidence * 100)}%
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void panel.manage('update')}
                  disabled={panel.loading}
                >
                  <FilePenLine /> Salvar
                </Button>
                {selected.status === 'UNCERTAIN' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void panel.manage('confirm')}
                    disabled={panel.loading}
                  >
                    <Check /> Confirmar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void panel.manage('forget')}
                  disabled={panel.loading}
                >
                  Arquivar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void panel.manage('delete')}
                  disabled={panel.loading}
                >
                  <Trash2 /> Apagar
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-[360px] place-items-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
              Selecione uma memória.
            </div>
          )}
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">
          Memórias restritas nunca são enviadas a serviços externos. “Apagar”
          remove o registro; “Arquivar” o preserva fora da recuperação normal.
        </p>
      </DialogContent>
    </Dialog>
  );
}
