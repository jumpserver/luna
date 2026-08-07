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
}>();

const colorMode = useColorMode();
const isDarkTabTheme = computed(() => colorMode.value === "dark");

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
</script>

<template>
  <div
    class="chen-workspace-tab-bar flex h-9 items-center px-2"
    :class="{ 'chen-workspace-tab-bar-dark': isDarkTabTheme }"
  >
    <div class="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
      <div class="flex h-full w-max min-w-full items-center gap-1">
        <button
          v-for="item in props.tabs"
          :key="item.id"
          class="chen-workspace-tab flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md px-2.5 text-[11px] leading-none transition"
          :class="
            props.activeTabId === item.id
              ? 'chen-workspace-tab-active text-highlighted'
              : 'text-muted hover:bg-[var(--chen-workspace-tab-hover)]'
          "
          :title="item.title"
          @click="emit('activate', item.id)"
        >
          <UIcon :name="item.icon || 'i-lucide-panel-top'" class="size-3.5" />
          <span class="max-w-36 truncate">{{ displayWorkspaceTabTitle(item) }}</span>
          <span
            class="flex size-4 items-center justify-center rounded text-muted hover:bg-[var(--chen-workspace-tab-hover)] hover:text-foreground"
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
    </div>

    <div class="ml-2 flex h-full shrink-0 items-center gap-1 pl-2">
      <UDropdownMenu
        :items="createTabMenuItems"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
        :ui="{ content: 'w-40 p-1' }"
      >
        <button
          type="button"
          class="flex h-7 shrink-0 items-center justify-center self-center rounded-md px-2 text-muted transition hover:bg-[var(--chen-workspace-tab-hover)] hover:text-highlighted"
          aria-label="Create tab"
          title="Create tab"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
        </button>
      </UDropdownMenu>
    </div>
  </div>
</template>

<style scoped>
.chen-workspace-tab-bar {
  --chen-workspace-tab-active-bg: color-mix(in srgb, var(--workspace-surface-main) 82%, black 14%);
  --chen-workspace-tab-hover: color-mix(in srgb, var(--workspace-surface-main) 84%, black 10%);
  background-color: var(--workspace-surface-main);
}

.chen-workspace-tab {
  position: relative;
}

.chen-workspace-tab-active {
  background-color: var(--chen-workspace-tab-active-bg);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--app-fg) 9%, transparent);
}

.chen-workspace-tab-active::after {
  position: absolute;
  right: 0.5rem;
  bottom: 0;
  left: 0.5rem;
  height: 2px;
  border-radius: 9999px;
  background: var(--theme-accent);
  content: "";
}

.chen-workspace-tab-bar-dark {
  --chen-workspace-tab-active-bg: color-mix(in srgb, var(--theme-bg) 87%, white 3.5%);
  --chen-workspace-tab-hover: color-mix(in srgb, white 2%, transparent);
}

.chen-workspace-tab-bar-dark .chen-workspace-tab-active {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
    0 8px 18px color-mix(in srgb, black 32%, transparent);
}
</style>
