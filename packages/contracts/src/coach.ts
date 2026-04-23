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
}

export interface ClaimThread {
  id: string;
  claimId: string;
  threadId: string;
  createdAt: string;
}

export interface StartCoachReviewInput {
  projectId: string;
  resumeDocId: string;
  focusArea?: string;
}

export interface UpdateCoachNextStepInput {
  completed: boolean;
}
