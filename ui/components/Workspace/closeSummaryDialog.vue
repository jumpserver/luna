<script setup lang="ts">
import { workspaceCloseSummary } from "~/composables/useWorkspaceTabs";

const { t } = useI18n();
onBeforeUnmount(() => workspaceCloseSummary.value?.finish(false));
</script>

<template>
  <UModal
    :open="!!workspaceCloseSummary"
    :title="t('Chen.GoV1ConfirmCloseTabs')"
    :description="t('Chen.CloseSummaryDescription', { total: workspaceCloseSummary?.tabCount || 0 })"
    :ui="{ content: 'max-w-lg', body: 'max-h-[50vh] overflow-y-auto', footer: 'justify-end gap-2' }"
    @update:open="!$event && workspaceCloseSummary?.finish(false)"
  >
    <template #body>
      <ul class="space-y-3">
        <li v-for="item in workspaceCloseSummary?.items" :key="item.id">
          <div class="font-medium break-words">{{ item.title }}</div>
          <p v-for="message in item.messages" :key="message" class="text-sm text-muted">{{ message }}</p>
        </li>
      </ul>
    </template>
    <template #footer>
      <UButton autofocus color="neutral" variant="soft" @click="workspaceCloseSummary?.finish(false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton color="error" @click="workspaceCloseSummary?.finish(true)">
        {{ t("Chen.GoV1ConfirmDiscardClose") }}
      </UButton>
    </template>
  </UModal>
</template>
