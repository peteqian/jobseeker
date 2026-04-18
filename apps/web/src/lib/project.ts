import type { ProjectDocument, ProjectSnapshot } from "@jobseeker/contracts";

export type ProjectStageId = "resume" | "profile" | "questions" | "explorer" | "tailor";

export function latestDocument(
  documents: ProjectDocument[],
  kind: ProjectDocument["kind"],
): ProjectDocument | null {
  return (
    [...documents]
      .filter((document) => document.kind === kind)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}

export function getResumeDoc(project: ProjectSnapshot | null): ProjectDocument | null {
  if (!project) {
    return null;
  }

  const activeSource = project.documents.find(
    (document) => document.kind === "resume_source" && document.id === project.activeResumeSourceId,
  );

  if (activeSource) {
    return activeSource;
  }

  const extractedResume = latestDocument(project.documents, "extracted_text");
  if (extractedResume) {
    return extractedResume;
  }

  return latestDocument(project.documents, "resume_source");
}

export function getRankedJobs(project: ProjectSnapshot | null) {
  if (!project) {
    return [];
  }

  return [...project.jobs]
    .map((job) => ({
      job,
      match: project.jobMatches.find((item) => item.jobId === job.id) ?? null,
    }))
    .sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0));
}

export function getProjectStages(project: ProjectSnapshot | null) {
  const resumeDoc = getResumeDoc(project);
  const semanticProfile = latestDocument(project?.documents ?? [], "semantic_profile");
  const tailoredResume = latestDocument(project?.documents ?? [], "tailored_resume");
  const questionCount = project?.questionCards.length ?? project?.questions.length ?? 0;
  const answeredQuestionCount =
    project?.questionCards.filter((card) => card.status === "answered").length ?? 0;
  const jobCount = project?.jobs.length ?? 0;

  return [
    {
      id: "resume" as const,
      title: "Your resume",
      detail: resumeDoc ? "Ready" : "Pending",
      complete: Boolean(resumeDoc),
    },
    {
      id: "questions" as const,
      title: "Questions",
      detail: !resumeDoc
        ? "Pending"
        : questionCount > 0
          ? answeredQuestionCount === questionCount
            ? `${questionCount} answered`
            : `${questionCount - answeredQuestionCount} open`
          : semanticProfile
            ? "Clear"
            : "Ready",
      complete: Boolean(resumeDoc) && questionCount > 0 && answeredQuestionCount === questionCount,
    },
    {
      id: "profile" as const,
      title: "Profile",
      detail: !resumeDoc
        ? "Pending"
        : semanticProfile
          ? "Built"
          : questionCount > 0
            ? "Waiting on answers"
            : "Ready",
      complete: Boolean(semanticProfile),
    },
    {
      id: "explorer" as const,
      title: "Explorer",
      detail: jobCount > 0 ? `${jobCount} jobs found` : semanticProfile ? "Ready" : "Locked",
      complete: jobCount > 0,
    },
    {
      id: "tailor" as const,
      title: "Tailored resume",
      detail: tailoredResume ? "Generated" : jobCount > 0 ? "Ready" : "Locked",
      complete: Boolean(tailoredResume),
    },
  ];
}
