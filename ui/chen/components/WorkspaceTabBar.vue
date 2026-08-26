<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ChenTabTitleFormat } from "~/chen/composables/useChenWorkspacePreferences";
import type { ChenTabDefinition } from "~/chen/types";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import { formatChenWorkspaceTabTitle } from "~/chen/composables/useChenWorkspacePreferences";

const props = defineProps<{
  tabs: ChenTabDefinition[];
  activeTabId: string;
  tabTitleFormat: ChenTabTitleFormat;
  logOpen?: boolean;
  logErrorCount?: number;
}>();

const emit = defineEmits<{
  activate: [id: string];
  close: [id: string];
  create: [kind: "query" | "console"];
  rename: [id: string, title: string];
  toggleLog: [];
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

const workspaceTabs = computed(() =>
  props.tabs.map((tab) => ({
    id: tab.id,
    label: displayWorkspaceTabTitle(tab),
    icon: tab.icon || "i-lucide-panel-top",
    title: tab.kind === "query" ? `${tab.title} · Double-click to rename` : displayWorkspaceTabTitle(tab)
  }))
);

function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
  return formatChenWorkspaceTabTitle(tab, props.tabTitleFormat);
}

function openRenameModal(tab: ChenTabDefinition) {
  if (tab.kind !== "query") return;
  renameTabId.value = tab.id;
  renameValue.value = tab.title;
  renameModalOpen.value = true;
}

function openRenameModalById(id: string) {
  const tab = props.tabs.find((item) => item.id === id);
  if (tab) openRenameModal(tab);
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

function activateTab(id: string) {
  emit("activate", id);
}
</script>

<template>
  <WorkspaceSubTabStrip
    :tabs="workspaceTabs"
    :active-id="activeTabId"
    close-label="Close"
    @select="activateTab"
    @close="emit('close', $event)"
    @pin="openRenameModalById"
  >
    <template #after-tabs>
      <UDropdownMenu
        :items="createTabMenuItems"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
        :ui="{ content: 'w-40 p-1' }"
      >
        <UButton
          size="xs"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          aria-label="Create tab"
          title="Create tab"
        />
      </UDropdownMenu>
    </template>
    <template #trailing>
      <div class="relative shrink-0">
        <UButton
          size="xs"
          icon="i-lucide-scroll-text"
          color="neutral"
          :variant="logOpen ? 'soft' : 'ghost'"
          :aria-pressed="logOpen"
          aria-label="Toggle Log Console"
          :title="logErrorCount ? `Log Console · ${logErrorCount} new errors` : 'Log Console'"
          @click="emit('toggleLog')"
        />
        <span
          v-if="logErrorCount"
          class="pointer-events-none absolute right-0.5 top-0.5 size-1.5 rounded-full bg-error ring-1 ring-[var(--workspace-surface-main)]"
        />
      </div>
    </template>
  </WorkspaceSubTabStrip>

  <ChenWorkspaceModal :open="renameModalOpen" title="Rename query" @update:open="updateRenameModal">
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
  </ChenWorkspaceModal>
</template>
