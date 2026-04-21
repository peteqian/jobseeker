import type {
  ExplorerConfigRecord,
  PendingQuestion,
  QuestionAnswerMap,
  ResumePasteInput,
  RuntimeEvent,
  StartTaskInput,
  ProjectSnapshot,
  UpdateQuestionCardInput,
  UpdateExplorerConfigInput,
} from "@jobseeker/contracts";
import * as React from "react";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  apiUrl,
  createProject as createProjectRequest,
  deleteProjectResume,
  getAllEvents,
  getProjectEvents,
  pasteProjectResume,
  startProjectTask,
  submitQuestionAnswers,
  switchActiveResume as switchActiveResumeRequest,
  updateQuestionCard as updateQuestionCardRequest,
  updateProjectExplorer,
  uploadProjectResume,
} from "@/lib/api";
import { projectsListQueryOptions } from "@/lib/query-options";
import { eventsKeys, jobseekerKeys, projectsKeys } from "@/lib/query-keys";

type ActionVariables = {
  action: string;
};

type JobseekerValue = {
  projects: ProjectSnapshot[];
  allEvents: RuntimeEvent[];
  busyAction: string | null;
  error: string | null;
  clearError: () => void;
  refreshProjects: (preferredProjectId?: string) => Promise<ProjectSnapshot[]>;
  refreshAllEvents: () => Promise<void>;
  createProject: (title: string) => Promise<ProjectSnapshot>;
  uploadResume: (projectId: string, file: File) => Promise<void>;
  pasteResume: (projectId: string, input: ResumePasteInput) => Promise<void>;
  switchActiveResume: (projectId: string, documentId: string) => Promise<void>;
  deleteResume: (projectId: string, documentId: string) => Promise<void>;
  startTask: (input: StartTaskInput, action: string) => Promise<void>;
  submitAnswers: (
    projectId: string,
    questions: PendingQuestion[],
    answers: QuestionAnswerMap,
  ) => Promise<void>;
  updateQuestionCard: (input: UpdateQuestionCardInput) => Promise<void>;
  saveExplorer: (
    projectId: string,
    input: UpdateExplorerConfigInput,
  ) => Promise<ExplorerConfigRecord>;
};

function allEventsQueryOptions() {
  return {
    queryKey: eventsKeys.all(),
    queryFn: getAllEvents,
    initialData: [] as RuntimeEvent[],
    enabled: false,
  };
}

function upsertProjectSnapshot(
  current: ProjectSnapshot[] | undefined,
  snapshot: ProjectSnapshot,
): ProjectSnapshot[] {
  if (!current) {
    return [snapshot];
  }

  const index = current.findIndex((project) => project.project.id === snapshot.project.id);
  if (index === -1) {
    return [snapshot, ...current];
  }

  return current.map((project) =>
    project.project.id === snapshot.project.id ? snapshot : project,
  );
}

function patchProjectExplorer(
  current: ProjectSnapshot | undefined,
  explorer: ExplorerConfigRecord,
): ProjectSnapshot | undefined {
  return current ? { ...current, explorer } : current;
}

function isQueryCancelledError(caughtError: unknown): boolean {
  return (
    caughtError instanceof Error &&
    (caughtError.name === "CancelledError" || caughtError.message === "CancelledError")
  );
}

function useJobseekerActionMutation<TData, TVariables extends ActionVariables>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["jobseeker"],
    mutationFn: options.mutationFn,
    onMutate: async () => {
      queryClient.setQueryData(jobseekerKeys.uiError(), null);
    },
    onError: (caughtError) => {
      queryClient.setQueryData(
        jobseekerKeys.uiError(),
        caughtError instanceof Error ? caughtError.message : "Something went wrong.",
      );
    },
    onSuccess: options.onSuccess,
  });
}

