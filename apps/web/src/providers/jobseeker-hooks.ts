import type {
  ExplorerConfigRecord,
  PendingQuestion,
  QuestionAnswerMap,
  ResumePasteInput,
  ResumeVersion,
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
  getProjects,
  getProjectEvents,
  getResumeVersions,
  pasteProjectResume,
  startProjectTask,
  submitQuestionAnswers,
  switchActiveResume as switchActiveResumeRequest,
  updateQuestionCard as updateQuestionCardRequest,
  updateProjectExplorer,
  uploadProjectResume,
} from "@/lib/api";

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
  getResumeVersionsForProject: (projectId: string) => Promise<ResumeVersion[]>;
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

const projectsQueryKey = ["projects"] as const;
const allEventsQueryKey = ["events", "all"] as const;
const uiErrorQueryKey = ["jobseeker", "ui", "error"] as const;

function projectEventsQueryKey(projectId: string) {
  return ["events", "project", projectId] as const;
}

function resumeVersionsQueryKey(projectId: string) {
  return ["resume-versions", projectId] as const;
}

function projectsQueryOptions() {
  return {
    queryKey: projectsQueryKey,
    queryFn: getProjects,
    initialData: [] as ProjectSnapshot[],
  };
}

function allEventsQueryOptions() {
  return {
    queryKey: allEventsQueryKey,
    queryFn: getAllEvents,
    initialData: [] as RuntimeEvent[],
    enabled: false,
  };
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
      queryClient.setQueryData(uiErrorQueryKey, null);
    },
    onError: (caughtError) => {
      queryClient.setQueryData(
        uiErrorQueryKey,
        caughtError instanceof Error ? caughtError.message : "Something went wrong.",
      );
    },
    onSuccess: options.onSuccess,
  });
}

export function useJobseeker(): JobseekerValue {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  const { data: allEvents = [] } = useQuery(allEventsQueryOptions());
  const { data: error = null } = useQuery({
    queryKey: uiErrorQueryKey,
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
      void _preferredProjectId;
      try {
        await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
        return await queryClient.fetchQuery(projectsQueryOptions());
      } catch (caughtError) {
        if (isQueryCancelledError(caughtError)) {
          return queryClient.getQueryData<ProjectSnapshot[]>(projectsQueryKey) ?? [];
        }
        throw caughtError;
      }
    },
    [queryClient],
  );

  const refreshAllEvents = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: allEventsQueryKey });
    await queryClient.fetchQuery(allEventsQueryOptions());
  }, [queryClient]);

  const createProjectMutation = useJobseekerActionMutation({
    mutationFn: async ({ title }: ActionVariables & { title: string }) =>
      createProjectRequest(title),
    onSuccess: async () => {
      await refreshProjects();
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
        refreshProjects(projectId),
        queryClient.invalidateQueries({ queryKey: resumeVersionsQueryKey(projectId) }),
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
        refreshProjects(projectId),
        queryClient.invalidateQueries({ queryKey: resumeVersionsQueryKey(projectId) }),
      ]);
    },
  });
  const switchResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      documentId,
    }: ActionVariables & { projectId: string; documentId: string }) => {
      await switchActiveResumeRequest(projectId, documentId);
    },
    onSuccess: async (_, { projectId }) => {
      await Promise.all([
        refreshProjects(projectId),
        queryClient.invalidateQueries({ queryKey: resumeVersionsQueryKey(projectId) }),
      ]);
    },
  });
  const deleteResumeMutation = useJobseekerActionMutation({
    mutationFn: async ({
      projectId,
      documentId,
    }: ActionVariables & { projectId: string; documentId: string }) => {
      await deleteProjectResume(projectId, documentId);
    },
    onSuccess: async (_, { projectId }) => {
      await Promise.all([
        refreshProjects(projectId),
        queryClient.invalidateQueries({ queryKey: resumeVersionsQueryKey(projectId) }),
      ]);
    },
  });
  const startTaskMutation = useJobseekerActionMutation({
    mutationFn: async ({ input }: ActionVariables & { input: StartTaskInput }) => {
      await startProjectTask(input);
    },
    onSuccess: async (_, { input }) => {
      await refreshProjects(input.projectId);
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

      await submitQuestionAnswers(projectId, payload);
    },
    onSuccess: async (_, { projectId }) => {
      await refreshProjects(projectId);
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
    onSuccess: async (_, { projectId }) => {
      await refreshProjects(projectId);
    },
  });
  const updateQuestionCardMutation = useJobseekerActionMutation({
    mutationFn: async ({ input }: ActionVariables & { input: UpdateQuestionCardInput }) => {
      await updateQuestionCardRequest(input);
    },
    onSuccess: async (_, { input }) => {
      await refreshProjects(input.projectId);
    },
  });

  const clearError = React.useCallback(() => {
    queryClient.setQueryData(uiErrorQueryKey, null);
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
  const getResumeVersionsForProject = React.useCallback(
    (projectId: string) =>
      queryClient.fetchQuery({
        queryKey: resumeVersionsQueryKey(projectId),
        queryFn: () => getResumeVersions(projectId),
      }),
    [queryClient],
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
      getResumeVersionsForProject,
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
      getResumeVersionsForProject,
      startTask,
      submitAnswers,
      updateQuestionCard,
      saveExplorer,
    ],
  );
}

export function useProjectEvents(projectId: string | null) {
  const queryClient = useQueryClient();
  const { refreshProjects } = useJobseeker();
  const { data: events = [] } = useQuery({
    queryKey: projectId ? projectEventsQueryKey(projectId) : ["events", "project", "none"],
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
      queryClient.setQueryData<RuntimeEvent[]>(projectEventsQueryKey(projectId), (current = []) =>
        current.some((entry) => entry.id === event.id) ? current : [event, ...current],
      );
      queryClient.setQueryData<RuntimeEvent[]>(allEventsQueryKey, (current = []) =>
        current.some((entry) => entry.id === event.id) ? current : [event, ...current],
      );
      void refreshProjects(projectId).catch((caughtError) => {
        if (isQueryCancelledError(caughtError)) {
          return;
        }
        console.error("Failed to refresh projects after event", caughtError);
      });
    };

    for (const type of types) {
      source.addEventListener(type, onEvent as EventListener);
    }

    source.onerror = () => source.close();

    return () => {
      source.close();
    };
  }, [queryClient, refreshProjects, projectId]);

  return events;
}
