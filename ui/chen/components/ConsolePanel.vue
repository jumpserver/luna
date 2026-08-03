<script setup lang="ts">
import type { ChenPromptConsoleTab, ChenQueryLikeWorkspaceTab } from "~/chen/types";

import QueryResultTabs from "~/chen/components/QueryResultTabs.vue";

const props = defineProps<{
  tab: ChenPromptConsoleTab;
  contextLabel: string;
  promptLabel: string;
}>();

const emit = defineEmits<{
  run: [tab: ChenPromptConsoleTab];
  cancel: [tab: ChenQueryLikeWorkspaceTab];
  updatePendingSql: [tab: ChenPromptConsoleTab, value: string];
  activateResult: [tab: ChenPromptConsoleTab, id: string];
}>();

// TODO(chen-native): Confirm whether this console-like prompt should remain
// as an independent entry or fold back into QueryConsolePanel.
const pendingSqlValue = computed({
  get: () => props.tab.pendingSql,
  set: (value: string) => emit("updatePendingSql", props.tab, value)
});
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
    <div class="flex min-h-0 flex-col border-b border-default">
      <div class="flex items-center gap-2 border-b border-default px-3 py-2">
        <UButton icon="i-lucide-play" size="sm" @click="emit('run', tab)" />
        <UButton icon="i-lucide-square" size="sm" color="neutral" variant="soft" @click="emit('cancel', tab)" />
        <UBadge color="neutral" variant="subtle">
          {{ tab.state.currentContext || contextLabel || "Console" }}
        </UBadge>
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-3 py-3 font-ui-mono text-sm">
        <div
          v-if="!tab.historyEntries.length && !tab.logs.length"
          class="grid h-full place-items-center text-center text-muted"
        >
          <div>
            <UIcon name="i-lucide-square-terminal" class="mx-auto mb-2 size-5" />
            <p>Run SQL here like a `mysql` or `psql` console.</p>
          </div>
        </div>

        <div v-for="entry in tab.historyEntries" :key="entry.id" class="mb-3">
          <div class="mb-1 flex items-start gap-2">
            <span class="shrink-0 text-primary">{{ promptLabel }}</span>
            <pre class="whitespace-pre-wrap break-words text-[var(--app-fg)]">{{ entry.sql }}</pre>
          </div>
        </div>

        <div
          v-if="tab.logs.length"
          class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2 text-xs text-muted"
        >
          <pre class="whitespace-pre-wrap">{{ tab.logs.join("\n") }}</pre>
        </div>
      </div>

      <div class="border-t border-default px-3 py-3">
        <div
          class="flex items-start gap-2 rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
        >
          <span class="pt-2 font-ui-mono text-sm text-primary">{{ promptLabel }}</span>
          <textarea
            v-model="pendingSqlValue"
            class="min-h-20 flex-1 resize-none bg-transparent font-ui-mono text-sm text-[var(--app-fg)] outline-none placeholder:text-[var(--app-muted)]"
            placeholder="Type SQL and press Cmd/Ctrl+Enter to run"
            @keydown.enter.meta.prevent="emit('run', tab)"
            @keydown.enter.ctrl.prevent="emit('run', tab)"
          />
        </div>
      </div>
    </div>

    <QueryResultTabs
      :result-tabs="tab.resultTabs"
      :active-result-tab-id="tab.activeResultTabId"
      empty-message="Query results will open here."
      @update:active-result-tab-id="emit('activateResult', tab, $event)"
    />
  </div>
</template>
