<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ChenTabDefinition } from "~/chen/types";

const props = defineProps<{
  tabs: ChenTabDefinition[]
  activeTabId: string
}>();

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
  create: [kind: "query" | "console"]
}>();

const createTabMenuItems = computed<DropdownMenuItem[][]>(() => [[
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
]]);

function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
  if (tab.kind !== "data-view") return tab.title;
  const normalized = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
  return normalized || tab.title;
}
</script>

<template>
  <div class="flex items-center border-b border-default px-2 py-1">
    <div class="min-w-0 flex-1 overflow-x-auto">
      <div class="flex w-max min-w-full items-center gap-1">
        <button
          v-for="item in props.tabs"
          :key="item.id"
          class="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
          :class="props.activeTabId === item.id ? 'bg-accented text-highlighted' : 'text-muted hover:bg-accented/60'"
          :title="item.title"
          @click="emit('activate', item.id)"
        >
          <UIcon :name="item.icon || 'i-lucide-panel-top'" class="size-3.5" />
          <span class="max-w-36 truncate">{{ displayWorkspaceTabTitle(item) }}</span>
          <button class="text-muted hover:text-foreground" @click.stop="emit('close', item.id)">
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </button>
      </div>
    </div>

    <div class="ml-2 flex shrink-0 items-center gap-1 border-l border-default pl-2">
      <UDropdownMenu
        :items="createTabMenuItems"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
        :ui="{ content: 'w-40 p-1' }"
      >
        <button
          type="button"
          class="flex h-6 shrink-0 items-center justify-center rounded-md px-2 text-muted transition hover:bg-accented/60 hover:text-highlighted"
          aria-label="Create tab"
          title="Create tab"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
        </button>
      </UDropdownMenu>
    </div>
  </div>
</template>
