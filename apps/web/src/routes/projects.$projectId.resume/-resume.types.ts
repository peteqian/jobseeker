import type { ResumeVersion } from "@jobseeker/contracts";

export interface ResumeListProps {
  versions: ResumeVersion[];
  selectedVersion: ResumeVersion | null;
  isBusy: boolean;
  onSelect: (id: string) => void;
  onActivate: (version: ResumeVersion) => void;
  onDelete: (version: ResumeVersion) => void;
  onAdd: () => void;
}

export interface ResumePreviewProps {
  selectedVersion: ResumeVersion | null;
}

export interface AddResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  dialogMode: "paste" | "upload";
  setDialogMode: (mode: "paste" | "upload") => void;
  resumeText: string;
  setResumeText: (text: string) => void;
  resumeFile: File | null;
  setResumeFile: (file: File | null) => void;
  isBusy: boolean;
  canSubmit: boolean;
  onReset: () => void;
}

export interface ContentState {
  title: string;
  description: string;
  value: string;
  empty: string;
  meta: string;
}
