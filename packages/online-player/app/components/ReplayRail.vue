<script setup lang="ts">
import type { ReplayCommand, ReplayPartItem } from "#online-player/types";
import type { ReplayRailTab } from "#online-player/utils/replay";
import { initialRailTab } from "#online-player/utils/replay";

const props = defineProps<{
  commands: ReplayCommand[];
  parts: ReplayPartItem[];
  showParts?: boolean;
  activeCommandOffset?: number;
  activePartSrc?: string;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  selectCommand: [ReplayCommand];
  selectPart: [ReplayPartItem];
  loadMore: [];
  retry: [];
}>();

const { t } = useI18n();
const query = ref("");
const bodyRef = ref<HTMLElement | null>(null);
const tab = ref<ReplayRailTab>(initialRailTab(Boolean(props.showParts)));

watch(
  () => props.showParts,
  (hasParts) => {
    tab.value = initialRailTab(Boolean(hasParts));
  }
);

const filteredCommands = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return props.commands;
  return props.commands.filter((item) => item.input.toLowerCase().includes(keyword));
});

const activeTab = computed(() => (props.showParts ? tab.value : "commands"));
const count = computed(() => (activeTab.value === "parts" ? props.parts.length : filteredCommands.value.length));

useInfiniteScroll(
  bodyRef,
  () => {
    if (activeTab.value === "commands") emit("loadMore");
  },
  { distance: 80 }
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--replay-panel)]" data-replay-rail>
    <div class="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--replay-border)] px-3.5">
      <template v-if="showParts">
        <UButton
          size="xs"
          color="neutral"
          :variant="activeTab === 'parts' ? 'soft' : 'ghost'"
          :label="t('Replay.Playlist')"
          data-rail-tab="parts"
          @click="tab = 'parts'"
        />
        <UButton
          size="xs"
          color="neutral"
          :variant="activeTab === 'commands' ? 'soft' : 'ghost'"
          :label="t('Replay.HistoryCommands')"
          data-rail-tab="commands"
          @click="tab = 'commands'"
        />
      </template>
      <span v-else class="text-[11.5px] font-bold tracking-[0.05em] text-[var(--replay-fg)] uppercase">
        {{ t("Replay.HistoryCommands") }}
      </span>
      <span
        class="rounded-sm bg-[var(--replay-chip)] px-1.5 py-0.5 font-mono text-[10.5px] tabular text-[var(--replay-muted)]"
      >
        {{ count }}
      </span>
    </div>

    <div v-if="activeTab === 'commands' && !error" class="border-b border-[var(--replay-border)] p-3">
      <UInput v-model="query" size="sm" icon="i-lucide-search" :placeholder="t('Replay.SearchCommands')" />
    </div>

    <div ref="bodyRef" class="min-h-0 flex-1 overflow-y-auto p-1">
      <div v-if="loading" class="grid place-items-center py-10">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
      </div>

      <div v-else-if="activeTab === 'commands' && error" class="grid place-items-center px-4 py-10">
        <UEmpty
          icon="i-lucide-circle-alert"
          size="sm"
          variant="naked"
          :title="t('Replay.CommandsFailed')"
          :description="error || t('Replay.CommandsFailedHint')"
        >
          <template #actions>
            <UButton
              color="primary"
              size="xs"
              icon="i-lucide-refresh-cw"
              :label="t('Replay.Reload')"
              @click="emit('retry')"
            />
          </template>
        </UEmpty>
      </div>

      <div v-else-if="activeTab === 'parts'" class="flex flex-col gap-0.5 p-1">
        <button
          v-for="(item, index) in parts"
          :key="item.src || item.name"
          type="button"
          class="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors"
          :class="
            item.src === activePartSrc
              ? 'bg-[color-mix(in_srgb,var(--ui-color-primary-500)_10%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--ui-color-primary-500)_35%,transparent)]'
              : 'hover:bg-[var(--replay-hover)]'
          "
          @click="emit('selectPart', item)"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-md font-mono text-sm font-semibold"
            :class="
              item.src === activePartSrc
                ? 'bg-primary text-[var(--app-accent-foreground)]'
                : 'bg-[var(--replay-chip)] text-[var(--replay-muted)]'
            "
          >
            {{ index + 1 }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium text-[var(--replay-fg)]">{{ item.name }}</span>
            <span class="mt-0.5 block font-mono text-[10.5px] tabular text-[var(--replay-muted)]">
              {{ item.durationLabel }} · {{ item.sizeLabel }}
            </span>
          </span>
        </button>
      </div>

      <div v-else-if="filteredCommands.length > 0" class="flex flex-col py-1">
        <UTooltip
          v-for="item in filteredCommands"
          :key="item.id || `${item.timestamp}-${item.input}`"
          :text="item.input"
          :content="{ side: 'left' }"
        >
          <button
            type="button"
            class="replay-command flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left"
            :class="item.offsetMs === activeCommandOffset ? 'is-active' : 'hover:bg-[var(--replay-hover)]'"
            @click="emit('selectCommand', item)"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--replay-fg)]">
              {{ item.input }}
            </span>
            <span class="shrink-0 font-mono text-[10.5px] tabular text-[var(--replay-muted)]">{{ item.atime }}</span>
          </button>
        </UTooltip>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-list"
        size="sm"
        variant="naked"
        :title="t('Replay.NoCommands')"
        :description="t('Replay.NoCommandsHint')"
      />
    </div>
  </div>
</template>
