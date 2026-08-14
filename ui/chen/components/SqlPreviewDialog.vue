<script setup lang="ts">
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    sql: string;
    confirmLabel: string;
    dangerMessage?: string;
    danger?: boolean;
    busy?: boolean;
  }>(),
  {
    description: "Review the SQL that will be executed against the database.",
    dangerMessage: "",
    danger: false,
    busy: false
  }
);

const emit = defineEmits<{
  confirm: [];
  "update:open": [open: boolean];
}>();
</script>

<template>
  <ChenWorkspaceModal :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-3 p-4 text-sm">
        <p class="text-muted">{{ description }}</p>
        <p v-if="dangerMessage" class="rounded-md bg-error/10 p-3 text-error">{{ dangerMessage }}</p>
        <pre class="max-h-[55vh] overflow-auto rounded-md bg-elevated p-3 text-xs text-muted">{{ sql }}</pre>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="emit('update:open', false)">Cancel</UButton>
        <UButton
          :color="danger ? 'error' : 'primary'"
          :loading="busy"
          icon="i-lucide-database-zap"
          :disabled="!sql"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
