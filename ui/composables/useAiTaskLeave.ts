import { hasActiveAiTask } from "~/composables/useWorkspaceAssistantPanelSession";

export type AiTaskLeaveKind = "tab" | "org" | "account" | "logout";

type AiTaskLeaveRequest = {
  kind: AiTaskLeaveKind;
  resolve: (confirmed: boolean) => void;
};

const leaveConfirm = ref<AiTaskLeaveRequest | null>(null);
let leaveInFlight = false;

const resolveLeaveConfirm = (confirmed: boolean) => {
  const pending = leaveConfirm.value;
  leaveConfirm.value = null;
  pending?.resolve(confirmed);
};

function hasTask(tabId?: string | string[]) {
  if (Array.isArray(tabId)) return tabId.some((id) => hasActiveAiTask(id));
  return hasActiveAiTask(tabId);
}

export async function confirmAiTaskLeave(kind: AiTaskLeaveKind, tabId?: string | string[]) {
  if (leaveInFlight) return false;
  if (!hasTask(tabId)) return true;

  leaveInFlight = true;
  try {
    return await new Promise<boolean>((resolve) => {
      leaveConfirm.value = { kind, resolve };
    });
  } finally {
    leaveInFlight = false;
  }
}

export const useAiTaskLeave = () => {
  const confirmOpen = computed({
    get: () => leaveConfirm.value !== null,
    set: (open) => {
      if (!open) resolveLeaveConfirm(false);
    }
  });

  return {
    confirmOpen,
    leaveKind: computed(() => leaveConfirm.value?.kind ?? "tab"),
    confirmLeave: () => resolveLeaveConfirm(true)
  };
};
