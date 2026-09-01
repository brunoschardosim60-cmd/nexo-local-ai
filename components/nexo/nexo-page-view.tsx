'use client';
/* oxlint-disable react/react-compiler jsx-a11y/no-noninteractive-element-interactions */

import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';
import { NexoOrb } from '@/components/nexo/nexo-orb';
import { TopBar } from '@/components/nexo/top-bar';
import { MessageList } from '@/components/nexo/message-list';
import { Composer } from '@/components/nexo/composer';
import { ContextPanel } from '@/components/nexo/context-panel';
import { NexoOverlays } from '@/components/nexo/nexo-overlays';
import { NexoSidebar } from '@/components/nexo/nexo-sidebar';
import type { useAgentActions } from '@/hooks/use-agent-actions';
import type { useAgentConnection } from '@/hooks/use-agent-connection';
import type { useChatSessions } from '@/hooks/use-chat-sessions';
import type { useClockAndWeather } from '@/hooks/use-clock-and-weather';
import type { useComposerState } from '@/hooks/use-composer-state';
import type { useFileAttachments } from '@/hooks/use-file-attachments';
import type { useInterfaceState } from '@/hooks/use-interface-state';
import type { useMemoryPanel } from '@/hooks/use-memory-panel';
import type { useVoiceMode } from '@/hooks/use-voice-mode';
import type { Effort, UserProfile } from '@/lib/nexo/types';

type NexoPageViewProps = {
  composer: ReturnType<typeof useComposerState>;
  ui: ReturnType<typeof useInterfaceState>;
  sessions: ReturnType<typeof useChatSessions>;
  connection: ReturnType<typeof useAgentConnection>;
  clock: ReturnType<typeof useClockAndWeather>;
  memory: ReturnType<typeof useMemoryPanel>;
  voice: ReturnType<typeof useVoiceMode>;
  files: ReturnType<typeof useFileAttachments>;
  actions: ReturnType<typeof useAgentActions>;
  profile: UserProfile;
  setProfile: Dispatch<SetStateAction<UserProfile>>;
  messagesEnd: RefObject<HTMLDivElement | null>;
  requestController: RefObject<AbortController | null>;
  loadingRef: RefObject<boolean>;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenMemory: () => Promise<void>;
  onChangeEffort: (effort: Effort) => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onCopy: (content: string) => Promise<void>;
  onGoogleSearch: () => void;
  onAsk: (question?: string, source?: 'text' | 'voice') => Promise<void> | void;
  onSaveProfile: () => void;
  onResetPersonality: () => Promise<void>;
};

