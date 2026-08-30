'use client';
/* oxlint-disable react/react-compiler react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Check,
  Clock3,
  Focus,
  FolderGit2,
  History,
  ListTodo,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { NexoClient } from '@/lib/nexo/client';
import type {
  PersonalDashboard,
  PersonalGoal,
  PersonalSearchResult,
  PersonalSettings,
  PersonalTask,
} from '@/lib/nexo/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Props = {
  open: boolean;
  commandOpen: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onCommandOpenChange: (open: boolean) => void;
  onPrompt: (prompt: string, mode?: string) => void;
  onNotice: (message: string) => void;
};

function dateLabel(value?: string | null) {
  if (!value) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function statusLabel(status: string) {
  return (
    (
      {
        IDEA: 'Ideia',
        ACTIVE: 'Ativo',
        PAUSED: 'Pausado',
        BLOCKED: 'Bloqueado',
        COMPLETED: 'Concluído',
        CANCELLED: 'Cancelado',
        TODO: 'A fazer',
        IN_PROGRESS: 'Em andamento',
        DONE: 'Concluída',
      } as Record<string, string>
    )[status] || status
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-xs leading-5 text-muted-foreground">
      {children}
    </div>
  );
}

export function PersonalWorkspace({
  open,
  commandOpen,
  token,
  onOpenChange,
  onCommandOpenChange,
  onPrompt,
  onNotice,
}: Props) {
  const [dashboard, setDashboard] = useState<PersonalDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<PersonalSearchResult[]>([]);
  const client = useMemo(() => new NexoClient(token), [token]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      setDashboard(await client.personalDashboard());
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui abrir o painel pessoal.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && token) void refresh();
  }, [open, token]);
  useEffect(() => {
    if (!commandOpen || searchQuery.trim().length < 2 || !token) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        void client
          .personalSearch(searchQuery)
          .then(setResults)
          .catch(() => setResults([])),
      220,
    );
    return () => window.clearTimeout(timer);
  }, [client, commandOpen, searchQuery, token]);

  async function createGoal() {
    if (goalTitle.trim().length < 2) return;
    await client.createPersonalGoal({
      title: goalTitle.trim(),
      status: 'ACTIVE',
      priority: 3,
    });
    setGoalTitle('');
    onNotice('Objetivo salvo localmente.');
    await refresh();
  }

  async function createTask() {
    if (taskTitle.trim().length < 2) return;
    await client.createPersonalTask({
      title: taskTitle.trim(),
      status: 'TODO',
      priority: 3,
      projectScope: 'global',
    });
    setTaskTitle('');
    onNotice('Tarefa salva localmente.');
    await refresh();
  }

  async function updateSettings(patch: Partial<PersonalSettings>) {
    if (!dashboard) return;
    const settings = await client.updatePersonalSettings(patch);
    setDashboard({ ...dashboard, settings });
  }

  async function updateGoal(
    goal: PersonalGoal,
    status: PersonalGoal['status'],
  ) {
    await client.updatePersonalGoal(goal.id, { status });
    await refresh();
  }

  async function updateTask(
    task: PersonalTask,
    status: PersonalTask['status'],
  ) {
    await client.updatePersonalTask(task.id, { status });
    await refresh();
  }

  function runCommand(prompt: string, mode?: string) {
    onCommandOpenChange(false);
    onOpenChange(false);
    onPrompt(prompt, mode);
  }

  async function clear(target: 'goals' | 'activity' | 'learning') {
    const labels = {
      goals: 'objetivos',
      activity: 'atividade e sugestões',
      learning: 'histórico de aprendizagem',
    };
    if (
      !window.confirm(
        `Apagar ${labels[target]} deste computador? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    await client.clearPersonal(target);
    onNotice(`${labels[target]} apagados.`);
    await refresh();
  }

  const settings = dashboard?.settings;
  const activeGoals =
    dashboard?.goals.filter(
      (goal) => !['COMPLETED', 'CANCELLED'].includes(goal.status),
    ) || [];
  const openTasks =
    dashboard?.tasks.filter(
      (task) => !['DONE', 'CANCELLED'].includes(task.status),
    ) || [];
  const urgentDeadlines = dashboard?.today.importantDeadlines || [];
  const todaySummary = urgentDeadlines.length
    ? {
        headline: `${urgentDeadlines.length === 1 ? 'Um prazo merece' : `${urgentDeadlines.length} prazos merecem`} sua atenção`,
        detail: urgentDeadlines[0]?.title
          ? `${urgentDeadlines[0].title} é o ponto mais sensível agora.`
          : 'O Nexo encontrou risco de prazo com base no seu estado local.',
      }
    : dashboard?.today.recommendedFocus
      ? {
          headline: 'Seu próximo passo está claro',
          detail: dashboard.today.recommendedFocus.reason,
        }
      : openTasks.length
        ? {
            headline: 'Nada urgente agora',
            detail: `Você tem ${openTasks.length} ${openTasks.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}, mas nenhuma foi marcada como foco imediato.`,
          }
        : {
            headline: 'Tudo tranquilo por aqui',
            detail: activeGoals.length
              ? 'Você tem objetivos ativos, mas nenhuma tarefa pendente neste momento.'
              : 'Você não tem tarefa ativa nem prazo em risco.',
          };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-[min(94vw,980px)] gap-0 overflow-hidden p-0 sm:!max-w-[980px]">
          <SheetHeader className="border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Brain className="size-5" />
              </div>
              <div>
                <SheetTitle>Inteligência pessoal</SheetTitle>
                <SheetDescription>
                  Seu estado operacional, salvo localmente e baseado apenas em
                  evidências.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {loading && !dashboard ? (
            <div className="grid flex-1 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          ) : dashboard ? (
            <Tabs defaultValue="today" className="min-h-0 flex-1 gap-0">
              <div className="nexo-tabs-scroll overflow-x-auto border-b border-border px-5">
                <TabsList variant="line" className="h-12">
                  <TabsTrigger value="today">
                    <Sparkles /> Hoje
                  </TabsTrigger>
                  <TabsTrigger value="projects">
                    <FolderGit2 /> Projetos
                  </TabsTrigger>
                  <TabsTrigger value="goals">
                    <Target /> Objetivos
                  </TabsTrigger>
                  <TabsTrigger value="learning">
                    <BookOpen /> Aprendizado
                  </TabsTrigger>
                  <TabsTrigger value="recent">
                    <History /> Recentes
                  </TabsTrigger>
                  <TabsTrigger value="controls">
                    <Focus /> Controle
                  </TabsTrigger>
                </TabsList>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-5 sm:p-6">
                  <TabsContent value="today" className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
                      <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-[.16em] text-primary">
                            Foco recomendado
                          </p>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void refresh()}
                            aria-label="Atualizar painel"
                          >
                            <RefreshCw
                              className={loading ? 'animate-spin' : ''}
                            />
                          </Button>
                        </div>
                        <h3 className="mt-4 text-xl font-semibold tracking-tight">
                          {dashboard.today.recommendedFocus?.title ||
                            'Nenhuma tarefa ativa'}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {dashboard.today.recommendedFocus?.reason ||
                            'Crie uma tarefa para o Nexo organizar prioridades com evidências.'}
                        </p>
                        {dashboard.today.recommendedFocus && (
                          <Button
                            className="mt-5 rounded-xl"
                            onClick={() =>
                              runCommand(
                                `Me ajude a executar esta tarefa: ${dashboard.today.recommendedFocus!.title}`,
                              )
                            }
                          >
                            <Play /> Começar agora
                          </Button>
                        )}
                      </div>
                      <div className="rounded-3xl border border-border bg-card/65 p-5">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <Sparkles className="size-4" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {todaySummary.headline}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {todaySummary.detail}
                            </p>
                          </div>
                        </div>
                        <div className="mt-5 space-y-3 border-t border-border/70 pt-4">
                          <div className="flex gap-3 text-xs">
                            <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <p>
                              {activeGoals.length
                                ? `${activeGoals.length} ${activeGoals.length === 1 ? 'objetivo segue ativo' : 'objetivos seguem ativos'}.`
                                : 'Nenhum objetivo ativo agora.'}
                            </p>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <ListTodo className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <p>
                              {openTasks.length
                                ? `${openTasks.length} ${openTasks.length === 1 ? 'tarefa ainda está aberta' : 'tarefas ainda estão abertas'}.`
                                : 'Nenhuma tarefa esperando por você.'}
                            </p>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <p>
                              {urgentDeadlines.length
                                ? `${urgentDeadlines.length} ${urgentDeadlines.length === 1 ? 'prazo está em risco' : 'prazos estão em risco'}.`
                                : 'Nenhum prazo em risco detectado.'}
                            </p>
                          </div>
                          {dashboard.suggestions.length > 0 && (
                            <div className="flex gap-3 text-xs">
                              <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <p>
                                O Nexo tem {dashboard.suggestions.length}{' '}
                                {dashboard.suggestions.length === 1
                                  ? 'sugestão contextual'
                                  : 'sugestões contextuais'}{' '}
                                para você.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border p-4">
                        <p className="mb-3 text-sm font-medium">
                          Próximas tarefas
                        </p>
                        {openTasks.length ? (
                          <div className="space-y-2">
                            {openTasks.slice(0, 5).map((task) => (
                              <div
                                key={task.id}
                                className="flex items-start gap-3 rounded-xl bg-muted/45 p-3"
                              >
                                <button
                                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border hover:border-primary"
                                  onClick={() => void updateTask(task, 'DONE')}
                                  aria-label={`Concluir ${task.title}`}
                                >
                                  <Check className="size-3" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium">
                                    {task.title}
                                  </p>
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {task.priorityEvaluation?.reason ||
                                      dateLabel(task.deadline)}
                                  </p>
                                </div>
                                <Badge variant="outline">
                                  {Math.round(
                                    (task.priorityEvaluation?.score || 0) * 100,
                                  )}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState>Não há tarefas abertas.</EmptyState>
                        )}
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="mb-3 text-sm font-medium">
                          O que merece atenção
                        </p>
                        {dashboard.suggestions.length ? (
                          <div className="space-y-2">
                            {dashboard.suggestions.slice(0, 4).map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-border bg-muted/25 p-3"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{item.policy}</Badge>
                                  <p className="text-xs font-medium">
                                    {item.title}
                                  </p>
                                  <Button
                                    className="ml-auto"
                                    size="icon-xs"
                                    variant="ghost"
                                    onClick={() =>
                                      void client
                                        .updateSuggestion(item.id, 'DISMISSED')
                                        .then(refresh)
                                    }
                                    aria-label="Dispensar"
                                  >
                                    <X />
                                  </Button>
                                </div>
                                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                                  {item.message}
                                </p>
                                <p className="mt-2 text-[10px] text-muted-foreground">
                                  Fonte: {item.source} · confiança{' '}
                                  {Math.round(item.confidence * 100)}%
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState>
                            Nenhuma sugestão com evidência suficiente.
                          </EmptyState>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="projects" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Projetos observados</h3>
                        <p className="text-xs text-muted-foreground">
                          Estado conhecido pelo Workspace V6; nenhum arquivo é
                          monitorado às escondidas.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => runCommand('Continua meu projeto')}
                      >
                        <Play /> Retomar
                      </Button>
                    </div>
                    {dashboard.projects.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {dashboard.projects.map((project) => (
                          <div
                            key={project.id}
                            className="rounded-2xl border border-border p-4"
                          >
                            <FolderGit2 className="size-5 text-primary" />
                            <p className="mt-4 font-medium">{project.name}</p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {project.root}
                            </p>
                            <div className="mt-4 flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  runCommand(
                                    `Continua o projeto ${project.name}`,
                                  )
                                }
                              >
                                Continuar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  runCommand(
                                    `Analise a saúde do projeto ${project.name}`,
                                    'Agente',
                                  )
                                }
                              >
                                Verificar saúde
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState>
                        Nenhum projeto registrado ainda. O Nexo só mostra
                        projetos que foram abertos ou adicionados de forma
                        explícita.
                      </EmptyState>
                    )}
                  </TabsContent>

                  <TabsContent value="goals" className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex gap-2">
                        <Input
                          value={goalTitle}
                          onChange={(event) => setGoalTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void createGoal();
                          }}
                          placeholder="Novo objetivo..."
                        />
                        <Button onClick={() => void createGoal()}>
                          <Plus /> Objetivo
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={taskTitle}
                          onChange={(event) => setTaskTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void createTask();
                          }}
                          placeholder="Nova tarefa..."
                        />
                        <Button
                          variant="secondary"
                          onClick={() => void createTask()}
                        >
                          <Plus /> Tarefa
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {dashboard.goals.length ? (
                        dashboard.goals.map((goal) => (
                          <div
                            key={goal.id}
                            className="rounded-2xl border border-border p-4"
                          >
                            <div className="flex flex-wrap items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{goal.title}</p>
                                  <Badge variant="outline">
                                    {statusLabel(goal.status)}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Prioridade {goal.priority} ·{' '}
                                  {dateLabel(goal.deadline)} ·{' '}
                                  {goal.milestones.length} marco(s)
                                </p>
                              </div>
                              <NativeSelect
                                value={goal.status}
                                onChange={(event) =>
                                  void updateGoal(
                                    goal,
                                    event.target
                                      .value as PersonalGoal['status'],
                                  )
                                }
                                className="h-8 w-36 text-xs"
                              >
                                {[
                                  'IDEA',
                                  'ACTIVE',
                                  'PAUSED',
                                  'BLOCKED',
                                  'COMPLETED',
                                  'CANCELLED',
                                ].map((status) => (
                                  <NativeSelectOption
                                    key={status}
                                    value={status}
                                  >
                                    {statusLabel(status)}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                              <Progress
                                className="flex-1"
                                value={goal.progress * 100}
                              />
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {Math.round(goal.progress * 100)}%
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState>
                          Crie um objetivo; ele poderá ser decomposto em marcos
                          editáveis pelo Nexo.
                        </EmptyState>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="learning" className="space-y-5">
                    <div className="rounded-3xl border border-primary/15 bg-primary/6 p-5">
                      <div className="flex items-center gap-3">
                        <BookOpen className="text-primary" />
                        <div>
                          <p className="font-medium">Plano adaptativo</p>
                          <p className="text-xs text-muted-foreground">
                            Domínio só muda com tentativas registradas — ler não
                            conta como dominar.
                          </p>
                        </div>
                        <Button
                          className="ml-auto"
                          variant="secondary"
                          onClick={() => runCommand('O que devo estudar hoje?')}
                        >
                          Estudar
                        </Button>
                      </div>
                    </div>
                    {dashboard.learning.due.length ? (
                      <div className="space-y-3">
                        {dashboard.learning.due.map((item) => (
                          <div
                            key={item.concept.id}
                            className="rounded-2xl border border-border p-4"
                          >
                            <div className="flex items-center gap-3">
                              <div className="grid size-10 place-items-center rounded-xl bg-muted">
                                <Brain className="size-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">
                                  {item.concept.name}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {item.reason}
                                </p>
                              </div>
                              <Badge>{item.recommendedActivity}</Badge>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                              <Progress
                                className="flex-1"
                                value={item.concept.mastery * 100}
                              />
                              <span className="text-xs text-muted-foreground">
                                domínio {Math.round(item.concept.mastery * 100)}
                                %
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState>
                        Nenhum conceito registrado. Peça ao Nexo para criar um
                        plano de estudo ou registrar o tema que você está
                        aprendendo.
                      </EmptyState>
                    )}
                  </TabsContent>

                  <TabsContent value="recent" className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">
                          Linha do tempo observável
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Eventos e resultados; nunca raciocínio interno.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void client.personalScan().then(refresh)}
                      >
                        <RefreshCw /> Verificar agora
                      </Button>
                    </div>
                    {dashboard.recent.length ? (
                      dashboard.recent.slice(0, 30).map((event) => (
                        <div
                          key={event.id}
                          className="flex gap-3 rounded-xl border border-border px-4 py-3"
                        >
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{event.type}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {event.source} ·{' '}
                              {new Date(event.createdAt).toLocaleString(
                                'pt-BR',
                              )}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState>
                        Ainda não há atividade observável.
                      </EmptyState>
                    )}
                  </TabsContent>

                  <TabsContent value="controls" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border p-4">
                        <p className="font-medium">Proatividade</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          OFF por padrão. Sugestão nunca significa autorização.
                        </p>
                        <NativeSelect
                          className="mt-4"
                          value={settings?.proactivityLevel}
                          onChange={(event) =>
                            void updateSettings({
                              proactivityLevel: event.target
                                .value as PersonalSettings['proactivityLevel'],
                            })
                          }
                        >
                          {['OFF', 'LOW', 'NORMAL', 'HIGH'].map((level) => (
                            <NativeSelectOption key={level} value={level}>
                              {level}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <p className="font-medium">Tutor</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Escolha quanto o Nexo ajuda antes de revelar a
                          solução.
                        </p>
                        <NativeSelect
                          className="mt-4"
                          value={settings?.tutorMode}
                          onChange={(event) =>
                            void updateSettings({
                              tutorMode: event.target
                                .value as PersonalSettings['tutorMode'],
                            })
                          }
                        >
                          {['GUIDE', 'TEACH', 'CHALLENGE', 'EXAM'].map(
                            (level) => (
                              <NativeSelectOption key={level} value={level}>
                                {level}
                              </NativeSelectOption>
                            ),
                          )}
                        </NativeSelect>
                      </div>
                    </div>
                    <div className="divide-y divide-border rounded-2xl border border-border">
                      {[
                        [
                          'Notificações locais',
                          'Exibe somente sugestões que passaram pelos filtros.',
                          'notificationsEnabled',
                        ],
                        [
                          'Modo foco',
                          'Bloqueia interrupções enquanto estiver ativo.',
                          'focusMode',
                        ],
                        [
                          'Brief diário',
                          'Permite salvar um snapshot quando o painel é aberto.',
                          'dailyBriefEnabled',
                        ],
                        [
                          'Histórico de aprendizado',
                          'Registra tentativas, erros e domínio localmente.',
                          'learningHistoryEnabled',
                        ],
                        [
                          'Repetição espaçada',
                          'Agenda a próxima revisão após uma tentativa.',
                          'spacedRepetitionEnabled',
                        ],
                        [
                          'Não entregar a resposta',
                          'Usa pistas progressivas em contexto de estudo.',
                          'dontSpoil',
                        ],
                      ].map(([title, description, key]) => (
                        <div key={key} className="flex items-center gap-4 p-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {description}
                            </p>
                          </div>
                          <Switch
                            aria-label={title}
                            checked={Boolean(
                              settings?.[key as keyof PersonalSettings],
                            )}
                            onCheckedChange={(checked) =>
                              void updateSettings({
                                [key]: checked,
                              } as Partial<PersonalSettings>)
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-destructive/20 p-4">
                      <p className="text-sm font-medium">Controles de dados</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Apague áreas específicas sem tocar nos chats ou na
                        memória V6.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void clear('activity')}
                        >
                          Limpar atividade
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void clear('learning')}
                        >
                          Limpar aprendizado
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void clear('goals')}
                        >
                          Limpar objetivos
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center text-sm text-muted-foreground">
              O Nexo Core precisa estar online para abrir este painel.
            </div>
          )}
        </SheetContent>
      </Sheet>

      <CommandDialog
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
        title="Comandos do Nexo"
        description="Pesquise seu estado local ou execute uma ação rápida."
        className="sm:max-w-xl"
      >
        <Command shouldFilter={results.length === 0}>
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Buscar ou executar um comando..."
          />
          <CommandList>
            <CommandEmpty>Nada encontrado localmente.</CommandEmpty>
            <CommandGroup heading="Ações rápidas">
              <CommandItem
                value="continuar projeto retomar"
                onSelect={() => runCommand('Continua meu projeto')}
              >
                <Play /> Continuar projeto<CommandShortcut>↵</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="estudar aprendizado hoje"
                onSelect={() => runCommand('O que devo estudar hoje?')}
              >
                <BookOpen /> Começar estudo
              </CommandItem>
              <CommandItem
                value="importante hoje brief"
                onSelect={() => runCommand('Tem alguma coisa importante?')}
              >
                <Bell /> Ver o que importa
              </CommandItem>
              <CommandItem
                value="testes rodar projeto"
                onSelect={() =>
                  runCommand(
                    'Rode os testes do projeto, corrija as falhas e valide o resultado.',
                    'Agente',
                  )
                }
              >
                <BriefcaseBusiness /> Rodar testes
              </CommandItem>
              <CommandItem
                value="painel objetivos tarefas"
                onSelect={() => {
                  onCommandOpenChange(false);
                  onOpenChange(true);
                }}
              >
                <Target /> Abrir inteligência pessoal
              </CommandItem>
            </CommandGroup>
            {results.length > 0 && (
              <CommandGroup heading="Busca local">
                {results.slice(0, 12).map((result) => (
                  <CommandItem
                    key={`${result.kind}:${result.id}`}
                    value={`${result.kind} ${result.title} ${result.summary}`}
                    onSelect={() =>
                      runCommand(
                        `Abra e continue a partir deste resultado local (${result.kind}): ${result.title}`,
                      )
                    }
                  >
                    <Search />
                    <div className="min-w-0">
                      <p className="truncate">{result.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {result.kind} · {result.summary}
                      </p>
                    </div>
                    <Badge className="ml-auto" variant="outline">
                      {Math.round(result.score * 100)}%
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
