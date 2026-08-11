<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ChenTabDefinition } from "~/chen/types";

const props = defineProps<{
  tabs: ChenTabDefinition[];
  activeTabId: string;
}>();

const emit = defineEmits<{
  activate: [id: string];
  close: [id: string];
  create: [kind: "query" | "console"];
  rename: [id: string, title: string];
}>();

const renameModalOpen = ref(false);
const renameTabId = ref("");
const renameValue = ref("");
const renameDisabled = computed(() => {
  const tab = props.tabs.find((item) => item.id === renameTabId.value);
  const title = renameValue.value.trim();
  return !tab || tab.kind !== "query" || !title || title === tab.title;
});

const createTabMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: "New Query",
      icon: "i-lucide-file-code-2",
      onSelect: () => emit("create", "query")
    },
    {
      label: "New Console",
      icon: "i-lucide-square-terminal",
      onSelect: () => emit("create", "console")
    }
  ]
]);

function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
  if (tab.kind !== "data-view") return tab.title;
  const normalized = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
  return normalized || tab.title;
}

function openRenameModal(tab: ChenTabDefinition) {
  if (tab.kind !== "query") return;
  renameTabId.value = tab.id;
  renameValue.value = tab.title;
  renameModalOpen.value = true;
}

function submitRename() {
  if (renameDisabled.value) return;
  emit("rename", renameTabId.value, renameValue.value.trim());
  updateRenameModal(false);
}

function updateRenameModal(open: boolean) {
  renameModalOpen.value = open;
  if (open) return;
  renameTabId.value = "";
  renameValue.value = "";
}
</script>

<template>
  <div class="flex h-9 items-center bg-[var(--workspace-surface-main)] px-2">
    <div class="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
      <div class="flex h-full w-max min-w-full items-center gap-1">
        <button
          v-for="item in props.tabs"
          :key="item.id"
          class="flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md px-2.5 text-[11px] leading-none transition-colors"
          :class="
            props.activeTabId === item.id
              ? 'bg-accented text-highlighted'
              : 'text-muted hover:bg-accented hover:text-highlighted'
          "
          :title="item.kind === 'query' ? `${item.title} · Double-click the title to rename` : item.title"
          @click="emit('activate', item.id)"
        >
          <UIcon :name="item.icon || 'i-lucide-panel-top'" class="size-3.5" />
          <span
            class="max-w-36 truncate leading-4"
            :class="item.kind === 'query' ? 'cursor-text' : ''"
            @dblclick.stop="openRenameModal(item)"
          >
            {{ displayWorkspaceTabTitle(item) }}
          </span>
          <span
            class="flex size-4 items-center justify-center rounded text-muted hover:bg-elevated hover:text-foreground"
            role="button"
            tabindex="0"
            @click.stop="emit('close', item.id)"
            @keydown.enter.stop.prevent="emit('close', item.id)"
            @keydown.space.stop.prevent="emit('close', item.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </span>
        </button>
        <UDropdownMenu
          :items="createTabMenuItems"
          :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
          :ui="{ content: 'w-40 p-1' }"
        >
          <button
            type="button"
            class="flex h-7 shrink-0 items-center justify-center self-center rounded-md px-2 text-muted transition-colors hover:bg-accented hover:text-highlighted"
            aria-label="Create tab"
            title="Create tab"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
          </button>
        </UDropdownMenu>
      </div>
    </div>
  </div>

  <UModal :open="renameModalOpen" title="Rename query" @update:open="updateRenameModal">
    <template #body>
      <UInput
        v-model="renameValue"
        class="w-full"
        placeholder="Query name"
        autofocus
        @keydown.enter.prevent="submitRename"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="updateRenameModal(false)">Cancel</UButton>
        <UButton :disabled="renameDisabled" @click="submitRename">Rename</UButton>
      </div>
    </template>
  </UModal>
</template>
