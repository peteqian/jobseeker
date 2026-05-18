export type CoachClaimStatus = "strong" | "weak" | "needs_impact";

export interface CoachClaim {
  id: string;
  reviewId: string;
  text: string;
  status: CoachClaimStatus;
  statusReason: string;
  createdAt: string;
}

export interface CoachSuggestion {
  id: string;
  claimId: string;
  text: string;
  createdAt: string;
}

export interface CoachNextStep {
  id: string;
  reviewId: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoachReview {
  id: string;
  projectId: string;
  resumeDocId: string;
  focusArea: string;
  score: number;
  issuesCount: number;
  createdAt: string;
  claims: CoachClaim[];
  suggestions: CoachSuggestion[];
  nextSteps: CoachNextStep[];
  gaps: CoachGap[];
}

export type CoachGapSeverity = "high" | "med" | "low";

export interface CoachGap {
  id: string;
  reviewId: string;
  topic: string;
  evidenceSummary: string;
  discussionSeed: string;
  severity: CoachGapSeverity;
  createdAt: string;
}

export type CoachAnchorType = "claim" | "gap";

export interface CoachThreadAnchor {
  id: string;
  anchorType: CoachAnchorType;
  anchorId: string;
  threadId: string;
  createdAt: string;
}

/**
 * @deprecated use CoachThreadAnchor with anchorType="claim".
 * Kept only to avoid breaking imports during transition.
 */
export type ClaimThread = CoachThreadAnchor;

export interface StartCoachReviewInput {
  projectId: string;
  resumeDocId: string;
  focusArea?: string;
  deep?: boolean;
  pastedJds?: string[];
  useExplorer?: boolean;
}

export interface UpdateCoachNextStepInput {
  completed: boolean;
}
