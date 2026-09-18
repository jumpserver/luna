<script setup lang="ts">
import type { AlertTarget, DiffWindow, EditorTab, SaveConflict } from "./sftpIdeShared";
import SftpIdeDiffView from "./SftpIdeDiffView.vue";

defineProps<{
  renameOpen: boolean;
  renameValue: string;
  renameError: string;
  renameLoading: boolean;
  renameDisabled: boolean;
  alertOpen: boolean;
  alertTarget: AlertTarget | null;
  alertTitle: string;
  alertDescription: string;
  alertSubmitting: boolean;
  tabCloseOpen: boolean;
  tabCloseCount: number;
  tabCloseDirtyCount: number;
  tabCloseSubmitting: boolean;
  localChangesOpen: boolean;
  localChangeTab: EditorTab | null;
  localChangeComparison: DiffWindow | null;
  localChangeStats: { added: number; removed: number };
  saveConflict: SaveConflict | null;
  conflictComparison: DiffWindow | null;
  conflictSubmitting: boolean;
  workspaceCloseOpen: boolean;
  dirtyTabCount: number;
  saveAllRunning: boolean;
}>();

const emit = defineEmits<{
  "update:renameOpen": [value: boolean];
  "update:renameValue": [value: string];
  "update:alertOpen": [value: boolean];
  "update:tabCloseOpen": [value: boolean];
  "update:localChangesOpen": [value: boolean];
  "update:workspaceCloseOpen": [value: boolean];
  renameConfirm: [];
  alertConfirm: [];
  saveAndCloseTab: [];
  saveAndCloseTabs: [];
  discardAndCloseTabs: [];
  clearTabCloseTargets: [];
  saveLocalChange: [];
  closeConflict: [];
  reloadConflict: [];
  overwriteConflict: [];
  resolveWorkspaceClose: [confirmed: boolean];
  saveAllAndClose: [];
  discardAllAndClose: [];
}>();

const { t } = useI18n();
</script>

