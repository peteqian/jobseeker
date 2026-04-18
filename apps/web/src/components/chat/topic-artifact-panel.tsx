import type { TopicFileMeta } from "@jobseeker/contracts";
import { FileText, PanelRightClose, PanelRightOpen, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTopic, updateTopic } from "@/rpc/chat-client";

import { TopicCard } from "./topic-card";
import { TopicEditorModal } from "./topic-editor-modal";

interface TopicArtifactPanelProps {
  projectId: string;
  topics: TopicFileMeta[];
  /** Live content pushed from streaming — avoids an extra fetch */
  liveContent: Map<string, string>;
}

export function TopicArtifactPanel({ projectId, topics, liveContent }: TopicArtifactPanelProps) {
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const selected = topics.find((t) => t.id === selectedId) ?? null;

  // Auto-select first topic if none selected
  useEffect(() => {
    if (!selectedId && topics.length > 0) {
      setSelectedId(topics[0].id);
    }
  }, [selectedId, topics]);

  // Fetch content when selection changes
  const fetchContent = useCallback(
    async (topicId: string) => {
      // Check live content first (from streaming)
      const live = liveContent.get(topicId);
      if (live) {
        setContent(live);
        return;
      }

      setLoading(true);
      try {
        const topic = await getTopic(projectId, topicId);
        setContent(topic.content);
      } catch {
        setContent("Failed to load topic.");
      } finally {
        setLoading(false);
      }
    },
    [projectId, liveContent],
  );

  useEffect(() => {
    if (selectedId) {
      fetchContent(selectedId);
    }
  }, [selectedId, fetchContent]);

  // When live content updates for the selected topic, show it immediately
  useEffect(() => {
    if (selectedId && liveContent.has(selectedId)) {
      setContent(liveContent.get(selectedId)!);
    }
  }, [selectedId, liveContent]);

  async function handleSave(newContent: string) {
    if (!selectedId) return;

    try {
      await updateTopic(projectId, selectedId, newContent);
      setContent(newContent);
    } catch {
      // Revert on failure — content stays as-is
    }
  }

  function handleSelect(topicId: string) {
    setSelectedId(topicId);
  }

  // Collapsed state
  if (!open) {
    return (
      <div className="flex flex-col items-center border-l py-3 px-1">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
          <PanelRightOpen className="size-4" />
        </Button>
        {topics.length > 0 ? (
          <Badge variant="secondary" className="mt-2">
            {topics.length}
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Topics</h3>
          {topics.length > 0 ? <Badge variant="secondary">{topics.length}</Badge> : null}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      {/* Topic list */}
      <div className="space-y-2 p-3 border-b">
        {topics.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            Topics will appear as you chat.
          </p>
        ) : (
          topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              selected={topic.id === selectedId}
              onClick={() => handleSelect(topic.id)}
            />
          ))
        )}
      </div>

      {/* Content viewer */}
      {selected ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <p className="text-xs font-medium text-muted-foreground truncate">{selected.title}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{content}</pre>
            )}
          </div>
        </div>
      ) : null}

      {/* Editor modal */}
      {selected && editing ? (
        <TopicEditorModal
          open={editing}
          title={selected.title}
          initialContent={content}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
