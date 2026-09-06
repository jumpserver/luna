<script setup lang="ts">
import type { AiPanelEmptyState } from "./domains/types";
import type { AiTimelineAction, ViewItem } from "./types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { resolveAiTimelineRenderer } from "./domains/registry";
import AiActivityItem from "./domains/shared/AiActivityItem.vue";
import { aiTimelineHasPendingOperation } from "./presentation";
import { useAiTimelineScroll } from "./useAiTimelineScroll";

const props = defineProps<{
  items: ViewItem[];
  session: WorkspaceAiSession;
  assistantName: string;
  empty: boolean;
  emptyState: AiPanelEmptyState;
  activityLabel: string;
  revision: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const messagesElement = useTemplateRef<HTMLElement>("messagesElement");
const contentElement = useTemplateRef<HTMLElement>("contentElement");
useAiTimelineScroll(
  messagesElement,
  contentElement,
  () => props.revision,
  () => props.session,
  () => props.items.findLast((item) => item.kind === "text" && item.role === "user")?.key
);
</script>

<template>
  <main ref="messagesElement" class="min-h-0 flex-1 overflow-y-auto p-3">
    <div ref="contentElement" class="space-y-3">
      <UEmpty
        v-if="empty"
        :icon="emptyState.icon"
        size="sm"
        variant="naked"
        :title="emptyState.title"
        :description="emptyState.description"
      />

      <component
        :is="resolveAiTimelineRenderer(item.domain)"
        v-for="item in items"
        :key="item.key"
        :item="item"
        :session="session"
        :assistant-name="assistantName"
        @action="emit('action', $event)"
      />

      <AiActivityItem
        v-if="activityLabel && !aiTimelineHasPendingOperation(items)"
        :assistant-name="assistantName"
        :label="activityLabel"
      />
    </div>
  </main>
</template>
