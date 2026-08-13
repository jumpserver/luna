<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { save } = useSnippets();
const { getTabById, renameTabTitle } = useWorkspaceTabs();
const name = ref(String(props.tab.payload?.name || ""));
const args = ref(String(props.tab.payload?.args || ""));
const module = ref(String(props.tab.payload?.module || "shell"));
const comment = ref(String(props.tab.payload?.comment || ""));
const savedSnapshot = ref("");
const saving = ref(false);
const discardModalOpen = ref(false);
let resolveDiscard: ((discard: boolean) => void) | undefined;
const moduleItems = [
  { label: "Shell", value: "shell" },
  { label: "PowerShell", value: "win_shell" },
  { label: "Python", value: "python" },
  { label: "Raw", value: "raw" }
];
const snapshot = computed(() => JSON.stringify([name.value, args.value, module.value, comment.value]));
const dirty = computed(() => snapshot.value !== savedSnapshot.value);
savedSnapshot.value = snapshot.value;

watch([dirty, name], ([hasChanges, currentName]) => {
  renameTabTitle(props.tab.id, `${hasChanges ? "● " : ""}${currentName.trim() || "Untitled script"}`);
});

async function submit() {
  const nextName = name.value.trim();
  if (!nextName || !args.value.trim() || saving.value) return;
  saving.value = true;
  try {
    const result = await save(
      { name: nextName, args: args.value, module: module.value, comment: comment.value.trim() },
      props.tab.payload?.scriptId
    );
    const scriptId = String((result as { id?: unknown } | null)?.id || props.tab.payload?.scriptId || "");
    name.value = nextName;
    const nextPayload = {
      ...props.tab.payload,
      scriptId: scriptId || undefined,
      name: nextName,
      args: args.value,
      module: module.value,
      comment: comment.value.trim()
    };
    const workspaceTab = getTabById(props.tab.id);
    if (workspaceTab) {
      workspaceTab.payload = nextPayload;
      if (workspaceTab.panes[0]) workspaceTab.panes[0].payload = nextPayload;
    }
    renameTabTitle(props.tab.id, nextName);
    savedSnapshot.value = snapshot.value;
  } catch (error) {
    addErrorToast({ title: t("Snippets.SaveFailed"), error, icon: "i-lucide-circle-alert" });
  } finally {
    saving.value = false;
  }
}

function confirmDiscard() {
  if (!dirty.value) return true;
  discardModalOpen.value = true;
  return new Promise<boolean>((resolve) => {
    resolveDiscard = resolve;
  });
}

function finishDiscard(discard: boolean) {
  discardModalOpen.value = false;
  resolveDiscard?.(discard);
  resolveDiscard = undefined;
}

const unregisterCloseGuard = registerWorkspaceSessionCloseGuard(props.tab.id, confirmDiscard);
onBeforeUnmount(unregisterCloseGuard);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-background)]">
    <header class="flex shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-3 py-2">
      <UInput v-model="name" class="min-w-40 flex-1" :placeholder="t('Snippets.Name')" />
      <USelect v-model="module" class="w-36" :items="moduleItems" />
      <UInput v-model="comment" class="min-w-40 flex-1" :placeholder="t('Snippets.Comment')" />
      <UButton
        icon="i-lucide-save"
        :label="t('Snippets.Save')"
        :loading="saving"
        :disabled="!dirty || !name.trim() || !args.trim()"
        @click="submit"
      />
    </header>
    <ScriptEditor v-model="args" :module="module" class="min-h-0 flex-1" @save="submit" />
  </div>

  <Modal
    :open="discardModalOpen"
    :title="t('Snippets.DiscardTitle')"
    :description="t('Snippets.DiscardChanges')"
    confirm-color="error"
    :confirm-label="t('Snippets.Discard')"
    @confirm="finishDiscard(true)"
    @update:open="finishDiscard(false)"
  />
</template>