export function useJobseeker(): JobseekerValue {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({
    ...projectsListQueryOptions(),
    initialData: [] as ProjectSnapshot[],
  });
  const { data: allEvents = [] } = useQuery(allEventsQueryOptions());
  const { data: error = null } = useQuery({
    queryKey: jobseekerKeys.uiError(),
    queryFn: async () => null,
    initialData: null as string | null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const pendingActions = useMutationState({
    filters: { mutationKey: ["jobseeker"], status: "pending" },
    select: (mutation) => {
      const variables = mutation.state.variables as ActionVariables | undefined;
      return variables?.action ?? null;
    },
  }).filter((action): action is string => action !== null);
  const busyAction = pendingActions.at(-1) ?? null;

  const refreshProjects = React.useCallback(
    async (_preferredProjectId?: string) => {
      try {
        await queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
        if (_preferredProjectId) {
          await queryClient.invalidateQueries({
            queryKey: projectsKeys.detail(_preferredProjectId),
          });
        }
        return await queryClient.fetchQuery(projectsListQueryOptions());
      } catch (caughtError) {
        if (isQueryCancelledError(caughtError)) {
          return queryClient.getQueryData<ProjectSnapshot[]>(projectsKeys.list()) ?? [];
        }
        throw caughtError;
      }
    },
    [queryClient],
  );

  const refreshAllEvents = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: eventsKeys.all() });
    await queryClient.fetchQuery(allEventsQueryOptions());
  }, [queryClient]);

  const invalidateProject = React.useCallback(
    async (projectId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectsKeys.list() }),
      ]);
    },
    [queryClient],
  );

  const storeProjectSnapshot = React.useCallback(
    (snapshot: ProjectSnapshot) => {
      queryClient.setQueryData(projectsKeys.detail(snapshot.project.id), snapshot);
      queryClient.setQueryData<ProjectSnapshot[]>(projectsKeys.list(), (current) =>
        upsertProjectSnapshot(current, snapshot),
      );
    },
    [queryClient],
  );

  const createProjectMutation = useJobseekerActionMutation({
    mutationFn: async ({ title }: ActionVariables & { title: string }) =>
      createProjectRequest(title),
    onSuccess: async (project) => {
      storeProjectSnapshot(project);
    },
  });
  const uploadResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      file,
    }: ActionVariables & { projectId: string; file: File }) => {
      await uploadProjectResume(projectId, file);
    },
    onSuccess: async (_, { projectId }) => {
      await Promise.all([
        invalidateProject(projectId),
        queryClient.invalidateQueries({ queryKey: projectsKeys.resumeVersions(projectId) }),
      ]);
    },
  });
  const pasteResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      input,
    }: ActionVariables & { projectId: string; input: ResumePasteInput }) => {
      await pasteProjectResume(projectId, input);
    },
    onSuccess: async (_, { projectId }) => {
      await Promise.all([
        invalidateProject(projectId),
        queryClient.invalidateQueries({ queryKey: projectsKeys.resumeVersions(projectId) }),
      ]);
    },
  });
  const switchResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      documentId,
    }: ActionVariables & { projectId: string; documentId: string }) => {
      return switchActiveResumeRequest(projectId, documentId);
    },
    onSuccess: async (project, { projectId }) => {
      storeProjectSnapshot(project);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: projectsKeys.resumeVersions(projectId) }),
      ]);
    },
  });
  const deleteResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      documentId,
    }: ActionVariables & { projectId: string; documentId: string }) => {
      return deleteProjectResume(projectId, documentId);
    },
    onSuccess: async (project, { projectId }) => {
      storeProjectSnapshot(project);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: projectsKeys.resumeVersions(projectId) }),
      ]);
    },
  });
  const startTaskMutation = useJobseekerActionMutation({
    mutationFn: async ({ input }: ActionVariables & { input: StartTaskInput }) => {
      await startProjectTask(input);
    },
    onSuccess: async (_, { input }) => {
      await invalidateProject(input.projectId);
    },
  });
  const submitAnswersMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      questions,
      answers,
    }: ActionVariables & {
      projectId: string;
      questions: PendingQuestion[];
      answers: QuestionAnswerMap;
    }) => {
      const payload: QuestionAnswerMap = {};

      for (const question of questions) {
        for (const field of question.fields) {
          payload[field.id] = answers[field.id] ?? (field.type === "multiselect" ? [] : "");
        }
      }

      return submitQuestionAnswers(projectId, payload);
    },
    onSuccess: async (project) => {
      storeProjectSnapshot(project);
    },
  });
  const saveExplorerMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      input,
    }: ActionVariables & {
      projectId: string;
      input: UpdateExplorerConfigInput;
    }) => updateProjectExplorer(projectId, input),
    onSuccess: async (explorer, { projectId }) => {
      queryClient.setQueryData<ProjectSnapshot>(projectsKeys.detail(projectId), (current) =>
        patchProjectExplorer(current, explorer),
      );
      queryClient.setQueryData<ProjectSnapshot[]>(
        projectsKeys.list(),
        (current) =>
          current?.map((project) =>
            project.project.id === projectId ? patchProjectExplorer(project, explorer)! : project,
          ) ?? current,
      );
    },
  });
  const updateQuestionCardMutation = useJobseekerActionMutation({
    mutationFn: async ({ input }: ActionVariables & { input: UpdateQuestionCardInput }) => {
      return updateQuestionCardRequest(input);
    },
    onSuccess: async (project) => {
      storeProjectSnapshot(project);
    },
  });

  const clearError = React.useCallback(() => {
    queryClient.setQueryData(jobseekerKeys.uiError(), null);
  }, [queryClient]);

  const createProject = React.useCallback(
    (title: string) => createProjectMutation.mutateAsync({ action: "create-project", title }),
    [createProjectMutation],
  );
  const uploadResume = React.useCallback(
    async (projectId: string, file: File) => {
      await uploadResumeMutation.mutateAsync({ action: "upload-resume", projectId, file });
    },
    [uploadResumeMutation],
  );
  const pasteResume = React.useCallback(
    async (projectId: string, input: ResumePasteInput) => {
      await pasteResumeMutation.mutateAsync({ action: "paste-resume", projectId, input });
    },
    [pasteResumeMutation],
  );
  const switchActiveResume = React.useCallback(
    async (projectId: string, documentId: string) => {
      await switchResumeMutation.mutateAsync({ action: "switch-resume", projectId, documentId });
    },
    [switchResumeMutation],
  );
  const deleteResume = React.useCallback(
    async (projectId: string, documentId: string) => {
      await deleteResumeMutation.mutateAsync({ action: "delete-resume", projectId, documentId });
    },
    [deleteResumeMutation],
  );
  const startTask = React.useCallback(
    async (input: StartTaskInput, action: string) => {
      await startTaskMutation.mutateAsync({ action, input });
    },
    [startTaskMutation],
  );
  const submitAnswers = React.useCallback(
    async (projectId: string, questions: PendingQuestion[], answers: QuestionAnswerMap) => {
      await submitAnswersMutation.mutateAsync({
        action: "answer-questions",
        projectId,
        questions,
        answers,
      });
    },
    [submitAnswersMutation],
  );
  const saveExplorer = React.useCallback(
    (projectId: string, input: UpdateExplorerConfigInput) =>
      saveExplorerMutation.mutateAsync({ action: "save-explorer", projectId, input }),
    [saveExplorerMutation],
  );
  const updateQuestionCard = React.useCallback(
    async (input: UpdateQuestionCardInput) => {
      await updateQuestionCardMutation.mutateAsync({ action: "save-question-card", input });
    },
    [updateQuestionCardMutation],
  );
  return React.useMemo(
    () => ({
      projects,
      allEvents,
      busyAction,
      error,
      clearError,
      refreshProjects,
      refreshAllEvents,
      createProject,
      uploadResume,
      pasteResume,
      switchActiveResume,
      deleteResume,
      startTask,
      submitAnswers,
      updateQuestionCard,
      saveExplorer,
    }),
    [
      projects,
      allEvents,
      busyAction,
      error,
      clearError,
      refreshProjects,
      refreshAllEvents,
      createProject,
      uploadResume,
      pasteResume,
      switchActiveResume,
      deleteResume,
      startTask,
      submitAnswers,
      updateQuestionCard,
      saveExplorer,
    ],
  );
}

