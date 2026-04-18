export type QuestionFieldType = "text" | "textarea" | "select" | "multiselect";

export type QuestionFieldValue = string | string[];

export type QuestionAnswerMap = Record<string, QuestionFieldValue>;

export type QuestionCardStatus = "open" | "answered";

export type QuestionCardSource = "resume_analysis" | "codex" | "manual";

export type QuestionCardSectionKey =
  | "currentAnswer"
  | "evidenceSoFar"
  | "whyItMatters"
  | "pushback"
  | "followUpQuestions"
  | "resumeAngles"
  | "conversation";

export interface QuestionCardSections {
  currentAnswer: string;
  evidenceSoFar: string[];
  whyItMatters: string[];
  pushback: string[];
  followUpQuestions: string[];
  resumeAngles: string[];
  conversation: string[];
}

export interface QuestionCard {
  id: string;
  projectId: string;
  taskId: string | null;
  slug: string;
  title: string;
  prompt: string;
  status: QuestionCardStatus;
  source: QuestionCardSource;
  path: string;
  sections: QuestionCardSections;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateQuestionCardInput {
  projectId: string;
  cardId: string;
  answer: string;
}

export interface PendingQuestionField {
  id: string;
  label: string;
  type?: QuestionFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{
    value: string;
    label: string;
  }>;
}

export interface PendingQuestion {
  id: string;
  projectId: string;
  taskId: string;
  prompt: string;
  fields: PendingQuestionField[];
  createdAt: string;
}

export interface QuestionAnswerRecord {
  id: string;
  projectId: string;
  questionId: string;
  questionPrompt: string;
  fieldId: string;
  fieldLabel: string;
  answer: QuestionFieldValue;
  answeredAt: string;
}

export interface QuestionAnswerInput {
  projectId: string;
  answers: QuestionAnswerMap;
}
