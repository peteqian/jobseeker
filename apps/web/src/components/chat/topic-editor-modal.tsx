import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TopicEditorModalProps {
  open: boolean;
  title: string;
  initialContent: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export function TopicEditorModal({
  open,
  title,
  initialContent,
  onSave,
  onClose,
}: TopicEditorModalProps) {
  const [content, setContent] = useState(initialContent);

  function handleSave() {
    onSave(content);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit: {title}</DialogTitle>
        </DialogHeader>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 min-h-[300px] w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          spellCheck={false}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
