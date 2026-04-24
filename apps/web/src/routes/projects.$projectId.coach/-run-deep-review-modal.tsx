import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface RunDeepReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { pastedJds: string[]; useExplorer: boolean }) => Promise<void> | void;
  submitting: boolean;
}

export function RunDeepReviewModal({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: RunDeepReviewModalProps) {
  const [pasted, setPasted] = useState("");
  const [useExplorer, setUseExplorer] = useState(true);

  async function handleSubmit() {
    const chunks = pasted
      .split(/\n-{3,}\n|\n={3,}\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    await onSubmit({ pastedJds: chunks, useExplorer });
    setPasted("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run deep review</DialogTitle>
          <DialogDescription>
            The coach will critique your resume like an HR reviewer, grounded in real job
            descriptions for the roles you&apos;re targeting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="jd-paste">
              Paste target job descriptions
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              1–3 JDs. Separate multiple with a line of <code>---</code>. Optional.
            </p>
            <Textarea
              id="jd-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={"Senior Backend Engineer at Acme...\n---\nStaff Engineer at Beta..."}
              rows={10}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useExplorer}
              onChange={(event) => setUseExplorer(event.target.checked)}
            />
            Also use jobs from this project&apos;s explorer (top 5)
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Starting…" : "Run deep review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
