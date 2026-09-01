<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

import { connectorSessionKey } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import KokoSearchInput from "#koko/components/SearchInput/index.vue";
import { TerminalMittEvent } from "#koko/composables/terminal/protocol";
import { useKokoTerminalEvents } from "#koko/composables/terminal/useTerminalEvents";
import { useKokoTerminalSocket } from "#koko/composables/terminal/useTerminalSocket";

const showSearchInput = ref(false);
const { t } = useI18n();
const host = useKokoHostAdapter();
const sessionContext = inject(connectorSessionKey, null);
const { onMittEvent } = useKokoTerminalEvents();
const {
  commandSuggestions,
  connectionError,
  containerRef,
  canUseClipboard,
  contextMenuPosition,
  contextMenuVisible,
  copySelection,
  pasteClipboard,
  searchAddon,
  selectionText,
  zmodem
} = useKokoTerminalSocket();
const { uploadOpen, fileInfo, confirmUpload, cancelUpload } = zmodem;
const tabId = computed(() => unref(sessionContext)?.tabId || "");
const suggestionListRef = shallowRef<HTMLElement | null>(null);

watch(commandSuggestions.selectedIndex, (index) => {
  nextTick(() => {
    suggestionListRef.value
      ?.querySelector<HTMLElement>(`[data-suggestion-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
});

function closeContextMenu() {
  contextMenuVisible.value = false;
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("koko.actions.copy"),
    icon: "i-lucide-copy",
    disabled: !selectionText.value || !canUseClipboard("copy"),
    onSelect: () => {
      closeContextMenu();
      void copySelection();
    }
  },
  {
    label: t("koko.actions.paste"),
    icon: "i-lucide-clipboard-paste",
    disabled: !canUseClipboard("paste"),
    onSelect: () => {
      closeContextMenu();
      void pasteClipboard();
    }
  },
  { type: "separator" as const },
  {
    label: t("koko.terminal.splitVertically"),
    icon: "i-lucide-columns-2",
    disabled: !tabId.value || !host.canSplitSession(tabId.value, "vertical"),
    onSelect: () => {
      closeContextMenu();
      host.splitSession(tabId.value, "vertical");
    }
  },
  {
    label: t("koko.terminal.splitHorizontally"),
    icon: "i-lucide-rows-2",
    disabled: !tabId.value || !host.canSplitSession(tabId.value, "horizontal"),
    onSelect: () => {
      closeContextMenu();
      host.splitSession(tabId.value, "horizontal");
    }
  }
]);

onMittEvent(TerminalMittEvent.OpenSearch, () => {
  showSearchInput.value = true;
});

const onUploadChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  fileInfo.value = input.files?.[0] || null;
};
</script>

<template>
  <KokoSearchInput v-if="showSearchInput && searchAddon" :search-addon="searchAddon" @close="showSearchInput = false" />

  <UModal
    v-model:open="uploadOpen"
    :title="$t('koko.terminal.uploadTitle')"
    :dismissible="false"
    :ui="{ footer: 'justify-end gap-2' }"
  >
    <template #body>
      <label class="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-sm">
        <UIcon name="i-lucide-upload" class="size-8" />
        <span>{{ $t("koko.terminal.uploadTips") }}</span>
        <input type="file" class="hidden" @change="onUploadChange" />
      </label>
      <div v-if="fileInfo" class="mt-2 text-xs text-muted">
        {{ fileInfo.name }}
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="cancelUpload">
        {{ $t("koko.actions.cancel") }}
      </UButton>
      <UButton color="primary" @click="confirmUpload">
        {{ $t("koko.actions.upload") }}
      </UButton>
    </template>
  </UModal>

  <div class="relative h-full w-full min-h-0">
    <div id="terminal-container" ref="containerRef" class="h-full w-full min-h-0" />
    <div
      v-if="commandSuggestions.open.value"
      ref="suggestionListRef"
      role="listbox"
      :aria-label="t('koko.terminal.commandSuggestions')"
      class="terminal-command-suggestions absolute z-[60] overflow-y-auto py-1"
      :style="{
        left: `${commandSuggestions.position.value.left}px`,
        top:
          commandSuggestions.position.value.bottom === 'auto' ? `${commandSuggestions.position.value.top}px` : 'auto',
        bottom: commandSuggestions.position.value.bottom,
        width: `${commandSuggestions.position.value.maxWidth}px`
      }"
    >
      <button
        v-for="(suggestion, index) in commandSuggestions.suggestions.value"
        :key="`${suggestion.source}:${suggestion.command}`"
        type="button"
        role="option"
        :aria-selected="index === commandSuggestions.selectedIndex.value"
        :data-suggestion-index="index"
        class="terminal-command-suggestion flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-ui-mono text-xs"
        :class="{ 'terminal-command-suggestion-active': index === commandSuggestions.selectedIndex.value }"
        @mouseenter="commandSuggestions.select(index)"
        @mousedown.prevent
        @click="commandSuggestions.accept(index)"
      >
        <span class="min-w-0 truncate">{{ suggestion.command }}</span>
        <span class="shrink-0 font-sans text-[10px] text-muted">
          {{
            suggestion.source === "history"
              ? t("koko.terminal.commandSuggestionHistory")
              : t("koko.terminal.commandSuggestionCatalog")
          }}
        </span>
      </button>
    </div>
    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="(open) => (contextMenuVisible = open)"
    >
      <div
        class="pointer-events-none fixed size-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>
    <div
      v-if="connectionError"
      class="absolute inset-0 grid place-items-center bg-default px-6 text-center text-sm text-muted"
    >
      <div class="flex max-w-md flex-col items-center gap-2">
        <UIcon name="i-lucide-circle-alert" class="size-5 text-error" />
        <div>{{ connectionError }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 背景与 xterm 主题背景同源；保留轻微上下留白，避免内容贴边 */
#terminal-container {
  background: var(--terminal-background);
  --xterm-scrollbar-top: 4px;
  --xterm-scrollbar-bottom: 4px;
}

#terminal-container :deep(.terminal) {
  height: 100%;

  .xterm-scrollable-element {
    height: 100%;
    padding: 12px;
  }
}

/* 主题切换瞬间由容器背景兜底，避免闪色块；滚动条不覆盖，走 main.css 全局窄样式 */
#terminal-container :deep(.xterm-viewport) {
  background-color: transparent !important;
}

.terminal-command-suggestions {
  max-height: 224px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-overlay);
  color: var(--app-fg);
  box-shadow: var(--theme-shadow-soft);
}

.terminal-command-suggestion:hover,
.terminal-command-suggestion-active {
  background: var(--app-selected-soft);
  color: var(--app-fg);
}
</style>
