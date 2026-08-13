<script setup lang="ts">
import type { ChenSqlSnippet } from "~/chen/composables/useChenSqlSnippets";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
  snippets: ChenSqlSnippet[];
  loading: boolean;
  deletingId: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  insert: [snippet: ChenSqlSnippet];
  delete: [snippet: ChenSqlSnippet];
}>();

const deleteDialogOpen = ref(false);
const deleteCandidate = ref<ChenSqlSnippet | null>(null);
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});

function requestDelete(snippet: ChenSqlSnippet) {
  deleteCandidate.value = snippet;
  deleteDialogOpen.value = true;
}

function cancelDelete() {
  deleteDialogOpen.value = false;
}

function confirmDelete() {
  if (!deleteCandidate.value) return;
  emit("delete", deleteCandidate.value);
  deleteDialogOpen.value = false;
  deleteCandidate.value = null;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Select SQL" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div v-if="loading" class="grid min-h-32 place-items-center text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>

      <div v-else-if="!snippets.length" class="grid min-h-32 place-items-center text-sm text-muted">No saved SQL.</div>

      <div v-else class="max-h-[60vh] overflow-auto rounded-md border border-default">
        <table class="w-full table-fixed text-left text-sm">
          <thead class="sticky top-0 bg-elevated text-muted">
            <tr>
              <th class="w-36 px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Content</th>
              <th class="w-36 px-3 py-2" />
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="snippet in snippets" :key="snippet.id" class="hover:bg-elevated/60">
              <td class="truncate px-3 py-2" :title="snippet.name">
                {{ snippet.name }}
              </td>
              <td class="truncate px-3 py-2 font-mono text-xs text-muted" :title="snippet.args">
                {{ snippet.args }}
              </td>
              <td class="px-3 py-2">
                <div class="flex justify-end gap-1">
                  <UButton size="xs" variant="ghost" @click="emit('insert', snippet)">Insert</UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    :loading="deletingId === snippet.id"
                    :disabled="Boolean(deletingId)"
                    @click="requestDelete(snippet)"
                  >
                    Delete
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </ChenWorkspaceModal>

  <ChenWorkspaceModal v-model:open="deleteDialogOpen" title="Delete SQL">
    <template #body>
      <p class="text-sm text-muted">Delete “{{ deleteCandidate?.name }}”?</p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="cancelDelete">Cancel</UButton>
        <UButton color="error" @click="confirmDelete">Confirm</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
