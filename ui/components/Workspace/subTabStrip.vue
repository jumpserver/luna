<script setup lang="ts">
export interface WorkspaceSubTab {
  id: string
  label: string
  icon: string
  title?: string
  dirty?: boolean
}

defineProps<{
  tabs: WorkspaceSubTab[]
  activeId: string
}>();

defineEmits<{
  select: [id: string]
  close: [id: string]
}>();
</script>

<template>
  <div
    v-if="tabs.length"
    class="workspace-sub-tab-bar shrink-0 bg-transparent px-2 py-1.5"
  >
    <div class="workspace-sub-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-lg p-px">
      <div class="workspace-sub-tab-strip flex w-fit min-w-0 max-w-full items-center gap-0.5 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="workspace-sub-tab-button group relative flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-left transition-all duration-150"
          :class="[
            activeId === tab.id ? 'max-w-72 px-2.5' : 'max-w-44',
            activeId === tab.id
              ? 'workspace-sub-tab-button-active text-[var(--app-fg)]'
              : 'text-[var(--app-muted)] hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]'
          ]"
          :title="tab.title || tab.label"
          @click="$emit('select', tab.id)"
        >
          <UIcon
            :name="tab.icon"
            class="size-3.5 shrink-0"
            :class="activeId === tab.id ? 'text-primary' : 'text-[var(--app-muted)] group-hover:text-[var(--app-fg)]'"
          />
          <span class="min-w-0 truncate font-ui-mono text-[11px] tracking-[0.01em]">{{ tab.label }}</span>
          <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-primary" title="未保存" />
          <span
            class="flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-[var(--app-hover-strong)] group-hover:opacity-100"
            :class="activeId === tab.id ? 'opacity-60' : ''"
            @click.stop="$emit('close', tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-sub-tab-capsule {
  background-color: color-mix(in srgb, var(--workspace-surface-sub-panel) 38%, transparent);
  backdrop-filter: blur(8px);
}

.workspace-sub-tab-button-active {
  background-color: color-mix(in srgb, var(--workspace-surface-sub-tab-active) 72%, transparent);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-fg) 8%, transparent);
}

.workspace-sub-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-sub-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
