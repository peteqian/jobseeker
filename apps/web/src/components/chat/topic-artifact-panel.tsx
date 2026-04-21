import type { TopicFileMeta } from "@jobseeker/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PanelRightClose, PanelRightOpen, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chatTopicQueryOptions, chatTopicsQueryOptions } from "@/lib/query-options";
import { chatKeys } from "@/lib/query-keys";
import { updateTopic } from "@/rpc/chat-client";

import { TopicCard } from "./topic-card";
import { TopicEditorModal } from "./topic-editor-modal";

interface TopicArtifactPanelProps {
  projectId: string;
  initialTopics?: TopicFileMeta[];
}

const EMPTY_TOPICS: TopicFileMeta[] = [];

export function TopicArtifactPanel({ projectId, initialTopics }: TopicArtifactPanelProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const topics =
    useQuery({
      ...chatTopicsQueryOptions(projectId),
      initialData: initialTopics,
    }).data ?? EMPTY_TOPICS;
  const selected = topics.find((topic) => topic.id === selectedId) ?? null;
  const selectedTopic = useQuery({
    ...chatTopicQueryOptions(projectId, selectedId ?? ""),
    enabled: Boolean(selectedId),
  }).data;
  const loading = Boolean(selectedId) && !selectedTopic;
  const content = selectedTopic?.content ?? "";
  const saveTopicMutation = useMutation({
    mutationFn: ({ topicId, content }: { topicId: string; content: string }) =>
      updateTopic(projectId, topicId, content),
    onSuccess: (topic) => {
      queryClient.setQueryData(chatKeys.topic(projectId, topic.id), topic);
      queryClient.setQueryData<TopicFileMeta[]>(
        chatKeys.topics(projectId),
        (prev) =>
          prev?.map((entry) =>
            entry.id === topic.id
              ? {
                  ...entry,
                  title: topic.title,
                  status: topic.status,
                  updatedAt: topic.updatedAt,
                }
              : entry,
          ) ?? prev,
      );
    },
  });

  useEffect(() => {
    if (!selectedId && topics.length > 0) {
      setSelectedId(topics[0].id);
    }
  }, [selectedId, topics]);

  async function handleSave(newContent: string) {
    if (!selectedId) {
      return;
    }

    await saveTopicMutation.mutateAsync({ topicId: selectedId, content: newContent });
  }

  if (!open) {
    return (
      <div className="flex flex-col items-center border-l px-1 py-3">
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

      <div className="space-y-2 border-b p-3">
        {topics.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Topics will appear as you chat.
          </p>
        ) : (
          topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              selected={topic.id === selectedId}
              onClick={() => setSelectedId(topic.id)}
            />
          ))
        )}
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <p className="truncate text-xs font-medium text-muted-foreground">{selected.title}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{content}</pre>
            )}
          </div>
        </div>
      ) : null}

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
