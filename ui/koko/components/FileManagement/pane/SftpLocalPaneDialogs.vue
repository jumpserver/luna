<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

defineProps<{
  promptTitle: string;
  promptConfirmLabel: string;
  promptDisabled: boolean;
  alertEntries: SftpFileEntry[];
}>();

const emit = defineEmits<{
  chooseFolder: [];
  resetRoot: [];
  submitPrompt: [];
  confirmDelete: [];
}>();

const setupOpen = defineModel<boolean>("setupOpen", { required: true });
const promptOpen = defineModel<boolean>("promptOpen", { required: true });
const promptName = defineModel<string>("promptName", { required: true });
const alertOpen = defineModel<boolean>("alertOpen", { required: true });
const { t } = useI18n();
</script>

<template>
  <UModal v-model:open="setupOpen" :title="t('koko.localFile.title')" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-3 text-sm text-muted">
        <p>{{ t("koko.localFile.setupDescription") }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="void (setupOpen = false)">
          {{ t("koko.actions.close") }}
        </UButton>
        <UButton color="neutral" variant="soft" icon="i-lucide-house" @click="void emit('resetRoot')">
          {{ t("koko.localFile.resetDefault") }}
        </UButton>
        <UButton color="primary" icon="i-lucide-folder-open" @click="void emit('chooseFolder')">
          {{ t("koko.localFile.chooseFolder") }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="promptOpen" :title="promptTitle" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <UInput v-model="promptName" autofocus @keydown.enter.prevent="!promptDisabled && emit('submitPrompt')" />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="void (promptOpen = false)">
          {{ t("koko.actions.cancel") }}
        </UButton>
        <UButton color="primary" :disabled="promptDisabled" @click="void emit('submitPrompt')">
          {{ promptConfirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="alertOpen" :title="t('koko.actions.delete')" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <p class="text-sm text-muted">
        {{
          alertEntries.length === 1
            ? t("koko.fileManagement.deleteConfirm", { name: alertEntries[0]?.name })
            : `${t("koko.actions.delete")} ${t("koko.fileManagement.items", { count: alertEntries.length })}?`
        }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="void (alertOpen = false)">
          {{ t("koko.actions.cancel") }}
        </UButton>
        <UButton color="error" @click="void emit('confirmDelete')">{{ t("koko.actions.delete") }}</UButton>
      </div>
    </template>
  </UModal>
</template>
