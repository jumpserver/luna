import { useAccountSwitchPrompt } from "~/composables/useAccountSwitchPrompt";
import { confirmAiTaskLeave } from "~/composables/useAiTaskLeave";
import { useBatchCommandPanel } from "~/composables/useBatchCommandPanel";
import { hasActiveAiTask } from "~/composables/useWorkspaceAssistantPanelSession";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

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
// User-initiated site changes may need a component-specific draft check after the global prompt.
// Direct closeCurrentSiteWorkspace calls remain authoritative for forced cleanup.
const siteLeaveGuards = new Set<() => boolean | Promise<boolean>>();
export const registerSiteLeaveGuard = (guard: () => boolean | Promise<boolean>) => {
  siteLeaveGuards.add(guard);
  return () => {
    siteLeaveGuards.delete(guard);
  };
};

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

export const hasActiveSiteSessions = async () =>
  hasActiveWorkspaceSessions() || (isDesktopRuntime() && (await desktopInvoke<number>("get_asset_window_count")) > 0);

export const closeCurrentSiteWorkspace = async () => {
  useBatchCommandPanel().setOpen(false);
  await useWorkspaceTabs().closeAllSessions({ force: true });
  await fileWorkspaceLeaveHandler?.close();
  if (isDesktopRuntime()) await desktopInvoke("close_asset_windows");
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
    } else if (await hasActiveSiteSessions()) {
      const confirmed = await new Promise<boolean>((resolve) => {
        leaveConfirm.value = { kind, resolve };
      });
      if (!confirmed) return false;
    }
    for (const guard of siteLeaveGuards) {
      try {
        if (!(await guard())) return false;
      } catch {
        return false;
      }
    }
    if (closeOnConfirm) await closeCurrentSiteWorkspace();
    return true;
  } finally {
    leaveInFlight = false;
  }
};

export const useSiteAccountSwitch = () => {
  const toast = useToast();
  const confirmOpen = computed({
    get: () => leaveConfirm.value !== null,
    set: (open) => {
      if (!open) resolveLeaveConfirm(false);
    }
  });

  const switchAccount = async (accountId: string) => {
    const user = useUserInfoStore();
    if (switchingAccountId.value || (accountId === user.currentAccountId && user.loggedIn)) return false;
    const { $i18n } = useNuxtApp();
    const bus = useEventBus();
    const prompt = useAccountSwitchPrompt();
    const sourceAccountId = user.currentAccountId;
    const target = user.userMap[accountId];
    if (!target) return false;
    const stillCurrent = () => user.currentAccountId === sourceAccountId && user.loggedIn;
    const offerLogin = async () => {
      if ((await prompt.confirmLogin(target)) && stillCurrent()) {
        bus.emit("login", {
          accountId,
          ...(!user.userMap[accountId] ? { prefill: { site: target.site, siteName: target.siteName } } : {})
        });
      }
    };
    let cancelled = false;
    switchingAccountId.value = accountId;
    try {
      if (user.userMap[accountId]?.sessionExpired) {
        await offerLogin();
        return false;
      }
      const switched = await user.setCurrentAccount(accountId, {
        requireUnlocked: true,
        prepareTarget: async (result) => {
          if (!stillCurrent()) return false;
          if (result.client_locked && !(await prompt.unlock(target, result.connection_id!))) return false;
          return stillCurrent();
        },
        beforeSwitch: async () => {
          if (!stillCurrent() || !(await confirmLeaveCurrentSiteSessions("switch", { close: false }))) {
            cancelled = true;
            return false;
          }
          if (!stillCurrent()) return false;
          await closeCurrentSiteWorkspace();
        },
        onAuthRequired: offerLogin
      });
      if (switched === false && !cancelled && !user.userMap[accountId]?.sessionExpired) {
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