export function NexoPageView(props: NexoPageViewProps) {
  const {
    mode,
    setMode,
    effort,
    imageQuality,
    setImageQuality,
    prompt,
    setPrompt,
    loading,
    activityLabel,
    notice,
    setNotice,
    webSearch,
    setWebSearch,
    dragActive,
    setDragActive,
  } = props.composer;
  const {
    mounted,
    setProfileOpen,
    setSecurityOpen,
    setPersonalOpen,
    setCommandOpen,
    setMobileOpen,
    setSelectedArtifact,
    theme,
    toggleTheme,
  } = props.ui;
  const {
    documents,
    setDocuments,
    attachments,
    setAttachments,
    activeChat,
    history,
  } = props.sessions;
  const { currentTime, weather, weatherStatus, useDeviceLocation } =
    props.clock;
  const {
    online: agentOnline,
    token: agentToken,
    health: agentHealth,
    actionLoading,
  } = props.connection;
  const {
    runAction,
    decideTaskPermission,
    refreshAgentTask,
    controlAgentTask,
  } = props.actions;
  const { fileInput, addDocuments, handleDrop, handlePaste } = props.files;
  const {
    listening,
    voiceOutput,
    voiceModeOpen,
    eyeState: voiceEyeState,
  } = props.voice.state;
  const { profile, setProfile, messagesEnd, requestController, loadingRef } =
    props;
  const voice = props.voice;
  const memory = props.memory;
  const openMemoryCenter = props.onOpenMemory;
  const changeEffort = props.onChangeEffort;
  const download = props.onDownload;
  const copyText = props.onCopy;
  const openGoogleSearch = props.onGoogleSearch;
  const askNexo = props.onAsk;
  const sidebar = (
    <NexoSidebar
      sessions={props.sessions}
      ui={props.ui}
      composer={props.composer}
      onCreateChat={props.onCreateChat}
      onDeleteChat={props.onDeleteChat}
      onOpenMemory={props.onOpenMemory}
    />
  );
  return (
    <main
      className="nexo-shell relative h-[100dvh] overflow-hidden text-foreground"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-3 z-[90] grid place-items-center rounded-3xl border-2 border-dashed border-primary/60 bg-background/88 backdrop-blur">
          <div className="text-center">
            <NexoOrb state="working" className="mx-auto size-14" />
            <p className="mt-4 font-medium">Solte para adicionar ao Nexo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Arquivos, imagens, áudio ou vídeo
            </p>
          </div>
        </div>
      )}
      <div className="grid h-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="nexo-sidebar hidden min-h-0 border-r border-border lg:block">
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <TopBar
            title={activeChat?.title ?? 'Nova conversa'}
            mounted={mounted}
            theme={theme}
            agentOnline={agentOnline}
            onOpenMenu={() => setMobileOpen(true)}
            onOpenPersonal={() => setPersonalOpen(true)}
            onOpenCommands={() => setCommandOpen(true)}
            onOpenSecurity={() => setSecurityOpen(true)}
            onToggleTheme={toggleTheme}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <MessageList
              history={history}
              loading={loading}
              listening={listening}
              profileName={profile.name}
              activityLabel={activityLabel}
              agentToken={agentToken}
              agentOnline={agentOnline}
              actionLoading={actionLoading}
              endRef={messagesEnd}
              onVariation={(imagePrompt) => {
                setMode('Imagens');
                setPrompt(`Crie uma variação de: ${imagePrompt}`);
              }}
              onDownload={download}
              onTaskPermission={(index, task, permission, decision) =>
                void decideTaskPermission(index, task, permission, decision)
              }
              onTaskControl={(index, taskId, action) =>
                void controlAgentTask(index, taskId, action)
              }
              onTaskRefresh={(index, taskId) =>
                void refreshAgentTask(index, taskId)
              }
              onRunAction={(index, action) => void runAction(index, action)}
              onOpenArtifact={setSelectedArtifact}
              onCopy={(content) => void copyText(content)}
            />

            <Composer
              documents={documents}
              attachments={attachments}
              prompt={prompt}
              mode={mode}
              effort={effort}
              imageQuality={imageQuality}
              loading={loading}
              notice={notice}
              webSearch={webSearch}
              agentToken={agentToken}
              voiceModeOpen={voiceModeOpen}
              voiceOutput={voiceOutput}
              voiceEyeState={voiceEyeState}
              fileInput={fileInput}
              onDocumentsChange={setDocuments}
              onAttachmentsChange={setAttachments}
              onPromptChange={setPrompt}
              onModeChange={setMode}
              onEffortChange={changeEffort}
              onImageQualityChange={setImageQuality}
              onWebSearchChange={setWebSearch}
              onNotice={setNotice}
              onFileChange={addDocuments}
              onOpenVoice={() => {
                voice.setOpen(true);
                voice.setOutput(true);
                window.setTimeout(() => voice.start(), 280);
              }}
              onVoiceOutputChange={voice.setOutput}
              onGoogleSearch={openGoogleSearch}
              onSubmit={() => void askNexo()}
              onCancel={() => requestController.current?.abort()}
            />
          </div>
        </section>

        <ContextPanel
          effort={effort}
          health={agentHealth}
          online={agentOnline}
          profile={profile}
          currentTime={currentTime}
          weather={weather}
          weatherStatus={weatherStatus}
          webSearch={webSearch}
          documents={documents}
          onOpenProfile={() => setProfileOpen(true)}
          onUseLocation={useDeviceLocation}
          onOpenSecurity={() => setSecurityOpen(true)}
          onOpenPersonal={() => setPersonalOpen(true)}
          onOpenMemory={() => void openMemoryCenter()}
        />
      </div>

      <NexoOverlays
        ui={props.ui}
        composer={props.composer}
        connection={props.connection}
        memory={memory}
        voice={voice}
        profile={profile}
        setProfile={setProfile}
        sidebar={sidebar}
        requestController={requestController}
        loadingRef={loadingRef}
        onSaveProfile={props.onSaveProfile}
        onResetPersonality={props.onResetPersonality}
      />
    </main>
  );
}
