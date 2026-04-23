import type {
  QuestionAnswerMap,
  ResumePasteInput,
  StartTaskInput,
  UpdateQuestionCardInput,
  UpdateExplorerConfigInput,
} from "@jobseeker/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createProject as createProjectRequest,
  deleteProjectJob,
  deleteProjectResume,
  pasteProjectResume,
  startProjectTask,
  submitQuestionAnswers,
  switchActiveResume as switchActiveResumeRequest,
  updateDocument as updateDocumentRequest,
  updateQuestionCard as updateQuestionCardRequest,
  updateProjectExplorer,
  uploadProjectResume,
} from "@/lib/api";
import { projectsKeys } from "@/lib/query-keys";

function useProjectMutation<TData, TVariables extends Record<string, unknown>>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidateKeys?: string[][];
  onSuccess?: (data: TData, variables: TVariables) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async (data, variables) => {
      if (options.invalidateKeys) {
        await Promise.all(
          options.invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        );
      }
      await options.onSuccess?.(data, variables);
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProjectRequest,
    onSuccess: (project) => {
      queryClient.setQueryData(projectsKeys.detail(project.project.id), project);
      queryClient.setQueryData<import("@jobseeker/contracts").ProjectSnapshot[]>(
        projectsKeys.list(),
        (current) => {
          if (!current) return [project];
          const index = current.findIndex((p) => p.project.id === project.project.id);
          if (index === -1) return [project, ...current];
          return current.map((p) => (p.project.id === project.project.id ? project : p));
        },
      );
    },
  });
}

export function useUploadResume() {
  return useProjectMutation<void, { projectId: string; file: File }>({
    mutationFn: ({ projectId, file }) => uploadProjectResume(projectId, file),
    invalidateKeys: [],
    onSuccess: async () => {
      // Handled by event stream
    },
  });
}

export function usePasteResume() {
  return useProjectMutation<void, { projectId: string; input: ResumePasteInput }>({
    mutationFn: ({ projectId, input }) => pasteProjectResume(projectId, input),
    invalidateKeys: [],
  });
}

export function useSwitchActiveResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, documentId }: { projectId: string; documentId: string }) =>
      switchActiveResumeRequest(projectId, documentId),
    onSuccess: (project) => {
      queryClient.setQueryData(projectsKeys.detail(project.project.id), project);
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, documentId }: { projectId: string; documentId: string }) =>
      deleteProjectResume(projectId, documentId),
    onSuccess: (project) => {
      queryClient.setQueryData(projectsKeys.detail(project.project.id), project);
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, jobId }: { projectId: string; jobId: string }) =>
      deleteProjectJob(projectId, jobId),
    onSuccess: (project, { projectId }) => {
      queryClient.setQueryData(projectsKeys.detail(projectId), project);
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      documentId,
      content,
    }: {
      projectId: string;
      documentId: string;
      content: string;
    }) => updateDocumentRequest(projectId, documentId, { content }),
    onSuccess: (_doc, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
    },
  });
}

export function useStartTask() {
  return useMutation({
    mutationFn: (input: StartTaskInput) => startProjectTask(input),
  });
}

export function useSubmitAnswers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, answers }: { projectId: string; answers: QuestionAnswerMap }) =>
      submitQuestionAnswers(projectId, answers),
    onSuccess: (project) => {
      queryClient.setQueryData(projectsKeys.detail(project.project.id), project);
    },
  });
}

export function useSaveExplorer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: UpdateExplorerConfigInput }) =>
      updateProjectExplorer(projectId, input),
    onSuccess: (explorer, { projectId }) => {
      queryClient.setQueryData<import("@jobseeker/contracts").ProjectSnapshot>(
        projectsKeys.detail(projectId),
        (current) => (current ? { ...current, explorer } : current),
      );
    },
  });
}

export function useUpdateQuestionCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateQuestionCardInput) => updateQuestionCardRequest(input),
    onSuccess: (project) => {
      queryClient.setQueryData(projectsKeys.detail(project.project.id), project);
    },
  });
}