<template>
  <ModalPromptDialog
    :open="renameOpen"
    :model-value="renameValue"
    :title="t('koko.sftpEditor.renamePrompt')"
    :confirm-label="t('koko.actions.rename')"
    :error="renameError"
    :loading="renameLoading"
    :disabled="renameDisabled"
    @update:open="emit('update:renameOpen', $event)"
    @update:model-value="emit('update:renameValue', $event)"
    @confirm="emit('renameConfirm')"
  />
  <ModalAlertDialog
    v-if="alertTarget?.kind === 'delete'"
    :open="alertOpen"
    :title="alertTitle"
    :description="alertDescription"
    :confirm-label="alertTitle"
    confirm-color="error"
    :loading="alertSubmitting"
    @update:open="emit('update:alertOpen', $event)"
    @confirm="emit('alertConfirm')"
  />
  <UModal
    v-else
    :open="alertOpen"
    :title="alertTitle"
    :description="alertDescription"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
    @update:open="emit('update:alertOpen', $event)"
  >
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="alertSubmitting" @click="emit('update:alertOpen', false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-save"
        :loading="alertSubmitting"
        @click="emit('saveAndCloseTab')"
      >
        {{ t("koko.sftpEditor.saveAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" :disabled="alertSubmitting" @click="emit('alertConfirm')">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    :open="tabCloseOpen"
    :title="t('koko.sftpEditor.closeTabsTitle', { count: tabCloseCount })"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
    @update:open="emit('update:tabCloseOpen', $event)"
  >
    <template #body>
      <p class="text-sm text-(--app-muted)">
        {{ t("koko.sftpEditor.closeTabsConfirm", { count: tabCloseCount, dirty: tabCloseDirtyCount }) }}
      </p>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :disabled="tabCloseSubmitting"
        @click="
          emit('update:tabCloseOpen', false);
          emit('clearTabCloseTargets');
        "
      >
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-save"
        :loading="tabCloseSubmitting"
        @click="emit('saveAndCloseTabs')"
      >
        {{ t("koko.sftpEditor.saveAllAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" :disabled="tabCloseSubmitting" @click="emit('discardAndCloseTabs')">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    :open="localChangesOpen"
    :title="t('koko.sftpEditor.localChangesTitle', { name: localChangeTab?.entry.name || '' })"
    :ui="{ content: 'max-w-6xl', body: 'min-h-0', footer: 'justify-end gap-2' }"
    @update:open="emit('update:localChangesOpen', $event)"
  >
    <template #body>
      <div v-if="localChangeTab && localChangeComparison" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <UBadge
            color="success"
            variant="subtle"
            :label="t('koko.sftpEditor.addedLines', { count: localChangeStats.added })"
          />
          <UBadge
            color="error"
            variant="subtle"
            :label="t('koko.sftpEditor.removedLines', { count: localChangeStats.removed })"
          />
          <UBadge
            v-if="localChangeTab.encoding !== localChangeTab.savedEncoding"
            color="warning"
            variant="subtle"
            :label="
              t('koko.sftpEditor.encodingChanged', {
                before: localChangeTab.savedEncoding,
                after: localChangeTab.encoding
              })
            "
          />
          <UBadge
            v-if="localChangeTab.lineEnding !== localChangeTab.savedLineEnding"
            color="warning"
            variant="subtle"
            :label="
              t('koko.sftpEditor.lineEndingChanged', {
                before: localChangeTab.savedLineEnding,
                after: localChangeTab.lineEnding
              })
            "
          />
        </div>
        <SftpIdeDiffView
          v-if="localChangeStats.added || localChangeStats.removed"
          :local-title="t('koko.sftpEditor.savedVersion')"
          :remote-title="t('koko.sftpEditor.currentVersion')"
          local-icon="i-lucide-history"
          remote-icon="i-lucide-pencil-line"
          :comparison="localChangeComparison"
        />
        <div v-else class="grid h-32 place-items-center text-sm text-(--app-muted)">
          {{ t("koko.sftpEditor.onlyFilePropertiesChanged") }}
        </div>
        <p v-if="localChangeComparison.truncated" class="text-xs text-(--app-muted)">
          {{ t("koko.sftpEditor.diffTruncated") }}
        </p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="emit('update:localChangesOpen', false)">
        {{ t("Common.Close") }}
      </UButton>
      <UButton color="primary" icon="i-lucide-save" :loading="localChangeTab?.saving" @click="emit('saveLocalChange')">
        {{ t("koko.actions.save") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    :open="Boolean(saveConflict)"
    :title="t('koko.sftpEditor.saveConflictTitle')"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-6xl', body: 'min-h-0', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-(--app-muted)">
          {{
            saveConflict?.remoteEntry
              ? t("koko.sftpEditor.saveConflictChanged", { name: saveConflict.tab.entry.name })
              : t("koko.sftpEditor.saveConflictDeleted", { name: saveConflict?.tab.entry.name || "" })
          }}
        </p>
        <div v-if="saveConflict?.loading" class="grid h-48 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </div>
        <SftpIdeDiffView
          v-else-if="saveConflict?.remoteEntry && conflictComparison"
          :local-title="t('koko.sftpEditor.yourChanges')"
          :remote-title="t('koko.sftpEditor.remoteChanges')"
          local-icon="i-lucide-laptop"
          remote-icon="i-lucide-server"
          :comparison="conflictComparison"
        />
        <p v-if="conflictComparison?.truncated" class="text-xs text-(--app-muted)">
          {{ t("koko.sftpEditor.diffTruncated") }}
        </p>
        <p v-if="saveConflict?.error" class="text-xs text-error">{{ saveConflict.error }}</p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="conflictSubmitting" @click="emit('closeConflict')">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        v-if="saveConflict?.remoteEntry"
        color="neutral"
        variant="soft"
        :loading="conflictSubmitting"
        @click="emit('reloadConflict')"
      >
        {{ t("koko.sftpEditor.reloadRemote") }}
      </UButton>
      <UButton color="error" variant="soft" :loading="conflictSubmitting" @click="emit('overwriteConflict')">
        {{ saveConflict?.remoteEntry ? t("koko.sftpEditor.keepMine") : t("koko.sftpEditor.recreateRemote") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    :open="workspaceCloseOpen"
    :title="t('koko.sftpEditor.unsavedWorkspaceTitle')"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
    @update:open="emit('update:workspaceCloseOpen', $event)"
  >
    <template #body>
      <p class="text-sm text-(--app-muted)">
        {{ t("koko.sftpEditor.unsavedWorkspaceCloseConfirm", { count: dirtyTabCount }) }}
      </p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="emit('resolveWorkspaceClose', false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-layers-2"
        :loading="saveAllRunning"
        @click="emit('saveAllAndClose')"
      >
        {{ t("koko.sftpEditor.saveAllAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" @click="emit('discardAllAndClose')">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
</template>
