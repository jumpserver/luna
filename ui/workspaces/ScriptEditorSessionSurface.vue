<script setup lang="ts">
import type { ScriptAiProposal, ScriptAiSnapshot } from "~/composables/useScriptAiSessions";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { SnippetVariableDefinition } from "~/utils/snippetVariables";
import {
  registerScriptAiSession,
  SCRIPT_AI_MODULES,
  unregisterScriptAiSession
} from "~/composables/useScriptAiSessions";
import { normalizeSnippetVariableDefinitions, serializeSnippetVariableDefinitions } from "~/utils/snippetVariables";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { save } = useSnippets();
const { getTabById, renameTabTitle } = useWorkspaceTabs();
const { openAi } = useAiPanel();
const toast = useToast();
const name = shallowRef(String(props.tab.payload?.name || ""));
const args = shallowRef(String(props.tab.payload?.args || ""));
const module = shallowRef(String(props.tab.payload?.module || "shell"));
const comment = shallowRef(String(props.tab.payload?.comment || ""));
const scope = shallowRef<"private" | "public">(props.tab.payload?.scope === "public" ? "public" : "private");
const variables = ref<SnippetVariableDefinition[]>(normalizeSnippetVariableDefinitions(props.tab.payload?.variable));
const savedSnapshot = shallowRef("");
const draftRevision = shallowRef(1);
const saving = shallowRef(false);
const detailsOpen = shallowRef(false);
const variablesOpen = shallowRef(false);
const discardModalOpen = shallowRef(false);
let resolveDiscard: ((discard: boolean) => void) | undefined;
const moduleItems = [
  { label: "Shell", value: "shell" },
  { label: "PowerShell", value: "win_shell" },
  { label: "Python", value: "python" },
  { label: "Raw", value: "raw" },
  { label: "MySQL", value: "mysql" },
  { label: "MariaDB", value: "mariadb" },
  { label: "PostgreSQL", value: "postgresql" },
  { label: "SQLServer", value: "sqlserver" },
  { label: "Oracle", value: "oracle" }
];
const scopeItems = computed(() => [
  { label: t("Snippets.ScopePrivate"), value: "private" },
  { label: t("Snippets.ScopePublic"), value: "public" }
]);
const snapshot = computed(() =>
  JSON.stringify([name.value, args.value, module.value, comment.value, scope.value, variables.value])
);
const dirty = computed(() => snapshot.value !== savedSnapshot.value);
const variablesValid = computed(() => {
  const names = new Set<string>();
  return variables.value.every((variable) => {
    const key = variable.varName.trim().replace(/^jms_/, "");
    if (!variable.name.trim() || !/^[a-z_]\w{0,127}$/i.test(key) || names.has(key)) return false;
    names.add(key);
    return variable.type !== "select" || Boolean(variable.options.trim());
  });
});
savedSnapshot.value = snapshot.value;

watch(snapshot, () => {
  draftRevision.value += 1;
});

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
  if (!variablesValid.value) {
    variablesOpen.value = true;
    toast.add({
      title: t("Snippets.VariableInvalid"),
      description: t("Snippets.VariableInvalidHint"),
      color: "warning",
      icon: "i-lucide-triangle-alert"
    });
    return;
  }
  saving.value = true;
  try {
    const result = await save(
      {
        name: nextName,
        args: args.value,
        module: module.value,
        comment: comment.value.trim(),
        scope: scope.value,
        variable: serializeSnippetVariableDefinitions(variables.value)
      },
      props.tab.payload?.scriptId
    );
    const response = result as Record<string, unknown> | null;
    const scriptId = String(response?.id || props.tab.payload?.scriptId || "");
    name.value = nextName;
    const responseScope = (response?.scope as { value?: unknown } | undefined)?.value || response?.scope || scope.value;
    scope.value = String(responseScope) === "public" ? "public" : "private";
    if (Array.isArray(response?.variable)) variables.value = normalizeSnippetVariableDefinitions(response.variable);
    const nextPayload = {
      ...props.tab.payload,
      scriptId: scriptId || undefined,
      name: nextName,
      args: args.value,
      module: module.value,
      comment: comment.value.trim(),
      scope: scope.value,
      variable: variables.value
    };
    const workspaceTab = getTabById(props.tab.id);
    if (workspaceTab) {
      workspaceTab.payload = nextPayload;
      if (workspaceTab.panes[0]) workspaceTab.panes[0].payload = nextPayload;
    }
    renameTabTitle(props.tab.id, nextName);
    await nextTick();
    savedSnapshot.value = snapshot.value;
  } catch (error) {
    addErrorToast({ title: t("Snippets.SaveFailed"), error, icon: "i-lucide-circle-alert" });
  } finally {
    saving.value = false;
  }
}

