<script setup lang="ts">
import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from "~/composables/useAiPanel";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import { resolveAiPanelSession } from "./ai/domains/registry";
import WorkspaceAiPanel from "./aiPanel.vue";
import WorkspaceAssistantPanel from "./WorkspaceAssistantPanel.vue";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { activeWorkspaceMode } = useWorkspaceMode();
const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeTab: rightPanelTab, open: rightPanelOpen } = useRightPanel();
const { panelWidth, setPanelWidth, setSource } = useAiPanel();
const resizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizeHandle: HTMLElement | null = null;
let resizePointerId: number | null = null;
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

watchEffect(() => {
  setSource(
    resolveAiPanelSource({
      workspaceMode: activeWorkspaceMode.value,
      rightPanelOpen: rightPanelOpen.value,
      rightPanelTab: rightPanelTab.value
    })
  );
});

function startResize(event: PointerEvent) {
  if (event.button !== 0 || isNarrowScreen.value) return;
  event.preventDefault();
  resizing.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  resizeHandle = event.currentTarget as HTMLElement;
  resizePointerId = event.pointerId;
  resizeHandle.setPointerCapture(event.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function resizePanel(event: PointerEvent) {
  if (!resizing.value) return;
  setPanelWidth(resizeStartWidth - (event.clientX - resizeStartX));
}

function stopResize() {
  if (!resizing.value) return;
  resizing.value = false;
  if (resizeHandle && resizePointerId !== null && resizeHandle.hasPointerCapture(resizePointerId)) {
    resizeHandle.releasePointerCapture(resizePointerId);
  }
  resizeHandle = null;
  resizePointerId = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function resizeWithKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 32 : 16;
  if (event.key === "ArrowLeft") setPanelWidth(panelWidth.value + step);
  else if (event.key === "ArrowRight") setPanelWidth(panelWidth.value - step);
  else if (event.key === "Home") setPanelWidth(AI_PANEL_MIN_WIDTH);
  else if (event.key === "End") setPanelWidth(AI_PANEL_MAX_WIDTH);
  else return;
  event.preventDefault();
}

onMounted(() => {
  window.addEventListener("pointermove", resizePanel);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
});

const panelStyle = computed(() => ({
  width: isNarrowScreen.value ? `min(${panelWidth.value}px, calc(100vw - 3rem))` : `${panelWidth.value}px`
}));

onBeforeUnmount(() => {
  stopResize();
  window.removeEventListener("pointermove", resizePanel);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
});
</script>

<template>
  <div id="workspace-ai-overlay" data-ai-context="preserve" class="pointer-events-none absolute inset-0 z-50">
    <UButton
      v-if="isNarrowScreen"
      type="button"
      class="pointer-events-auto absolute inset-0 rounded-none bg-black/35 backdrop-blur-[1px]"
      :aria-label="t('RightPanel.AIClose')"
      color="neutral"
      variant="ghost"
      @click="emit('close')"
    />
    <UCard
      class="pointer-events-auto absolute inset-y-3 right-3 flex min-h-0 flex-col overflow-hidden"
      :class="resizing ? '' : 'transition-[width] duration-150 ease-out'"
      :style="panelStyle"
      :ui="{
        root: 'h-auto shadow-none ring-1 ring-[var(--app-border)] bg-[var(--app-surface-overlay)]',
        body: 'relative flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0'
      }"
    >
      <div
        role="separator"
        aria-label="调整 AI 面板宽度"
        aria-orientation="vertical"
        :aria-valuenow="panelWidth"
        :aria-valuemin="AI_PANEL_MIN_WIDTH"
        :aria-valuemax="AI_PANEL_MAX_WIDTH"
        tabindex="0"
        class="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none max-md:hidden"
        @pointerdown="startResize"
        @keydown="resizeWithKeyboard"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-active:bg-primary"
          :class="resizing ? 'bg-primary' : 'bg-transparent'"
        />
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">
        <KeepAlive>
          <component :is="showWorkspaceAssistant ? WorkspaceAssistantPanel : WorkspaceAiPanel">
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
</template>
