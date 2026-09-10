<script setup lang="ts">
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = withDefaults(
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
    description: "",
    dangerMessage: "",
    danger: false,
    busy: false
  }
);

const emit = defineEmits<{
  confirm: [];
  "update:open": [open: boolean];
}>();

const { t } = useI18n();
const displayDescription = computed(() => props.description || t("Chen.SqlPreviewDescription"));
</script>

<template>
  <ChenWorkspaceModal :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-3 p-4 text-sm">
        <p class="text-muted">{{ displayDescription }}</p>
        <p v-if="dangerMessage" class="rounded-md bg-error/10 p-3 text-error">{{ dangerMessage }}</p>
        <pre class="max-h-[55vh] overflow-auto rounded-md bg-elevated p-3 text-xs text-muted">{{ sql }}</pre>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="emit('update:open', false)">
          {{ t("Common.Cancel") }}
        </UButton>
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
