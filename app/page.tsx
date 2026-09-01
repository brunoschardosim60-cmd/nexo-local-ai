'use client';
/* oxlint-disable react/react-compiler jsx-a11y/media-has-caption jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useRef } from 'react';
import { useAgentActions } from '@/hooks/use-agent-actions';
import { useAgentConnection } from '@/hooks/use-agent-connection';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { useClockAndWeather } from '@/hooks/use-clock-and-weather';
import { useComposerState } from '@/hooks/use-composer-state';
import { useFileAttachments } from '@/hooks/use-file-attachments';
import { useInterfaceState } from '@/hooks/use-interface-state';
import { useMemoryPanel } from '@/hooks/use-memory-panel';
import { useNexoTaskSync } from '@/hooks/use-nexo-task-sync';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useVoiceMode } from '@/hooks/use-voice-mode';
import { NexoPageView } from '@/components/nexo/nexo-page-view';
import { NexoClient } from '@/lib/nexo/client';
import { submitChat } from '@/lib/nexo/chat-submit';
import type { Chat, Effort, UserProfile } from '@/lib/nexo/types';

export default function Home() {
  const composer = useComposerState();
  const {
    mode,
    setMode,
    effort,
    setEffort,
    imageQuality,
    setImageQuality,
    prompt,
    setPrompt,
    loading,
    setLoading,
    activityLabel,
    setActivityLabel,
    notice,
    setNotice,
    webSearch,
    setWebSearch,
    dragActive,
    setDragActive,
  } = composer;
  const ui = useInterfaceState();
  const {
    mounted,
    profileOpen,
    setProfileOpen,
    securityOpen,
    setSecurityOpen,
    personalOpen,
    setPersonalOpen,
    capabilityOpen,
    setCapabilityOpen,
    commandOpen,
    setCommandOpen,
    mobileOpen,
    setMobileOpen,
    selectedArtifact,
    setSelectedArtifact,
    theme,
    toggleTheme,
  } = ui;
  const clock = useClockAndWeather();
  const { currentTime, weather, weatherStatus, loadByCity, useDeviceLocation } =
    clock;
  const userProfile = useUserProfile({
    loadByCity,
    setNotice,
    closePanel: () => setProfileOpen(false),
  });
  const { profile, setProfile } = userProfile;
  const sessions = useChatSessions(setNotice, (nextChats) =>
    syncAgentSession(nextChats, profile),
  );
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    documents,
    setDocuments,
    attachments,
    setAttachments,
    chatSearch,
    setChatSearch,
    activeChat,
    history,
    visibleChats,
    persistChats,
    mergeRemoteChats,
  } = sessions;
  const connection = useAgentConnection(({ chats: remoteChats, profile }) => {
    mergeRemoteChats(remoteChats);
    if (profile) setProfile((current) => ({ ...current, ...profile }));
  });
  const {
    online: agentOnline,
    token: agentToken,
    health: agentHealth,
    actionLoading,
    setActionLoading,
    setOnline: setAgentOnline,
  } = connection;
  const messagesEnd = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const memory = useMemoryPanel(agentToken, setNotice);
  const files = useFileAttachments({
    agentToken,
    documents,
    attachments,
    onDocumentsChange: setDocuments,
    onAttachmentsChange: setAttachments,
    onDragChange: setDragActive,
    onNotice: setNotice,
  });
  const { fileInput, addDocuments, handleDrop, handlePaste } = files;
  const actions = useAgentActions({
    activeChat,
    chats,
    agentToken,
    actionLoading,
    setActionLoading,
    setAgentOnline,
    setDocuments,
    persistChats,
    setNotice,
  });
  const {
    runAction,
    decideTaskPermission,
    refreshAgentTask,
    controlAgentTask,
  } = actions;

  const voice = useVoiceMode({
    agentOnline,
    agentToken,
    loading,
    mode,
    onPromptChange: setPrompt,
    onSubmit: (value) => void askNexo(value, 'voice'),
    onNotice: setNotice,
  });
  const {
    listening,
    voiceOutput,
    voiceModeOpen,
    voiceConversation,
    voiceInterim,
    voiceCaption,
    voiceOutputLevel,
    voicePreviewState,
    voicePreviewLevel,
    eyeState: voiceEyeState,
  } = voice.state;

  loadingRef.current = loading;

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, loading]);

  useNexoTaskSync({
    chats,
    setChats,
    token: agentToken,
    profile,
    setOnline: setAgentOnline,
  });

  function syncAgentSession(nextChats: Chat[], nextProfile: UserProfile) {
    if (!agentToken) return;
    void new NexoClient(agentToken)
      .saveSession(nextChats, nextProfile)
      .catch(() => undefined);
  }

  function createChat() {
    if (activeChat && activeChat.messages.length === 0) {
      setMobileOpen(false);
      return;
    }
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: 'Nova conversa',
      messages: [],
      updatedAt: Date.now(),
    };
    persistChats([chat, ...chats]);
    setActiveChatId(chat.id);
    setPrompt('');
    setNotice('');
    setMobileOpen(false);
  }

  function deleteChat(id: string) {
    const next = chats.filter((chat) => chat.id !== id);
    persistChats(next);
    if (activeChatId === id) setActiveChatId(next[0]?.id ?? '');
  }

  async function openMemoryCenter() {
    setMobileOpen(false);
    await memory.openPanel();
  }

  function changeEffort(next: Effort) {
    setEffort(next);
    localStorage.setItem('nexo-effort', next);
    void connection.warmRuntime(next);
  }

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setNotice('Resposta copiada.');
    } catch {
      setNotice('Não consegui copiar automaticamente.');
    }
  }

  function openGoogleSearch() {
    const query = prompt.trim();
    if (!query) {
      setNotice('Digite o que deseja pesquisar primeiro.');
      return;
    }
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  function askNexo(
    questionOverride?: string,
    inputSource: 'text' | 'voice' = 'text',
  ) {
    return submitChat({
      question: questionOverride ?? prompt,
      inputSource,
      mode,
      effort,
      imageQuality,
      profile,
      activeChat,
      chats,
      documents,
      attachments,
      webSearch,
      weather,
      agentOnline,
      agentToken,
      loadingRef,
      requestController,
      voice,
      setActivityLabel,
      setLoading,
      setNotice,
      setPrompt,
      setActiveChatId,
      setAttachments,
      setChats,
      persistChats,
    });
  }

  return (
    <NexoPageView
      composer={composer}
      ui={ui}
      sessions={sessions}
      connection={connection}
      clock={clock}
      memory={memory}
      voice={voice}
      files={files}
      actions={actions}
      profile={profile}
      setProfile={setProfile}
      messagesEnd={messagesEnd}
      requestController={requestController}
      loadingRef={loadingRef}
      onCreateChat={createChat}
      onDeleteChat={deleteChat}
      onOpenMemory={openMemoryCenter}
      onChangeEffort={changeEffort}
      onDownload={download}
      onCopy={copyText}
      onGoogleSearch={openGoogleSearch}
      onAsk={askNexo}
      onSaveProfile={() => userProfile.save(chats, syncAgentSession)}
      onResetPersonality={() =>
        userProfile.resetAdaptivePersonality(agentToken)
      }
    />
  );
}
