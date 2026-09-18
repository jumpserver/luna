import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { WorkspacePane, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { PermedAccount } from "~/types";
import { clearWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";

export type WorkspaceConnectionProgressStage = "token" | "session" | "connected";

type SessionMatch = { tabId?: string; assetId: string; protocol: string; account: string };
type ProgressMatch = { tab: WorkspaceSessionTab; pane: WorkspacePane; paneIndex: number };

const CONNECTION_PROGRESS_MIN_MS = 1000;

export function createWorkspaceConnectionProgress(host: {
  findPane: (paneId: string) => ProgressMatch | null;
  findSession: (match: SessionMatch) => ProgressMatch | null;
  syncTabFromPrimaryPane: (tab: WorkspaceSessionTab) => void;
  setActivePaneId: (paneId: string) => void;
  closeNativeSession: (id: string) => void;
}) {
  const connectionProgressAt = new Map<string, number>();
  const connectionProgressGoal = new Map<string, WorkspaceConnectionProgressStage | "hide">();
  const connectionProgressTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const connectionAttempts = new Map<string, number>();

  const stopConnectionProgressTimer = (paneId: string) => {
    const timer = connectionProgressTimers.get(paneId);
    if (timer) clearTimeout(timer);
    connectionProgressTimers.delete(paneId);
  };

  const clearConnectionProgress = (pane: WorkspacePane) => {
    stopConnectionProgressTimer(pane.id);
    connectionProgressAt.delete(pane.id);
    connectionProgressGoal.delete(pane.id);
    pane.connectionProgress = undefined;
  };

  const assignConnectionProgress = (
    pane: WorkspacePane,
    stage: WorkspaceConnectionProgressStage | undefined,
    tab: WorkspaceSessionTab,
    paneIndex: number
  ) => {
    pane.connectionProgress = stage;
    if (stage) connectionProgressAt.set(pane.id, Date.now());
    else {
      connectionProgressAt.delete(pane.id);
      connectionProgressGoal.delete(pane.id);
    }
    if (paneIndex === 0) host.syncTabFromPrimaryPane(tab);
  };

  const pumpConnectionProgress = (pane: WorkspacePane, tab: WorkspaceSessionTab, paneIndex: number) => {
    stopConnectionProgressTimer(pane.id);
    const goal = connectionProgressGoal.get(pane.id);
    if (!goal) return;

    const current = pane.connectionProgress;
    if (goal === "hide" ? !current : current === goal) return;

    const holdMs = !current || current === "session" ? 0 : CONNECTION_PROGRESS_MIN_MS;
    const wait = Math.max(0, holdMs - (Date.now() - (connectionProgressAt.get(pane.id) ?? 0)));
    const advance = () => {
      connectionProgressTimers.delete(pane.id);
      const stage = pane.connectionProgress;
      if (stage === "connected" && goal === "hide") {
        assignConnectionProgress(pane, undefined, tab, paneIndex);
        return;
      }
      assignConnectionProgress(pane, stage === "token" ? "session" : "connected", tab, paneIndex);
      pumpConnectionProgress(pane, tab, paneIndex);
    };

    if (wait) connectionProgressTimers.set(pane.id, setTimeout(advance, wait));
    else advance();
  };

  const hideProgressAfterGuide = (found: ProgressMatch) => {
    connectionProgressGoal.set(found.pane.id, "hide");
    pumpConnectionProgress(found.pane, found.tab, found.paneIndex);
  };

  const markSessionConnecting = (paneId: string) => {
    const match = host.findPane(paneId);
    if (!match) return;

    connectionAttempts.set(paneId, (connectionAttempts.get(paneId) || 0) + 1);
    match.pane.status = "connecting";
    match.pane.connectionFailure = undefined;
    match.pane.mode = "session";
    if (match.pane.connectionProgress) assignConnectionProgress(match.pane, "token", match.tab, match.paneIndex);
    host.setActivePaneId(paneId);
    if (match.paneIndex === 0) host.syncTabFromPrimaryPane(match.tab);
  };

  const startSessionConnection = (
    paneId: string,
    connection: { protocol: string; account: string; permedAccounts?: PermedAccount[] },
    setupDraft?: ConnectionFormDraft
  ) => {
    const match = host.findPane(paneId);
    if (!match) return;

    clearConnectionProgress(match.pane);
    connectionAttempts.set(paneId, (connectionAttempts.get(paneId) || 0) + 1);
    match.pane.protocol = connection.protocol;
    match.pane.account = connection.account;
    if (connection.permedAccounts) match.pane.permedAccounts = connection.permedAccounts;
    match.pane.payload = undefined;
    match.pane.connectionFailure = undefined;
    match.pane.status = "connecting";
    match.pane.resumeSetupOnFailure = Boolean(setupDraft);
    match.pane.setupDraft = setupDraft
      ? { ...setupDraft, connectOptions: { ...setupDraft.connectOptions } }
      : undefined;
    assignConnectionProgress(match.pane, "token", match.tab, match.paneIndex);
    // Keep the setup surface mounted until a session payload is ready so ACL prompts do not flash the session loader.
    host.setActivePaneId(paneId);
    if (match.paneIndex === 0) host.syncTabFromPrimaryPane(match.tab);
  };

  const getSessionConnectionAttempt = (paneId: string) => connectionAttempts.get(paneId) || 0;

  const markSessionTokenCreated = (match: SessionMatch) => {
    const found = host.findSession(match);
    if (!found || found.pane.connectionProgress !== "token") return;

    connectionProgressGoal.set(found.pane.id, "session");
    pumpConnectionProgress(found.pane, found.tab, found.paneIndex);
  };

  const markSessionFailed = (match: SessionMatch, reason?: string) => {
    const found = host.findSession(match);
    if (!found) return;

    const inProgress = Boolean(found.pane.connectionProgress);
    found.pane.connectedAt = undefined;
    found.pane.connectionFailure = reason;
    clearWorkspaceSessionDetails(found.pane.id);
    host.closeNativeSession(found.pane.id);
    if (inProgress) {
      stopConnectionProgressTimer(found.pane.id);
      connectionProgressGoal.delete(found.pane.id);
      const atToken = found.pane.connectionProgress === "token";
      found.pane.connectionProgress = atToken ? "token" : "connected";
      found.pane.status = atToken ? "failed" : "disconnected";
      if (atToken) found.pane.payload = undefined;
    } else {
      found.pane.payload = undefined;
      clearConnectionProgress(found.pane);
      if (found.pane.resumeSetupOnFailure && found.pane.setupAsset) {
        found.pane.status = "selecting";
        found.pane.mode = "setup";
      } else {
        found.pane.status = "failed";
        if (found.pane.mode !== "setup") found.pane.mode = "session";
      }
    }
    if (found.paneIndex === 0) host.syncTabFromPrimaryPane(found.tab);
  };

  const resumeConnectionSetup = (paneId: string) => {
    const match = host.findPane(paneId);
    if (!match) return;

    clearConnectionProgress(match.pane);
    if (match.pane.setupAsset) {
      match.pane.payload = undefined;
      match.pane.status = "selecting";
      match.pane.mode = "setup";
    } else {
      match.pane.status = match.pane.payload ? "disconnected" : "failed";
      match.pane.mode = "session";
    }
    if (match.paneIndex === 0) host.syncTabFromPrimaryPane(match.tab);
  };

  const markSessionConnected = (paneId: string) => {
    const match = host.findPane(paneId);
    if (!match) return;

    match.pane.resumeSetupOnFailure = false;
    match.pane.setupDraft = undefined;
    match.pane.connectionFailure = undefined;
    match.pane.status = "connected";
    match.pane.connectedAt = Date.now();
    match.pane.mode = "session";
    connectionProgressGoal.set(match.pane.id, "hide");
    if (!match.pane.connectionProgress) {
      assignConnectionProgress(match.pane, "connected", match.tab, match.paneIndex);
    }
    pumpConnectionProgress(match.pane, match.tab, match.paneIndex);
    host.setActivePaneId(paneId);
    if (match.paneIndex === 0) host.syncTabFromPrimaryPane(match.tab);
  };

  const markSessionDisconnected = (paneId: string, reason?: string) => {
    const match = host.findPane(paneId);
    if (!match) return;

    stopConnectionProgressTimer(match.pane.id);
    connectionProgressGoal.delete(match.pane.id);
    match.pane.connectionProgress = "connected";
    match.pane.status = "disconnected";
    match.pane.connectionFailure = reason;
    if (match.paneIndex === 0) host.syncTabFromPrimaryPane(match.tab);
  };

  return {
    clearConnectionProgress,
    getSessionConnectionAttempt,
    hideProgressAfterGuide,
    markSessionConnected,
    markSessionConnecting,
    markSessionDisconnected,
    markSessionFailed,
    markSessionTokenCreated,
    resumeConnectionSetup,
    startSessionConnection
  };
}
