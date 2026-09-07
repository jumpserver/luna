import { useBatchCommandPanel } from "~/composables/useBatchCommandPanel";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";

export type LeaveCurrentSiteKind = "switch" | "logout" | "login";

type LeaveConfirmRequest = {
  kind: LeaveCurrentSiteKind;
  resolve: (confirmed: boolean) => void;
};

const leaveConfirm = ref<LeaveConfirmRequest | null>(null);
let leaveInFlight = false;

const resolveLeaveConfirm = (confirmed: boolean) => {
  const pending = leaveConfirm.value;
  leaveConfirm.value = null;
  pending?.resolve(confirmed);
};

export const hasActiveWorkspaceSessions = () =>
  useWorkspaceTabs().tabs.value.some((tab) => tab.panes.some((pane) => pane.mode !== "empty"));

export const closeCurrentSiteWorkspace = async () => {
  useBatchCommandPanel().setOpen(false);
  await useWorkspaceTabs().closeAllSessions({ force: true });
};

export const confirmLeaveCurrentSiteSessions = async (
  kind: LeaveCurrentSiteKind,
  options: { close?: boolean } = {}
) => {
  if (leaveInFlight) return false;

  const closeOnConfirm = options.close !== false;
  leaveInFlight = true;
  try {
    if (!hasActiveWorkspaceSessions()) {
      if (closeOnConfirm) await closeCurrentSiteWorkspace();
      return true;
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      leaveConfirm.value = { kind, resolve };
    });
    if (!confirmed) return false;
    if (closeOnConfirm) await closeCurrentSiteWorkspace();
    return true;
  } finally {
    leaveInFlight = false;
  }
};

export const useSiteAccountSwitch = () => {
  const confirmOpen = computed({
    get: () => leaveConfirm.value !== null,
    set: (open) => {
      if (!open) resolveLeaveConfirm(false);
    }
  });

  return {
    confirmOpen,
    leaveKind: computed(() => leaveConfirm.value?.kind ?? "switch"),
    confirmLeave: () => resolveLeaveConfirm(true)
  };
};
