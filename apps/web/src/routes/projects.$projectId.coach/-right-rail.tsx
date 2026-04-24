import type { CoachClaim, CoachGap, CoachSuggestion, TopicFileMeta } from "@jobseeker/contracts";

import { TopicArtifactPanel } from "@/components/chat/topic-artifact-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GapsPanel } from "./-gaps-panel";
import { SuggestionsPanel } from "./-suggestions-panel";

interface RightRailProps {
  projectId: string;
  initialTopics: TopicFileMeta[];
  selectedClaim: CoachClaim | null;
  suggestions: CoachSuggestion[];
  gaps: CoachGap[];
  onStartGapChat: (gapId: string) => void;
  pendingGapId: string | null;
}

export function RightRail({
  projectId,
  initialTopics,
  selectedClaim,
  suggestions,
  gaps,
  onStartGapChat,
  pendingGapId,
}: RightRailProps) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <Tabs defaultValue="gaps" className="flex h-full flex-col">
        <TabsList className="m-3 mb-0">
          <TabsTrigger value="gaps">Gaps</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
        </TabsList>
        <TabsContent value="gaps" className="min-h-0 flex-1 overflow-y-auto">
          <GapsPanel gaps={gaps} onStartChat={onStartGapChat} pendingGapId={pendingGapId} />
        </TabsContent>
        <TabsContent value="suggestions" className="min-h-0 flex-1 overflow-y-auto">
          <SuggestionsPanel claim={selectedClaim} suggestions={suggestions} />
        </TabsContent>
        <TabsContent value="topics" className="min-h-0 flex-1 overflow-hidden p-0">
          <TopicArtifactPanel projectId={projectId} initialTopics={initialTopics} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
