import type { ComputedRef, Ref } from "vue";
import type {
  AiPanelDomainContext,
  AiPanelDomainPresentation,
  AiPanelDomainSummary,
  AiTranslate
} from "./domains/types";
import type { AiTimelineAction, ViewItem } from "./types";
import type { WorkspaceSurfaceSession } from "~/composables/useWorkspaceTabs";
import { buildAiPanelViewItems } from "./buildViewItems";
import { resolveAiPanelDomain, resolveAiPanelSession } from "./domains/registry";
import { workspaceAiMessages } from "./domains/types";
import { aiRiskColor } from "./presentation";

interface UseAiPanelControllerOptions {
  paneId: Ref<string>;
  surface: ComputedRef<WorkspaceSurfaceSession | null | undefined>;
}

export function useAiPanelController(options: UseAiPanelControllerOptions) {
  const { t } = useI18n();
  const translate: AiTranslate = (key, params) => (params ? t(key, params) : t(key));
  const elapsedClock = shallowRef(Date.now());
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  const session = computed(() => resolveAiPanelSession(options.paneId.value));
  const adapter = computed(() => (session.value ? resolveAiPanelDomain(session.value) : null));
  const messages = computed(() => (session.value ? workspaceAiMessages(session.value) : []));
  const metadataApproval = computed(() => {
    const current = session.value;
    return current && "metadataApproval" in current ? current.metadataApproval : null;
  });
  const domainContext = computed<AiPanelDomainContext>(() => ({
    paneId: options.paneId.value,
    surface: options.surface.value,
    now: elapsedClock.value,
    t: translate
  }));
  const viewItems = computed<ViewItem[]>(() =>
    buildAiPanelViewItems({
      messages: messages.value,
      metadataApproval: metadataApproval.value,
      terminalMetadataApproval: adapter.value?.id === "terminal",
      executionPlanLabel: t("RightPanel.AIExecutionPlan"),
      stepLabel: (count) => t("RightPanel.AIStep", { count })
    })
  );
  const presentation = computed<AiPanelDomainPresentation | null>(() => {
    const current = session.value;
    const currentAdapter = adapter.value;
    if (!current || !currentAdapter) return null;
    return currentAdapter.describe(current, domainContext.value, viewItems.value);
  });
  const domainSummary = computed<AiPanelDomainSummary>(() => {
    const current = session.value;
    const currentAdapter = adapter.value;
    if (!current || !currentAdapter) return {};
    return currentAdapter.summarize(current, domainContext.value, viewItems.value);
  });

  function stopElapsedTimer() {
    if (elapsedTimer !== null) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  watch(
    () =>
      Boolean(presentation.value?.refreshElapsedWhileBusy && (presentation.value.busy || presentation.value.running)),
    (running) => {
      stopElapsedTimer();
      elapsedClock.value = Date.now();
      if (running && import.meta.client) {
        elapsedTimer = setInterval(() => {
          elapsedClock.value = Date.now();
        }, 500);
      }
    },
    { immediate: true }
  );
  onBeforeUnmount(stopElapsedTimer);

  const runProgress = computed(() => domainSummary.value.runProgress || "");
  const highestRiskLevel = computed(() => domainSummary.value.highestRiskLevel || 0);
  const riskLabel = computed(() => {
    const labels: Record<number, string> = {
      1: t("RightPanel.AIRiskReadOnly"),
      2: t("RightPanel.AIRiskLow"),
      3: t("RightPanel.AIRiskMedium"),
      4: t("RightPanel.AIRiskHigh")
    };
    return highestRiskLevel.value >= 2 ? labels[highestRiskLevel.value] || "" : "";
  });
  const presenceStatusTone = computed<"ready" | "active" | "warning" | "error" | "success">(() => {
    const current = presentation.value;
    if (!current) return "ready";
    if (current.errorLabel) return "error";
    if (metadataApproval.value || current.waitingForApproval) return "warning";
    if (current.busy || current.running) return "active";
    if (domainSummary.value.outcome === "error") return "error";
    if (domainSummary.value.outcome === "success") return "success";
    return "ready";
  });
  const presenceStatusLabel = computed(() => {
    const current = presentation.value;
    if (!current) return t("RightPanel.AIStatusReady");
    if (current.errorLabel) return current.errorLabel;
    if (metadataApproval.value || current.waitingForApproval) return t("RightPanel.AIStatusAwaitingApproval");
    if (current.busy || current.running) return current.runtimeStatusLabel || t("RightPanel.AIStatusRunning");
    if (presenceStatusTone.value === "success") return t("RightPanel.AIStatusCompleted");
    if (presenceStatusTone.value === "error") return t("RightPanel.AIStatusFailed");
    return t("RightPanel.AIStatusReady");
  });
  const activityLabel = computed(() => {
    const current = presentation.value;
    if (!current?.showActivity || !current.running || current.waitingForApproval) return "";
    return current.runtimeStatusLabel || t("RightPanel.AIResponding");
  });
  const timelineRevision = computed(() => {
    const lastMessage = messages.value.at(-1);
    const textLength = lastMessage?.parts.reduce(
      (total, part) => total + (part.type === "text" ? String(part.text || "").length : 0),
      0
    );
    return [
      options.paneId.value,
      messages.value.length,
      lastMessage?.parts.length || 0,
      textLength || 0,
      metadataApproval.value?.approvalId || ""
    ].join(":");
  });
  const draft = computed({
    get: () => session.value?.draft || "",
    set: (value: string) => {
      if (session.value) session.value.draft = value;
    }
  });
  const unavailableState = computed(
    () =>
      presentation.value?.unavailable || {
        icon: "i-lucide-sparkles",
        title: t("RightPanel.AIUnavailableTitle"),
        description: t("RightPanel.AIUnavailableDescription")
      }
  );

  function submit() {
    const current = session.value;
    const currentAdapter = adapter.value;
    const text = draft.value.trim();
    if (!current || !currentAdapter || !presentation.value?.available || presentation.value.busy || !text) return;
    currentAdapter.submit(current, text, domainContext.value);
  }

  function interrupt() {
    const current = session.value;
    if (current && adapter.value) adapter.value.interrupt(current, domainContext.value);
  }

  function clearError() {
    const current = session.value;
    if (current && adapter.value) adapter.value.clearError(current);
  }

  function updateApprovalThreshold(value: unknown) {
    const current = session.value;
    if (current && adapter.value) adapter.value.updateApprovalThreshold?.(current, value, domainContext.value);
  }

  function updateExecutionMode(value: unknown) {
    const current = session.value;
    if (current && adapter.value) adapter.value.updateExecutionMode?.(current, value, domainContext.value);
  }

  function handleTimelineAction(action: AiTimelineAction) {
    const current = session.value;
    if (current && adapter.value) adapter.value.handleTimelineAction(current, action, domainContext.value);
  }

  return {
    session,
    messages,
    viewItems,
    presentation,
    unavailableState,
    draft,
    runProgress,
    riskLabel,
    riskColor: computed(() => aiRiskColor(highestRiskLevel.value)),
    presenceStatusTone,
    presenceStatusLabel,
    activityLabel,
    timelineRevision,
    submit,
    interrupt,
    clearError,
    updateApprovalThreshold,
    updateExecutionMode,
    handleTimelineAction
  };
}
