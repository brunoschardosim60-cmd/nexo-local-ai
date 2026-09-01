'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UserProfile } from '@/lib/nexo/types';

type ProfilePanelProps = {
  open: boolean;
  profile: UserProfile;
  onOpenChange: (open: boolean) => void;
  onProfileChange: (profile: UserProfile) => void;
  onResetPersonality: () => void;
  onSave: () => void;
};

export function ProfilePanel(props: ProfilePanelProps) {
  const update = (field: keyof UserProfile, value: string) =>
    props.onProfileChange({ ...props.profile, [field]: value });
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seu perfil no Nexo</DialogTitle>
          <DialogDescription>
            Essas preferências ficam neste computador e orientam todas as
            respostas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="profile-name" className="text-xs font-medium">
              Seu nome
            </label>
            <Input
              id="profile-name"
              value={props.profile.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Como o Nexo deve chamar você?"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="profile-city" className="text-xs font-medium">
              Sua cidade
            </label>
            <Input
              id="profile-city"
              value={props.profile.city}
              onChange={(event) => update('city', event.target.value)}
              placeholder="Ex.: São Paulo"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="profile-style" className="text-xs font-medium">
              Estilo de resposta
            </label>
            <Input
              id="profile-style"
              value={props.profile.style}
              onChange={(event) => update('style', event.target.value)}
              placeholder="Direto, detalhado, descontraído…"
            />
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor="profile-instructions"
              className="text-xs font-medium"
            >
              Instruções pessoais
            </label>
            <Textarea
              id="profile-instructions"
              value={props.profile.instructions}
              onChange={(event) => update('instructions', event.target.value)}
              placeholder="Ex.: explique código para iniciantes e responda em português."
              className="min-h-24"
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium">Personalidade adaptativa</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            O Nexo aprende gradualmente seu nível de formalidade, humor,
            iniciativa e tamanho preferido de resposta. Você pode apagar somente
            essa adaptação quando quiser.
          </p>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" onClick={props.onResetPersonality}>
            Apagar adaptação
          </Button>
          <Button onClick={props.onSave}>Salvar perfil</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
