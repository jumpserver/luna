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
const detailsOpen = ref(false);
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
  if (!props.tab.payload?.scriptId && !detailsOpen.value) {
    detailsOpen.value = true;
    return;
  }
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
    <ScriptEditor v-model="args" :module="module" class="min-h-0 flex-1" @save="submit" />
    <footer class="flex h-10 shrink-0 items-center gap-1.5 border-t border-[var(--app-border)] px-2.5">
      <template v-if="detailsOpen">
        <UInput v-model="name" autofocus size="xs" class="min-w-32 max-w-52 flex-1" :placeholder="t('Snippets.Name')" />
        <USelect v-model="module" size="xs" class="w-32" :items="moduleItems" />
        <UInput v-model="comment" size="xs" class="min-w-32 max-w-64 flex-1" :placeholder="t('Snippets.Comment')" />
      </template>
      <div class="flex-1" />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis"
        :label="t('Snippets.More')"
        @click="detailsOpen = !detailsOpen"
      />
      <UButton
        size="xs"
        icon="i-lucide-save"
        :label="t('Snippets.Save')"
        :loading="saving"
        :disabled="!dirty || !args.trim()"
        @click="submit"
      />
    </footer>
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
