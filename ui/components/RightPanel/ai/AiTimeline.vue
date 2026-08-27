<script setup lang="ts">
import type { AiPanelEmptyState } from "./domains/types";
import type { AiTimelineAction, ViewItem } from "./types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { resolveAiTimelineRenderer } from "./domains/registry";
import AiActivityItem from "./domains/shared/AiActivityItem.vue";

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

function scrollToBottom() {
  void nextTick(() => {
    if (messagesElement.value) messagesElement.value.scrollTop = messagesElement.value.scrollHeight;
  });
}

watch(() => props.revision, scrollToBottom, { flush: "post" });
</script>

<template>
  <main ref="messagesElement" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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

    <AiActivityItem v-if="activityLabel" :assistant-name="assistantName" :label="activityLabel" />
  </main>
</template>
