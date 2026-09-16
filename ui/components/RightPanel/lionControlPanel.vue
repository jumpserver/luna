<script setup lang="ts">
import type { LionWorkspaceSessionController } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";
import { useDebounceFn } from "@vueuse/core";
import { readClipboardText } from "@/lion/utils/clipboard";
import { getLionWorkspaceSession } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";

const { t } = useI18n();
const toast = useToast();
const { activePaneId, activeTab } = useWorkspaceTabs();

const activeSessionId = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value)?.id || tab?.id || "";
});
const controller = computed(() => getLionWorkspaceSession(activeSessionId.value));
const actionPermission = computed(() => controller.value?.actionPermission.value || {});
const pasteDisabled = computed(
  () =>
    !controller.value?.hasClipboardPermission.value ||
    !actionPermission.value.enable_paste ||
    actionPermission.value.clipboard_policy?.paste?.enabled === false
);
const copyDisabled = computed(
  () => !controller.value?.hasClipboardPermission.value || !actionPermission.value.enable_copy
);
const clipboardLimit = computed(() => {
  const limit = controller.value?.clipboardPasteTextLimit.value || 0;
  return limit > 0 ? limit : undefined;
});
const clipboardDraft = computed({
  get: () => controller.value?.clipboardDraft.value || "",
  set: (value: string) => updateClipboardDraft(value)
});
const clipboardLength = computed(() => Array.from(clipboardDraft.value).length);
const autoFit = computed(() => Boolean(controller.value?.autoFit.value));
const fitPercentage = computed(() => controller.value?.fitPercentage.value || 100);
const showRemoteClipboard = computed(() => Boolean(controller.value?.showRemoteClipboard.value));

const sendClipboardText = useDebounceFn((target: LionWorkspaceSessionController, text: string) => {
  target.sendClipboardText(text);
}, 300);

function updateClipboardDraft(value: string | number) {
  const target = controller.value;
  if (!target) return;
  const text = String(value);
  const limit = target.clipboardPasteTextLimit.value;
  if (limit && Array.from(text).length > limit) {
    toast.add({ title: t("RightPanel.ClipboardLimitExceeded", { limit }), color: "warning" });
    return;
  }
  target.clipboardDraft.value = text;
  sendClipboardText(target, text);
}

async function pasteLocalClipboard() {
  const target = controller.value;
  if (!target || pasteDisabled.value) return;
  try {
    const text = await readClipboardText();
    updateClipboardDraft(text);
  } catch (error) {
    console.debug("Unable to read clipboard", error);
  }
}

function setShowRemoteClipboard(value: boolean) {
  if (controller.value) controller.value.showRemoteClipboard.value = value;
}
</script>

<template>
  <div v-if="controller" class="flex h-full min-h-0 flex-col overflow-y-auto p-3">
    <section class="space-y-2.5 border-b border-default pb-3">
      <div class="flex items-center gap-2 text-xs font-semibold text-highlighted">
        <UIcon name="i-lucide-clipboard" class="size-3.5 text-primary" />
        <span>{{ t("RightPanel.Clipboard") }}</span>
        <UButton
          class="ml-auto"
          icon="i-lucide-clipboard-paste"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pasteDisabled"
          :aria-label="t('RightPanel.PasteClipboard')"
          :title="t('RightPanel.PasteClipboard')"
          @click="pasteLocalClipboard"
        />
      </div>

      <UTextarea
        v-model="clipboardDraft"
        :rows="3"
        autoresize
        :maxlength="clipboardLimit"
        :disabled="pasteDisabled"
        :placeholder="t('RightPanel.ClipboardPlaceholder')"
        class="w-full"
      />
      <div class="flex items-center justify-between gap-3 text-[11px] text-muted">
        <span>{{ t("RightPanel.ClipboardLength") }}</span>
        <span>
          {{ clipboardLength }}
          <template v-if="clipboardLimit">/ {{ clipboardLimit }}</template>
        </span>
      </div>

      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-highlighted">{{ t("RightPanel.ShowRemoteClipboard") }}</span>
        <USwitch
          :model-value="showRemoteClipboard"
          :disabled="copyDisabled"
          @update:model-value="setShowRemoteClipboard"
        />
      </div>
      <UTextarea
        v-if="showRemoteClipboard"
        :model-value="controller.remoteClipboardText.value"
        :rows="3"
        autoresize
        readonly
        :disabled="copyDisabled"
        class="w-full"
      />
    </section>

    <section class="space-y-3 pt-3">
      <div class="flex items-center gap-2 text-xs font-semibold text-highlighted">
        <UIcon name="i-lucide-scan" class="size-3.5 text-primary" />
        <span>{{ t("RightPanel.DisplayControl") }}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-highlighted">{{ t("RightPanel.AutoFit") }}</span>
        <USwitch :model-value="autoFit" @update:model-value="controller.setAutoFit" />
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted">{{ t("RightPanel.Scale") }}</span>
        <div class="flex items-center gap-1.5">
          <UButton
            icon="i-lucide-minus"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="fitPercentage <= 10"
            :aria-label="t('RightPanel.ZoomOut')"
            @click="controller.setScalePercentage(fitPercentage - 5)"
          />
          <span class="w-12 text-center font-ui-mono text-xs text-highlighted">{{ fitPercentage }}%</span>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('RightPanel.ZoomIn')"
            @click="controller.setScalePercentage(fitPercentage + 5)"
          />
        </div>
      </div>
    </section>
  </div>

  <div v-else class="grid h-full place-items-center px-4 text-center">
    <UEmpty
      icon="i-lucide-monitor"
      size="sm"
      variant="naked"
      :title="t('RightPanel.LionUnavailableTitle')"
      :description="t('RightPanel.LionUnavailableDescription')"
    />
  </div>
</template>
