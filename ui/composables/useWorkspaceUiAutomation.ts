import type { AssetItem } from "~/types";

import { computed, nextTick, readonly } from "vue";
import { useRouter } from "vue-router";

export interface WorkspaceUiAssetCandidate {
  id: string;
  name: string;
  address: string;
  orgId?: string;
  platform: string;
  zone: string;
  category: string;
  type: string;
  isActive: boolean;
}

interface WorkspaceUiCommand {
  id: string;
  type: "set-search" | "focus-asset";
  status: "pending" | "applied" | "failed";
  query?: string;
  assetId?: string;
}

interface WorkspaceUiCommandAck {
  revision: number;
  candidates?: WorkspaceUiAssetCandidate[];
  focusedAsset?: WorkspaceUiAssetCandidate;
}

type WorkspaceUiFocusSource = "user" | "automation";

interface WorkspaceUiSelectionReceipt {
  id: string;
  assetId: string;
  revision: number;
}

interface WorkspaceUiSelectionRequest {
  id: string;
  assetIds: string[];
}

interface WorkspaceUiSnapshot {
  revision: number;
  searchQuery: string;
  candidates: WorkspaceUiAssetCandidate[];
  focusedAsset: WorkspaceUiAssetCandidate | null;
  focusedAssetSource: WorkspaceUiFocusSource | null;
  selectionReceipt: WorkspaceUiSelectionReceipt | null;
}

interface WorkspaceUiActionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface WorkspaceUiFocusOptions extends WorkspaceUiActionOptions {
  query?: string;
}

class WorkspaceUiAutomationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceUiAutomationError";
    this.code = code;
  }
}

interface PendingCommand {
  resolve: (ack: WorkspaceUiCommandAck) => void;
  reject: (error: WorkspaceUiAutomationError) => void;
  timeout: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const pendingCommands = new Map<string, PendingCommand>();
let commandSequence = 0;

export function toWorkspaceUiAssetCandidate(asset: AssetItem): WorkspaceUiAssetCandidate {
  return {
    id: String(asset.id || ""),
    name: String(asset.name || ""),
    address: String(asset.address || ""),
    orgId: asset.org_id ? String(asset.org_id) : undefined,
    platform: String(asset.platform || ""),
    zone: String(asset.zone || ""),
    category: String(asset.category || ""),
    type: String(asset.type || ""),
    isActive: asset.isActive !== false
  };
}

function copyCandidate(candidate: WorkspaceUiAssetCandidate): WorkspaceUiAssetCandidate {
  return { ...candidate };
}

function normalizeQuery(query: string) {
  return query.trim();
}

function commandId() {
  commandSequence += 1;
  return `workspace-ui-${Date.now()}-${commandSequence}`;
}

function selectionReceiptId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  commandSequence += 1;
  return `workspace-selection-${Date.now()}-${commandSequence}`;
}

function abortError() {
  return new WorkspaceUiAutomationError("aborted", "Workspace UI command was cancelled");
}

function useWorkspaceUiAutomationState() {
  const searchQuery = useState<string>("workspace-ui-search-query", () => "");
  const candidates = useState<WorkspaceUiAssetCandidate[]>("workspace-ui-candidates", () => []);
  const focusedAsset = useState<WorkspaceUiAssetCandidate | null>("workspace-ui-focused-asset", () => null);
  const focusedAssetSource = useState<WorkspaceUiFocusSource | null>("workspace-ui-focused-asset-source", () => null);
  const selectionReceipt = useState<WorkspaceUiSelectionReceipt | null>("workspace-ui-selection-receipt", () => null);
  const selectionRequest = useState<WorkspaceUiSelectionRequest | null>("workspace-ui-selection-request", () => null);
  const currentCommand = useState<WorkspaceUiCommand | null>("workspace-ui-current-command", () => null);
  const uiRevision = useState<number>("workspace-ui-revision", () => 0);

  const advanceRevision = () => {
    uiRevision.value += 1;
    return uiRevision.value;
  };

  return {
    searchQuery,
    candidates,
    focusedAsset,
    focusedAssetSource,
    selectionReceipt,
    selectionRequest,
    currentCommand,
    uiRevision,
    advanceRevision
  };
}

function ensureNoPendingCommand(state: ReturnType<typeof useWorkspaceUiAutomationState>) {
  const active = state.currentCommand.value;
  if (active?.status === "pending") {
    throw new WorkspaceUiAutomationError("busy", `Workspace UI command ${active.id} is still running`);
  }
}

function clearPendingCommand(command: WorkspaceUiCommand) {
  const pending = pendingCommands.get(command.id);
  if (!pending) return null;

  clearTimeout(pending.timeout);
  if (pending.signal && pending.abort) pending.signal.removeEventListener("abort", pending.abort);
  pendingCommands.delete(command.id);
  return pending;
}

