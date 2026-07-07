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
    class="workspace-sub-tab-bar shrink-0 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-tab)] px-2 py-1.5"
  >
    <div class="workspace-sub-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-lg p-px">
      <div class="workspace-sub-tab-strip flex w-fit min-w-0 max-w-full items-center gap-0.5 overflow-x-auto">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          type="button"
          class="group relative flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-left transition-all duration-150"
          :class="[
            activeId === tab.id ? 'max-w-72 px-2.5' : 'max-w-44',
            activeId === tab.id
              ? 'bg-[var(--workspace-surface-sub-tab-active)] text-[var(--app-fg)] shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-[var(--workspace-surface-sub-border)]'
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
          <span
            v-if="activeId !== tab.id && index < tabs.length - 1"
            class="pointer-events-none absolute top-1/2 -right-[3px] h-3 -translate-y-1/2 border-r border-[var(--workspace-surface-sub-border)]"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-sub-tab-capsule {
  background-color: color-mix(in srgb, var(--workspace-surface-sub-panel) 72%, var(--workspace-surface-sub-tab) 28%);
  border: 1px solid var(--workspace-surface-sub-border);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--workspace-surface-sub-border) 58%, transparent);
}

.workspace-sub-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-sub-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
