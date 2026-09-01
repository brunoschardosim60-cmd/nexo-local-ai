'use client';
/* oxlint-disable react/react-compiler */

import type {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PersonalWorkspace } from '@/components/nexo/personal-workspace';
import { CapabilityCenter } from '@/components/nexo/capability-center';
import { ArtifactPanel } from '@/components/nexo/artifact-panel';
import { MemoryPanel } from '@/components/nexo/memory-panel';
import { ProfilePanel } from '@/components/nexo/profile-panel';
import { SecurityPanel } from '@/components/nexo/security-panel';
import { NexoVoicePresence } from '@/components/nexo/nexo-living-eye';
import type { useAgentConnection } from '@/hooks/use-agent-connection';
import type { useComposerState } from '@/hooks/use-composer-state';
import type { useInterfaceState } from '@/hooks/use-interface-state';
import type { useMemoryPanel } from '@/hooks/use-memory-panel';
import type { useVoiceMode } from '@/hooks/use-voice-mode';
import type { UserProfile } from '@/lib/nexo/types';

type NexoOverlaysProps = {
  ui: ReturnType<typeof useInterfaceState>;
  composer: ReturnType<typeof useComposerState>;
  connection: ReturnType<typeof useAgentConnection>;
  memory: ReturnType<typeof useMemoryPanel>;
  voice: ReturnType<typeof useVoiceMode>;
  profile: UserProfile;
  setProfile: Dispatch<SetStateAction<UserProfile>>;
  sidebar: ReactNode;
  requestController: RefObject<AbortController | null>;
  loadingRef: RefObject<boolean>;
  onSaveProfile: () => void;
  onResetPersonality: () => Promise<void>;
};

export function NexoOverlays(props: NexoOverlaysProps) {
  const {
    mobileOpen,
    setMobileOpen,
    personalOpen,
    setPersonalOpen,
    capabilityOpen,
    setCapabilityOpen,
    commandOpen,
    setCommandOpen,
    selectedArtifact,
    setSelectedArtifact,
    profileOpen,
    setProfileOpen,
    securityOpen,
    setSecurityOpen,
  } = props.ui;
  const { prompt, setPrompt, setMode, setLoading, setNotice } =
    props.composer;
  const {
    token: agentToken,
    online: agentOnline,
    health: agentHealth,
  } = props.connection;
  const { profile } = props;
  const setProfile = props.setProfile;
  const voice = props.voice;
  const {
    voiceModeOpen,
    voiceConversation,
    voiceInterim,
    voiceCaption,
    voiceOutputLevel,
    voicePreviewState,
    voicePreviewLevel,
    eyeState: voiceEyeState,
  } = voice.state;
  const sidebar = props.sidebar;
  const memory = props.memory;
  const requestController = props.requestController;
  const loadingRef = props.loadingRef;
  return (
    <>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[290px] border-border bg-sidebar p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do Nexo</SheetTitle>
            <SheetDescription>Chats e configurações</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <PersonalWorkspace
        open={personalOpen}
        commandOpen={commandOpen}
        token={agentToken}
        onOpenChange={setPersonalOpen}
        onCommandOpenChange={setCommandOpen}
        onPrompt={(value, nextMode) => {
          if (nextMode) setMode(nextMode);
          setPrompt(value);
          setNotice('Comando preparado. Revise e envie quando quiser.');
        }}
        onNotice={setNotice}
      />
      <CapabilityCenter
        open={capabilityOpen}
        token={agentToken}
        onOpenChange={setCapabilityOpen}
        onNotice={setNotice}
      />
      <ArtifactPanel
        message={selectedArtifact}
        token={agentToken}
        onClose={() => setSelectedArtifact(null)}
      />
      <NexoVoicePresence
        open={voiceModeOpen}
        onOpenChange={voice.setOpen}
        state={voiceEyeState}
        transcript={voiceInterim || prompt}
        caption={voiceCaption}
        outputLevel={
          voicePreviewState === 'speaking'
            ? (voicePreviewLevel ?? 0.58)
            : voiceOutputLevel
        }
        preview={voicePreviewState !== null}
        previewLevel={voicePreviewLevel ?? undefined}
        conversationEnabled={voiceConversation}
        onConversationChange={voice.setConversation}
        onSpeechEnd={voice.stopListening}
        onBargeIn={() => {
          requestController.current?.abort();
          loadingRef.current = false;
          setLoading(false);
          voice.bargeIn();
        }}
        onListen={() => {
          voice.setOutput(true);
          voice.start();
        }}
        onStop={voice.stop}
      />

      <ProfilePanel
        open={profileOpen}
        profile={profile}
        onOpenChange={setProfileOpen}
        onProfileChange={setProfile}
        onResetPersonality={() => void props.onResetPersonality()}
        onSave={props.onSaveProfile}
      />

      <MemoryPanel panel={memory} />

      <SecurityPanel
        open={securityOpen}
        health={agentHealth}
        online={agentOnline}
        onOpenChange={setSecurityOpen}
      />
    </>
  );
}