function createCommand(
  state: ReturnType<typeof useWorkspaceUiAutomationState>,
  type: WorkspaceUiCommand["type"],
  details: Pick<WorkspaceUiCommand, "query" | "assetId">,
  options: WorkspaceUiActionOptions
) {
  ensureNoPendingCommand(state);
  if (options.signal?.aborted) throw abortError();

  const command: WorkspaceUiCommand = {
    id: commandId(),
    type,
    status: "pending",
    ...details
  };
  state.currentCommand.value = command;

  const promise = new Promise<WorkspaceUiCommandAck>((resolve, reject) => {
    const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
    const timeout = setTimeout(() => {
      failCommand(state, command.id, "timeout", `Workspace UI command timed out after ${timeoutMs}ms`);
    }, timeoutMs);
    const pending: PendingCommand = { resolve, reject, timeout, signal: options.signal };
    pendingCommands.set(command.id, pending);

    if (options.signal) {
      pending.abort = () => failCommand(state, command.id, "aborted", "Workspace UI command was cancelled");
      options.signal.addEventListener("abort", pending.abort, { once: true });
      if (options.signal.aborted) pending.abort();
    }
  });

  return { command, promise };
}

function completeCommand(
  state: ReturnType<typeof useWorkspaceUiAutomationState>,
  commandIdValue: string,
  result: Pick<WorkspaceUiCommandAck, "candidates" | "focusedAsset"> = {}
) {
  const command = state.currentCommand.value;
  if (!command || command.id !== commandIdValue || command.status !== "pending") return;

  const pending = clearPendingCommand(command);
  if (!pending) return;

  const ack: WorkspaceUiCommandAck = {
    revision: state.uiRevision.value,
    candidates: result.candidates?.map(copyCandidate),
    focusedAsset: result.focusedAsset ? copyCandidate(result.focusedAsset) : undefined
  };
  state.currentCommand.value = {
    ...command,
    status: "applied"
  };
  pending.resolve(ack);
}

function failCommand(
  state: ReturnType<typeof useWorkspaceUiAutomationState>,
  commandIdValue: string,
  code: string,
  message: string
) {
  const command = state.currentCommand.value;
  if (!command || command.id !== commandIdValue || command.status !== "pending") return;

  const pending = clearPendingCommand(command);
  if (!pending) return;

  state.currentCommand.value = {
    ...command,
    status: "failed"
  };
  pending.reject(new WorkspaceUiAutomationError(code, message));
}

export const useWorkspaceUiAutomation = () => {
  const router = useRouter();
  const { closeSettings } = useSettingsWindow();
  const { setCollapse, setSidebarSections } = useSettingManager();
  const state = useWorkspaceUiAutomationState();

  const snapshot = computed<WorkspaceUiSnapshot>(() => ({
    revision: state.uiRevision.value,
    searchQuery: state.searchQuery.value,
    candidates: state.candidates.value.map(copyCandidate),
    focusedAsset: state.focusedAsset.value ? copyCandidate(state.focusedAsset.value) : null,
    focusedAssetSource: state.focusedAssetSource.value,
    selectionReceipt: state.selectionReceipt.value ? { ...state.selectionReceipt.value } : null
  }));

  const ensureAssetWorkspace = async (signal?: AbortSignal) => {
    if (signal?.aborted) throw abortError();
    await closeSettings();
    if (signal?.aborted) throw abortError();

    if (router.currentRoute.value.path !== "/") await router.push("/");
    setSidebarSections({ assets: true });
    setCollapse(false);
    await nextTick();
    if (signal?.aborted) throw abortError();
  };

  const setSearch = async (queryValue: string, options: WorkspaceUiActionOptions = {}) => {
    ensureNoPendingCommand(state);
    await ensureAssetWorkspace(options.signal);
    const query = normalizeQuery(queryValue);
    const { promise } = createCommand(state, "set-search", { query }, options);

    if (state.searchQuery.value !== query) {
      state.searchQuery.value = query;
      state.candidates.value = [];
      state.focusedAsset.value = null;
      state.focusedAssetSource.value = null;
      state.selectionReceipt.value = null;
      state.selectionRequest.value = null;
      state.advanceRevision();
    }
    await nextTick();
    return promise;
  };

  const focusAsset = async (assetIdValue: string, options: WorkspaceUiFocusOptions = {}) => {
    const assetId = assetIdValue.trim();
    if (!assetId) throw new WorkspaceUiAutomationError("invalid_asset_id", "Asset id is required");

    ensureNoPendingCommand(state);
    await ensureAssetWorkspace(options.signal);
    const query = options.query == null ? undefined : normalizeQuery(options.query);
    if (query !== undefined && query !== state.searchQuery.value) {
      await setSearch(query, options);
    }

    const { promise } = createCommand(state, "focus-asset", { assetId, query }, options);
    await nextTick();
    return promise;
  };

  const requestAssetSelection = () => {
    const assetIds = [...new Set(state.candidates.value.map((candidate) => candidate.id).filter(Boolean))];
    state.selectionRequest.value = assetIds.length ? { id: selectionReceiptId(), assetIds } : null;
  };

  const clearAssetSelectionRequest = () => {
    state.selectionRequest.value = null;
  };

  return {
    uiRevision: readonly(state.uiRevision),
    snapshot,
    setSearch,
    focusAsset,
    requestAssetSelection,
    clearAssetSelectionRequest
  };
};

