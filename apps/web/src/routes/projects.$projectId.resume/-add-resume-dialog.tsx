import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AddResumeDialogProps } from "./projects.$projectId.resume/-resume.types";

export function AddResumeDialog({
  open,
  onOpenChange,
  onSubmit,
  dialogMode,
  setDialogMode,
  resumeText,
  setResumeText,
  setResumeFile,
  isBusy,
  canSubmit,
  onReset,
}: AddResumeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add resume</DialogTitle>
          <DialogDescription>
            Paste resume text or upload a file. PDF, DOCX, TXT, and MD uploads are converted into
            editable text automatically.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void onSubmit();
          }}
        >
          <Tabs
            value={dialogMode}
            onValueChange={(value) => setDialogMode(value as "paste" | "upload")}
          >
            <TabsList aria-label="Resume input mode">
              <TabsTrigger type="button" value="paste">
                Paste content
              </TabsTrigger>
              <TabsTrigger type="button" value="upload">
                Upload file
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" keepMounted>
              <div className="space-y-2">
                <Label htmlFor="resume-paste">Resume text</Label>
                <Textarea
                  id="resume-paste"
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  placeholder="Paste the resume contents here..."
                  className="min-h-64"
                />
              </div>
            </TabsContent>

            <TabsContent value="upload" keepMounted>
              <div className="space-y-2">
                <Label htmlFor="resume-upload">Resume file</Label>
                <Input
                  id="resume-upload"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Upload PDF, DOCX, TXT, or MD and the app will extract text automatically.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onReset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={isBusy || !canSubmit}>
            <Upload className="size-4" />
            {isBusy ? "Adding..." : "Add resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
