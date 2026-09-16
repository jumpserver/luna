<script setup lang="ts">
import { aiPanelFloats } from "~/composables/useAiPanel";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import { resolveAiPanelSession } from "./ai/domains/registry";
import WorkspaceAiPanel from "./aiPanel.vue";
import { useAiPanelLayout } from "./useAiPanelLayout";
import WorkspaceAssistantPanel from "./WorkspaceAssistantPanel.vue";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { activeWorkspaceMode } = useWorkspaceMode();
const { activePaneId, activeTab } = useWorkspaceTabs();
const { panelWidth, setPanelWidth } = useAiPanel();
const host = shallowRef<HTMLElement | null>(null);
const panel = shallowRef<HTMLElement | null>(null);
const area = computed(() => host.value?.parentElement || null);
const activeSurface = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});
const activeCapability = computed(() => {
  const surface = activeSurface.value;
  if (!surface) return "";
  const payloadMethod = (surface.payload?.connectMethod as { value?: string } | undefined)?.value;
  return findDeclaredCapability(surface.protocol, payloadMethod || surface.connectMethod)?.surface || "";
});
const activeAiSession = computed(() => resolveAiPanelSession(activePaneId.value));
const showWorkspaceAssistant = computed(
  () =>
    resolveUnifiedAiPanel({
      workspaceMode: activeWorkspaceMode.value,
      protocol: activeSurface.value?.protocol || "",
      surface: activeCapability.value,
      sessionKind: activeAiSession.value?.kind
    }) === "workspace"
);
const defaultFloating = computed(() =>
  aiPanelFloats(showWorkspaceAssistant.value ? "workspace" : "resource", activeCapability.value, isNarrowScreen.value)
);

const {
  floating,
  style: panelStyle,
  interacting,
  stop
} = useAiPanelLayout({
  area,
  panel,
  narrow: isNarrowScreen,
  defaultFloating,
  width: panelWidth,
  setWidth: setPanelWidth
});
const resizeHandles = [
  { edge: "w", class: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "e", class: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "n", class: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", class: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "nw", class: "-left-1 -top-1 size-3 cursor-nwse-resize" },
  { edge: "ne", class: "-right-1 -top-1 size-3 cursor-nesw-resize" },
  { edge: "sw", class: "-bottom-1 -left-1 size-3 cursor-nesw-resize" },
  { edge: "se", class: "-bottom-1 -right-1 size-4 cursor-nwse-resize" }
];
const visibleHandles = computed(() =>
  isNarrowScreen.value ? [] : resizeHandles.filter((handle) => floating.value || handle.edge === "w")
);
onDeactivated(stop);
</script>

<template>
  <div
    id="workspace-ai-overlay"
    ref="host"
    data-ai-context="preserve"
    :class="
      floating
        ? 'pointer-events-none absolute inset-0 z-50'
        : 'pointer-events-auto relative z-10 h-full min-h-0 shrink-0'
    "
    :style="floating ? undefined : panelStyle"
  >
    <UButton
      v-if="isNarrowScreen"
      type="button"
      class="pointer-events-auto absolute inset-0 rounded-none bg-black/35 backdrop-blur-[1px]"
      :aria-label="t('RightPanel.AIClose')"
      color="neutral"
      variant="ghost"
      @click="emit('close')"
    />
    <div
      ref="panel"
      class="pointer-events-auto"
      :class="[floating ? 'absolute' : 'relative h-full w-full', { 'select-none': interacting }]"
      :style="floating ? panelStyle : undefined"
    >
      <UButton
        v-for="handle in visibleHandles"
        :key="handle.edge"
        :data-ai-panel-resize="handle.edge"
        :aria-label="t('RightPanel.AIResizePanel')"
        :title="t('RightPanel.AIResizePanel')"
        color="neutral"
        variant="ghost"
        class="group/ai-resize absolute z-20 touch-none justify-center rounded-none bg-transparent p-0 hover:bg-transparent active:bg-transparent focus-visible:ring-(--app-focus-ring)"
        :class="handle.class"
      >
        <UIcon
          v-if="handle.edge === 'se'"
          name="i-lucide-grip"
          class="pointer-events-none size-3 text-(--app-muted) opacity-0 group-hover/ai-resize:opacity-100 group-focus-visible/ai-resize:opacity-100"
        />
      </UButton>
      <UCard
        class="flex h-full min-h-0 flex-col overflow-hidden"
        :class="floating ? '' : 'border-l border-(--app-border)'"
        :ui="{
          root: floating
            ? 'shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] bg-[var(--app-surface-overlay)]'
            : 'rounded-none shadow-none ring-0 bg-[var(--app-surface-panel)]',
          body: 'relative flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0'
        }"
      >
        <div class="min-h-0 flex-1 overflow-hidden">
          <KeepAlive>
            <component
              :is="showWorkspaceAssistant ? WorkspaceAssistantPanel : WorkspaceAiPanel"
              :key="showWorkspaceAssistant ? 'workspace' : 'resource'"
            >
              <template #actions>
                <UButton
                  icon="i-lucide-x"
                  :aria-label="t('RightPanel.AIClose')"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="emit('close')"
                />
              </template>
            </component>
          </KeepAlive>
        </div>
      </UCard>
    </div>
  </div>
</template>