/**
 * Component-side bridge. Mutations stay here so tool callers only receive
 * readonly state and semantic actions with an acknowledgement.
 */
export const useWorkspaceUiAutomationHost = () => {
  const state = useWorkspaceUiAutomationState();

  const reportSearchQuery = (queryValue: string) => {
    const query = normalizeQuery(queryValue);
    if (state.searchQuery.value !== query) {
      const preserveUserSelection = !query && state.focusedAssetSource.value === "user";
      state.searchQuery.value = query;
      state.candidates.value = [];
      if (!preserveUserSelection) {
        state.focusedAsset.value = null;
        state.focusedAssetSource.value = null;
        state.selectionReceipt.value = null;
      }
      state.selectionRequest.value = null;
      const revision = state.advanceRevision();
      if (preserveUserSelection && state.selectionReceipt.value) {
        state.selectionReceipt.value = { ...state.selectionReceipt.value, revision };
      }
    }

    const command = state.currentCommand.value;
    if (command?.status === "pending" && command.type === "set-search" && command.query === query && !query) {
      completeCommand(state, command.id, { candidates: [] });
    }
  };

  const reportSearchResults = (queryValue: string, candidatesValue: WorkspaceUiAssetCandidate[]) => {
    const query = normalizeQuery(queryValue);
    if (!query || state.searchQuery.value !== query) return;

    state.candidates.value = candidatesValue.map(copyCandidate);
    state.advanceRevision();

    const command = state.currentCommand.value;
    if (command?.status === "pending" && command.type === "set-search" && command.query === query) {
      const assetIds = state.candidates.value.map((candidate) => candidate.id).filter(Boolean);
      state.selectionRequest.value = assetIds.length ? { id: selectionReceiptId(), assetIds } : null;
      completeCommand(state, command.id, { candidates: state.candidates.value });
    }
  };

  const reportFocusedAsset = (asset: AssetItem, options: { commandId?: string; source: WorkspaceUiFocusSource }) => {
    const candidate = toWorkspaceUiAssetCandidate(asset);
    const selectionOnly = Boolean(
      options.source === "user" && state.selectionRequest.value?.assetIds.includes(candidate.id)
    );
    state.focusedAsset.value = candidate;
    state.focusedAssetSource.value = options.source;
    const revision = state.advanceRevision();
    state.selectionReceipt.value =
      options.source === "user"
        ? {
            id: selectionReceiptId(),
            assetId: candidate.id,
            revision
          }
        : null;
    if (selectionOnly) state.selectionRequest.value = null;

    const command = state.currentCommand.value;
    const targetCommandId = options.commandId || command?.id;
    if (
      options.source === "user" &&
      command?.status === "pending" &&
      command.type === "focus-asset" &&
      command.assetId !== candidate.id
    ) {
      failCommand(state, command.id, "superseded_by_user", "User selected a different asset");
      return selectionOnly;
    }
    if (
      command?.status === "pending" &&
      command.type === "focus-asset" &&
      command.id === targetCommandId &&
      command.assetId === candidate.id
    ) {
      completeCommand(state, command.id, { focusedAsset: candidate });
    }
    return selectionOnly;
  };

  const rejectCommand = (commandIdValue: string, code: string, message: string) => {
    failCommand(state, commandIdValue, code, message);
  };

  const resetForContext = (options: { clearSearch?: boolean } = {}) => {
    const command = state.currentCommand.value;
    if (command?.status === "pending") {
      failCommand(state, command.id, "context_changed", "Workspace authorization context changed");
    }

    state.candidates.value = [];
    state.focusedAsset.value = null;
    state.focusedAssetSource.value = null;
    state.selectionReceipt.value = null;
    state.selectionRequest.value = null;
    if (options.clearSearch) state.searchQuery.value = "";
    state.advanceRevision();
  };

  return {
    searchQuery: readonly(state.searchQuery),
    focusedAsset: readonly(state.focusedAsset),
    currentCommand: readonly(state.currentCommand),
    reportSearchQuery,
    reportSearchResults,
    reportFocusedAsset,
    rejectCommand,
    resetForContext
  };
};
