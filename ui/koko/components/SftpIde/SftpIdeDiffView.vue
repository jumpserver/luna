<script setup lang="ts">
import type { DiffWindow } from "./sftpIdeShared";

defineProps<{
  localTitle: string;
  remoteTitle: string;
  localIcon: string;
  remoteIcon: string;
  comparison: DiffWindow;
}>();
</script>

<template>
  <div class="grid min-h-0 gap-3 md:grid-cols-2">
    <section class="min-w-0 overflow-hidden rounded-md border border-error/25">
      <header class="flex h-8 items-center gap-2 border-b border-error/25 bg-error/10 px-3 text-xs font-medium">
        <UIcon :name="localIcon" class="size-3.5 text-error" />
        {{ localTitle }}
      </header>
      <div class="max-h-[58vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
        <div
          v-for="line in comparison.local"
          :key="line.number"
          class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
          :class="line.changed ? 'bg-error/10' : ''"
        >
          <span class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)">
            {{ line.number }}
          </span>
          <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
        </div>
      </div>
    </section>
    <section class="min-w-0 overflow-hidden rounded-md border border-success/25">
      <header class="flex h-8 items-center gap-2 border-b border-success/25 bg-success/10 px-3 text-xs font-medium">
        <UIcon :name="remoteIcon" class="size-3.5 text-success" />
        {{ remoteTitle }}
      </header>
      <div class="max-h-[58vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
        <div
          v-for="line in comparison.remote"
          :key="line.number"
          class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
          :class="line.changed ? 'bg-success/10' : ''"
        >
          <span class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)">
            {{ line.number }}
          </span>
          <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