function buildScriptAiSnapshot(): ScriptAiSnapshot {
  const nextModule = SCRIPT_AI_MODULES.includes(module.value as (typeof SCRIPT_AI_MODULES)[number])
    ? (module.value as ScriptAiSnapshot["module"])
    : "raw";
  return {
    paneId: props.tab.id,
    scriptId: String(props.tab.payload?.scriptId || ""),
    name: name.value.trim() || t("Snippets.Untitled"),
    content: args.value,
    module: nextModule,
    comment: comment.value,
    scope: scope.value,
    variables: variables.value.map((variable) => ({ ...variable })),
    revision: draftRevision.value
  };
}

function applyScriptAiProposal(proposal: ScriptAiProposal) {
  if (proposal.base.paneId !== props.tab.id) return { applied: false, reason: "invalid" as const };
  if (proposal.base.revision !== draftRevision.value) {
    toast.add({
      title: t("RightPanel.ScriptAIProposalStale"),
      color: "warning",
      icon: "i-lucide-triangle-alert"
    });
    return { applied: false, reason: "stale" as const };
  }
  name.value = proposal.name;
  args.value = proposal.content;
  module.value = proposal.module;
  comment.value = proposal.comment;
  variables.value = proposal.variables.map((variable) => ({ ...variable }));
  detailsOpen.value = true;
  toast.add({
    title: t("RightPanel.ScriptAIApplied"),
    description: t("RightPanel.ScriptAIAppliedHint"),
    color: "success",
    icon: "i-lucide-circle-check"
  });
  return { applied: true };
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
onMounted(() => {
  registerScriptAiSession(props.tab.id, buildScriptAiSnapshot, applyScriptAiProposal);
});
onBeforeUnmount(() => {
  unregisterCloseGuard();
  unregisterScriptAiSession(props.tab.id);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-background)]">
    <ScriptEditor v-model="args" :module="module" class="min-h-0 flex-1" @save="submit" />
    <footer class="flex h-10 shrink-0 items-center gap-1.5 border-t border-[var(--app-border)] px-2.5">
      <template v-if="detailsOpen">
        <UInput v-model="name" autofocus size="xs" class="min-w-32 max-w-52 flex-1" :placeholder="t('Snippets.Name')" />
        <USelect v-model="module" size="xs" class="w-32" :items="moduleItems" />
        <USelect v-model="scope" size="xs" class="w-28" :items="scopeItems" />
        <UInput v-model="comment" size="xs" class="min-w-32 max-w-64 flex-1" :placeholder="t('Snippets.Comment')" />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-braces"
          :label="t('Snippets.VariablesCount', { count: variables.length })"
          @click="variablesOpen = true"
        />
      </template>
      <div class="flex-1" />
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-sparkles"
        :label="t('RightPanel.ScriptAIName')"
        @click="openAi"
      />
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

  <UModal
    v-model:open="variablesOpen"
    :title="t('Snippets.VariableEditorTitle')"
    :ui="{ content: 'max-w-3xl', footer: 'justify-end' }"
  >
    <template #body>
      <ScriptVariableEditor v-model="variables" />
    </template>
    <template #footer>
      <UButton color="primary" :label="t('Common.Confirm')" @click="variablesOpen = false" />
    </template>
  </UModal>
</template>
