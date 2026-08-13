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
const tabStrip = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);
const hasLeftHidden = ref(false);
const hasRightHidden = ref(false);
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

const tabMenuItems = computed<DropdownMenuItem[]>(() =>
  props.tabs.map((tab) => ({
    label: displayWorkspaceTabTitle(tab),
    icon: tab.icon || "i-lucide-panel-top",
    type: "checkbox" as const,
    checked: props.activeTabId === tab.id,
    onSelect: () => activateTab(tab.id)
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

function updateOverflow() {
  const element = tabStrip.value;
  if (!element) return;
  hasOverflow.value = element.scrollWidth > element.clientWidth + 1;
  hasLeftHidden.value = hasOverflow.value && element.scrollLeft > 1;
  hasRightHidden.value = hasOverflow.value && element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

function scrollActiveTabIntoView(behavior: ScrollBehavior = "smooth") {
  const element = tabStrip.value;
  if (!element) return;
  const activeTab = Array.from(element.querySelectorAll<HTMLElement>("[data-workspace-tab-id]")).find(
    (tab) => tab.dataset.workspaceTabId === props.activeTabId
  );
  activeTab?.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
}

function activateTab(id: string) {
  emit("activate", id);
  nextTick(scrollActiveTabIntoView);
}

function scrollTabStrip(direction: "left" | "right") {
  const element = tabStrip.value;
  if (!element) return;
  element.scrollBy({
    left: direction === "left" ? -Math.max(120, element.clientWidth * 0.6) : Math.max(120, element.clientWidth * 0.6),
    behavior: "smooth"
  });
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateOverflow();
  scrollActiveTabIntoView("auto");
  if (!tabStrip.value) return;
  resizeObserver = new ResizeObserver(updateOverflow);
  resizeObserver.observe(tabStrip.value);
  tabStrip.value.addEventListener("scroll", updateOverflow, { passive: true });
});

onBeforeUnmount(() => {
  tabStrip.value?.removeEventListener("scroll", updateOverflow);
  resizeObserver?.disconnect();
});

watch(
  () => [props.tabs, props.activeTabId],
  () =>
    nextTick(() => {
      updateOverflow();
      scrollActiveTabIntoView();
    }),
  { deep: true }
);
</script>

<template>
  <div class="flex h-9 items-center gap-1 bg-[var(--workspace-surface-main)] px-2">
    <UButton
      v-if="hasLeftHidden"
      size="xs"
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      aria-label="Scroll tabs left"
      title="Scroll tabs left"
      @click="scrollTabStrip('left')"
    />
    <div
      ref="tabStrip"
      class="chen-workspace-tab-strip flex h-full w-fit min-w-0 max-w-full shrink items-center gap-1 overflow-x-auto"
    >
      <button
        v-for="item in props.tabs"
        :key="item.id"
        :data-workspace-tab-id="item.id"
        class="flex h-7 min-w-20 max-w-40 basis-40 grow shrink items-center gap-1 self-center rounded-md px-1.5 text-[11px] leading-none transition-colors"
        :class="
          props.activeTabId === item.id
            ? 'bg-accented text-highlighted'
            : 'text-muted hover:bg-accented hover:text-highlighted'
        "
        :title="
          item.kind === 'query' ? `${item.title} · Double-click the title to rename` : displayWorkspaceTabTitle(item)
        "
        @click="activateTab(item.id)"
      >
        <UIcon :name="item.icon || 'i-lucide-panel-top'" class="size-3.5 shrink-0" />
        <span
          class="min-w-0 flex-1 truncate leading-4"
          :class="item.kind === 'query' ? 'cursor-text' : ''"
          @dblclick.stop="openRenameModal(item)"
        >
          {{ displayWorkspaceTabTitle(item) }}
        </span>
        <span
          class="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:bg-elevated hover:text-foreground"
          role="button"
          tabindex="0"
          @click.stop="emit('close', item.id)"
          @keydown.enter.stop.prevent="emit('close', item.id)"
          @keydown.space.stop.prevent="emit('close', item.id)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </span>
      </button>
    </div>
    <UButton
      v-if="hasRightHidden"
      size="xs"
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      aria-label="Scroll tabs right"
      title="Scroll tabs right"
      @click="scrollTabStrip('right')"
    />
    <UDropdownMenu
      v-if="hasOverflow"
      :items="tabMenuItems"
      :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
      :ui="{ content: 'w-52 max-h-64 overflow-y-auto p-1', label: 'truncate' }"
    >
      <UButton
        size="xs"
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        aria-label="Select tab"
        title="Select tab"
      />
    </UDropdownMenu>
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
  </div>

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

<style scoped>
.chen-workspace-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chen-workspace-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
