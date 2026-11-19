<script setup lang="ts">
import type { WorkspacePane, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import {
  isKokoBroadcastAvailable,
  startKokoTerminalBroadcast,
  stopKokoTerminalBroadcast,
  updateKokoBroadcastTargets,
  useKokoTerminalBroadcast
} from "#koko/composables/terminal/useTerminalBroadcast";
import { stackWorkspacePanes } from "~/utils/workspaceLayout";

const props = defineProps<{ tab: WorkspaceSessionTab; pane: WorkspacePane }>();
const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const {
  tabs,
  activeTabId,
  activePaneId,
  beginTemporaryWorkspaceLayout,
  extendTemporaryWorkspaceLayout,
  releaseTemporaryWorkspaceTabs,
  canMergeTabs,
  mergeTabIntoWorkspace,
  setActivePane,
  persistPaneLayout,
  setPaneLayout
} = useWorkspaceTabs();
const { focusPaneSurface } = useWorkspacePaneSurfaceRegistry();
const { broadcast } = useKokoTerminalBroadcast();
const editing = broadcast.value?.tabId === props.tab.id;
const open = defineModel<boolean>("open", { default: false });
const selectedIds = ref<string[]>(editing ? [...broadcast.value!.targetIds] : []);
const available = (pane: WorkspacePane) =>
  pane.protocol === "ssh" &&
  pane.mode === "session" &&
  pane.status === "connected" &&
  !pane.connectionProgress &&
  isKokoBroadcastAvailable(pane.id);
const candidates = computed(() =>
  tabs.value.flatMap((tab) =>
    tab.panes
      .filter(
        (pane) =>
          pane.id !== props.pane.id &&
          available(pane) &&
          (tab.id === props.tab.id || canMergeTabs(tab.id, props.tab.id, true))
      )
      .map((pane) => ({ pane, tabId: tab.id }))
  )
);
watch(broadcast, (group) => {
  if (editing && (!group || group.tabId !== props.tab.id || group.sourceId !== props.pane.id)) open.value = false;
});

function focusSource() {
  setActivePane(props.pane.id);
  nextTick(() => focusPaneSurface(props.pane.id));
}

function scopeFor(targets: WorkspacePane[]) {
  const participants = [props.pane, ...targets].map((pane) => ({ pane, payload: pane.payload }));
  return () =>
    participants.every(
      ({ pane, payload }) => props.tab.panes.includes(pane) && pane.payload === payload && available(pane)
    );
}

function start() {
  if (activeTabId.value !== props.tab.id || !available(props.pane) || (!editing && !selectedIds.value.length)) return;
  const selected = selectedIds.value
    .map((id) => candidates.value.find((candidate) => candidate.pane.id === id))
    .filter((candidate) => candidate !== undefined);
  if (selected.length !== selectedIds.value.length) return;
  const imports = selected.filter((candidate) => candidate.tabId !== props.tab.id);
  const isCurrent = scopeFor(selected.map((candidate) => candidate.pane));
  if (editing) {
    const group = broadcast.value;
    if (!group || group.tabId !== props.tab.id || group.sourceId !== props.pane.id) return;
    if (
      !extendTemporaryWorkspaceLayout(
        props.tab.id,
        imports.map((candidate) => candidate.tabId)
      )
    )
      return;
    const lastTarget = group.targetIds.at(-1) || group.sourceId;
    for (const candidate of imports) {
      if (!mergeTabIntoWorkspace(candidate.tabId, props.tab.id, lastTarget, "bottom", true)) {
        releaseTemporaryWorkspaceTabs(
          props.tab.id,
          imports.map((item) => item.pane.id)
        );
        return;
      }
    }
    if (!updateKokoBroadcastTargets(selectedIds.value, isCurrent)) {
      releaseTemporaryWorkspaceTabs(
        props.tab.id,
        imports.map((item) => item.pane.id)
      );
      return;
    }
    if (selectedIds.value.length)
      releaseTemporaryWorkspaceTabs(
        props.tab.id,
        group.targetIds.filter((id) => !selectedIds.value.includes(id))
      );
    open.value = false;
    if (selectedIds.value.length) focusSource();
    return;
  }

  stopKokoTerminalBroadcast();
  const restoreLayout = beginTemporaryWorkspaceLayout(
    props.tab.id,
    imports.map((candidate) => candidate.tabId)
  );
  if (!restoreLayout) return;
  let started = false;
  const restore = () => {
    const returnFocus = activeTabId.value === props.tab.id;
    void restoreLayout().then(async () => {
      const paneId = activePaneId.value;
      await nextTick();
      if (started && returnFocus && activeWorkspaceMode.value === "assets" && activePaneId.value === paneId)
        focusPaneSurface(paneId);
    });
  };
  for (const candidate of imports) {
    if (!mergeTabIntoWorkspace(candidate.tabId, props.tab.id, props.pane.id, "right", true)) {
      restore();
      return;
    }
  }
  if (imports.length) {
    setPaneLayout(props.tab.id, {
      type: "split",
      direction: "vertical",
      ratio: 50,
      first: { type: "pane", paneId: props.pane.id },
      second: stackWorkspacePanes(
        props.tab.panes.filter((pane) => pane.id !== props.pane.id).map((pane) => pane.id),
        "horizontal"
      )
    });
    persistPaneLayout(props.tab.id);
  }
  if (
    !startKokoTerminalBroadcast(
      props.tab.id,
      props.pane.id,
      selectedIds.value,
      isCurrent,
      restore,
      () => activeTabId.value === props.tab.id && activeWorkspaceMode.value === "assets"
    )
  ) {
    restore();
    return;
  }
  started = true;
  open.value = false;
  focusSource();
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(editing ? 'TerminalBroadcast.EditTargets' : 'TerminalBroadcast.SelectTargets')"
    :description="t('TerminalBroadcast.Hint')"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="max-h-80 space-y-2 overflow-y-auto">
        <UCheckbox
          v-for="candidate in candidates"
          :key="candidate.pane.id"
          :model-value="selectedIds.includes(candidate.pane.id)"
          :label="candidate.pane.assetName"
          :description="[candidate.pane.account, candidate.pane.address].filter(Boolean).join(' · ')"
          :ui="{ base: 'cursor-pointer', label: 'cursor-pointer' }"
          @update:model-value="
            (checked) =>
              (selectedIds = checked
                ? [...selectedIds, candidate.pane.id]
                : selectedIds.filter((id) => id !== candidate.pane.id))
          "
        />
        <p v-if="!candidates.length" class="text-xs text-(--app-muted)">{{ t("TerminalBroadcast.NoTargets") }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="open = false" />
        <UButton
          size="sm"
          color="warning"
          :icon="editing && !selectedIds.length ? 'i-lucide-square' : 'i-lucide-radio'"
          :disabled="(!editing && !selectedIds.length) || !available(pane)"
          :label="
            t(
              editing
                ? selectedIds.length
                  ? 'TerminalBroadcast.ApplyTargets'
                  : 'TerminalBroadcast.Stop'
                : 'TerminalBroadcast.Start'
            )
          "
          @click="start"
        />
      </div>
    </template>
  </UModal>
</template>
