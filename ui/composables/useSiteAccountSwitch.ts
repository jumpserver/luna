import { confirmAiTaskLeave } from "~/composables/useAiTaskLeave";
import { useBatchCommandPanel } from "~/composables/useBatchCommandPanel";
import { hasActiveAiTask } from "~/composables/useWorkspaceAssistantPanelSession";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import { useUserInfoStore } from "~/store/modules/userInfo";

export type LeaveCurrentSiteKind = "switch" | "logout" | "login";

export type FileWorkspaceLeaveHandler = {
  hasActive: () => boolean;
  close: () => void | Promise<void>;
};

type LeaveConfirmRequest = {
  kind: LeaveCurrentSiteKind;
  resolve: (confirmed: boolean) => void;
};

const leaveConfirm = ref<LeaveConfirmRequest | null>(null);
const switchingAccountId = ref("");
let leaveInFlight = false;
let fileWorkspaceLeaveHandler: FileWorkspaceLeaveHandler | null = null;

const resolveLeaveConfirm = (confirmed: boolean) => {
  const pending = leaveConfirm.value;
  leaveConfirm.value = null;
  pending?.resolve(confirmed);
};

export const registerFileWorkspaceLeaveHandler = (handler: FileWorkspaceLeaveHandler | null) => {
  fileWorkspaceLeaveHandler = handler;
  return () => {
    if (fileWorkspaceLeaveHandler === handler) fileWorkspaceLeaveHandler = null;
  };
};

export const hasActiveWorkspaceSessions = () =>
  useWorkspaceTabs().tabs.value.some((tab) => tab.panes.some((pane) => pane.mode !== "empty")) ||
  Boolean(fileWorkspaceLeaveHandler?.hasActive());

export const closeCurrentSiteWorkspace = async () => {
  useBatchCommandPanel().setOpen(false);
  await useWorkspaceTabs().closeAllSessions({ force: true });
  await fileWorkspaceLeaveHandler?.close();
};

export const confirmLeaveCurrentSiteSessions = async (
  kind: LeaveCurrentSiteKind,
  options: { close?: boolean } = {}
) => {
  if (leaveInFlight) return false;

  const closeOnConfirm = options.close !== false;
  leaveInFlight = true;
  try {
    if (hasActiveAiTask()) {
      if (!(await confirmAiTaskLeave(kind === "logout" ? "logout" : "account"))) return false;
      if (closeOnConfirm) await closeCurrentSiteWorkspace();
      return true;
    }
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

  const switchAccount = async (accountId: string) => {
    const user = useUserInfoStore();
    if (switchingAccountId.value || (accountId === user.currentAccountId && user.loggedIn)) return false;
    const toast = useToast();
    const { $i18n } = useNuxtApp();
    const bus = useEventBus();
    switchingAccountId.value = accountId;
    try {
      if (user.userMap[accountId]?.sessionExpired) {
        bus.emit("login", { accountId });
        return false;
      }
      if (!(await confirmLeaveCurrentSiteSessions("switch", { close: false }))) return false;
      const switched = await user.setCurrentAccount(accountId, {
        beforeSwitch: closeCurrentSiteWorkspace,
        onAuthRequired: () => bus.emit("login", { accountId })
      });
      if (switched === false && !user.userMap[accountId]?.sessionExpired) {
        toast.add({ title: String($i18n.t("Login.SwitchFailed")), color: "error" });
      }
      return switched === true;
    } catch {
      toast.add({ title: String($i18n.t("Login.SwitchFailed")), color: "error" });
      return false;
    } finally {
      switchingAccountId.value = "";
    }
  };

  return {
    confirmOpen,
    switchingAccountId,
    switchAccount,
    leaveKind: computed(() => leaveConfirm.value?.kind ?? "switch"),
    confirmLeave: () => resolveLeaveConfirm(true)
  };
};