export function useProjectEvents(projectId: string | null) {
  const queryClient = useQueryClient();
  const { data: events = [] } = useQuery({
    queryKey: projectId ? eventsKeys.project(projectId) : ["events", "project", "none"],
    queryFn: () => (projectId ? getProjectEvents(projectId) : Promise.resolve([])),
    enabled: projectId !== null,
    initialData: [] as RuntimeEvent[],
  });

  React.useEffect(() => {
    if (!projectId) {
      return undefined;
    }

    const source = new EventSource(apiUrl(`/api/projects/${projectId}/events/stream`));

    const types: RuntimeEvent["type"][] = [
      "project.created",
      "resume.uploaded",
      "explorer.updated",
      "task.started",
      "task.progress",
      "task.waiting_for_user",
      "task.completed",
      "task.failed",
      "document.created",
      "jobs.updated",
    ];

    const onEvent = (rawEvent: MessageEvent<string>) => {
      const event = JSON.parse(rawEvent.data) as RuntimeEvent;
      queryClient.setQueryData<RuntimeEvent[]>(eventsKeys.project(projectId), (current = []) =>
        current.some((entry) => entry.id === event.id) ? current : [event, ...current],
      );
      queryClient.setQueryData<RuntimeEvent[]>(eventsKeys.all(), (current = []) =>
        current.some((entry) => entry.id === event.id) ? current : [event, ...current],
      );
      if (event.type !== "task.progress" && event.type !== "task.waiting_for_user") {
        void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
        void queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
      }
    };

    for (const type of types) {
      source.addEventListener(type, onEvent as EventListener);
    }

    source.onerror = () => source.close();

    return () => {
      source.close();
    };
  }, [queryClient, projectId]);

  return events;
}
