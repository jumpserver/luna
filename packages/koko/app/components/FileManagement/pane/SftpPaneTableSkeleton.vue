<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
    rows?: number;
  }>(),
  { compact: false, rows: 10 }
);
</script>

<template>
  <div
    class="sftp-file-table sftp-file-table--skeleton flex h-full min-h-0 flex-col"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="sftp-file-table__head-wrap shrink-0">
      <table class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col class="w-10" />
          <col />
          <col v-if="!compact" class="w-42" />
          <col :class="compact ? 'w-22' : 'w-27.5'" />
          <col v-if="!compact" class="w-24" />
        </colgroup>
        <thead class="sftp-file-table__head">
          <tr>
            <th class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-2" />
            <th class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2">
              <USkeleton class="h-2.5 w-10" />
            </th>
            <th v-if="!compact" class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2">
              <USkeleton class="ml-auto h-2.5 w-14" />
            </th>
            <th class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2">
              <USkeleton class="ml-auto h-2.5 w-8" />
            </th>
            <th v-if="!compact" class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2">
              <USkeleton class="ml-auto h-2.5 w-10" />
            </th>
          </tr>
        </thead>
      </table>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <table class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col class="w-10" />
          <col />
          <col v-if="!compact" class="w-42" />
          <col :class="compact ? 'w-22' : 'w-27.5'" />
          <col v-if="!compact" class="w-24" />
        </colgroup>
        <tbody>
          <tr v-for="row in rows" :key="row" class="sftp-file-table__skeleton-row">
            <td class="h-9.5 border-b border-(--app-border)/60 px-3 py-1.5 text-center">
              <USkeleton class="mx-auto size-3.5 rounded-sm" />
            </td>
            <td class="h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5">
              <div class="flex items-center gap-2">
                <USkeleton class="size-4 shrink-0 rounded-sm" />
                <USkeleton
                  class="h-3 rounded-sm"
                  :class="row % 3 === 0 ? 'w-2/5' : row % 2 === 0 ? 'w-3/5' : 'w-1/2'"
                />
              </div>
            </td>
            <td v-if="!compact" class="h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5">
              <USkeleton class="ml-auto h-3 w-20 rounded-sm" />
            </td>
            <td class="h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5">
              <USkeleton class="ml-auto h-3 w-10 rounded-sm" />
            </td>
            <td v-if="!compact" class="h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5">
              <USkeleton class="ml-auto h-3 w-12 rounded-sm" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
