import { queryOptions } from "@tanstack/react-query";
import type { ChatScope } from "@jobseeker/contracts";

import {
  getClaimThreads,
  getCoachReview,
  getConnections,
  getProject,
  getProjectEvents,
  getProjects,
  getProviderSettings,
  getResumeVersions,
} from "@/lib/api";
import { coachKeys, eventsKeys, projectsKeys, settingsKeys } from "@/lib/query-keys";
import {
  getMessages,
  getThreadProjection,
  getTopic,
  listProviders,
  listThreads,
  listTopics,
} from "@/rpc/chat-client";
import { chatKeys } from "./query-keys";

export function projectsListQueryOptions() {
  return queryOptions({
    queryKey: projectsKeys.list(),
    queryFn: getProjects,
  });
}

export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });
}

export function resumeVersionsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectsKeys.resumeVersions(projectId),
    queryFn: () => getResumeVersions(projectId),
    staleTime: 60_000,
  });
}

export function connectionsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.connections(),
    queryFn: getConnections,
    staleTime: 15_000,
  });
}

export function providerSettingsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.providers(),
    queryFn: getProviderSettings,
    staleTime: 60_000,
  });
}

export function chatProvidersQueryOptions() {
  return queryOptions({
    queryKey: chatKeys.providers(),
    queryFn: listProviders,
    staleTime: 60_000,
  });
}

export function chatThreadsQueryOptions(projectId: string, scope: ChatScope) {
  return queryOptions({
    queryKey: chatKeys.threads(projectId, scope),
    queryFn: () => listThreads(projectId, scope),
  });
}

export function explorerThreadsQueryOptions(projectId: string) {
  return queryOptions({
    ...chatThreadsQueryOptions(projectId, "explorer"),
  });
}

export function projectEventsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: eventsKeys.project(projectId),
    queryFn: () => getProjectEvents(projectId),
  });
}

export function chatMessagesQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: chatKeys.messages(threadId),
    queryFn: () => getMessages(threadId),
  });
}

export function chatProjectionQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: chatKeys.projection(threadId),
    queryFn: () => getThreadProjection(threadId),
  });
}

export function chatTopicsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: chatKeys.topics(projectId),
    queryFn: () => listTopics(projectId),
  });
}

export function coachReviewQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: coachKeys.review(projectId),
    queryFn: () => getCoachReview(projectId),
  });
}

export function claimThreadsQueryOptions(claimId: string) {
  return queryOptions({
    queryKey: coachKeys.claimThreads(claimId),
    queryFn: () => getClaimThreads(claimId),
    enabled: Boolean(claimId),
  });
}

export function chatTopicQueryOptions(projectId: string, topicId: string) {
  return queryOptions({
    queryKey: chatKeys.topic(projectId, topicId),
    queryFn: () => getTopic(projectId, topicId),
  });
}
