import { FileText } from "lucide-react";

import type { ResumeVersion } from "@jobseeker/contracts";
import type { ContentState } from "./projects.$projectId.resume/resume.types";

function getContentState(version: ResumeVersion | null): ContentState {
  if (!version) {
    return {
      title: "Content",
      description: "Select a saved version to inspect its text.",
      value: "",
      empty: "",
      meta: "",
    };
  }

  if (version.extractedDocument?.content) {
    return {
      title: "Content",
      description: "Extracted text from the selected resume.",
      value: version.extractedDocument.content,
      empty: "",
      meta: "Extracted automatically",
    };
  }

  if (version.document.content) {
    return {
      title: "Content",
      description: "Stored text for the selected resume.",
      value: version.document.content,
      empty: "",
      meta: "Using saved source text",
    };
  }

  return {
    title: "Content",
    description: "Text will appear here when extraction finishes.",
    value: "",
    empty: "This resume is saved, but text extraction has not completed yet.",
    meta: "Waiting for extraction",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

interface ResumePreviewProps {
  selectedVersion: ResumeVersion | null;
}

export function ResumePreview({ selectedVersion }: ResumePreviewProps) {
  const content = getContentState(selectedVersion);

  return (
    <section className="flex min-h-0 flex-col bg-background/60">
      <div className="px-5 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold tracking-tight">{content.title}</h3>
            <p className="text-sm text-muted-foreground">{content.description}</p>
          </div>
          {selectedVersion ? (
            <p className="shrink-0 text-sm text-muted-foreground">
              {selectedVersion.document.name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {selectedVersion ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{formatDate(selectedVersion.uploadedAt)}</span>
              <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
              <span>{content.meta}</span>
            </div>

            {content.value ? (
              <pre className="min-h-[30rem] whitespace-pre-wrap break-words rounded-3xl bg-background/80 p-5 font-mono text-xs leading-relaxed">
                {content.value}
              </pre>
            ) : (
              <div className="flex min-h-[30rem] flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-8 text-center">
                <FileText className="size-8 text-muted-foreground" />
                <div className="space-y-1">
                  <h4 className="font-medium">Text not ready</h4>
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">
                    {content.empty}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-[30rem] flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-8 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <h4 className="font-medium">Choose a resume</h4>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Pick a saved version from the list to inspect its extracted text.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
