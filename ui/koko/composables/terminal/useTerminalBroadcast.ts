import { readonly, shallowReactive, shallowRef } from "vue";

interface BroadcastEndpoint {
  canSend: (data: string, paste: boolean) => boolean;
  send: (data: string, paste: boolean) => void;
}

interface TerminalBroadcast {
  tabId: string;
  sourceId: string;
  targetIds: string[];
}

const endpoints = shallowReactive(new Map<string, BroadcastEndpoint>());
const broadcast = shallowRef<TerminalBroadcast | null>(null);
const failure = shallowRef<{ tabId: string } | null>(null);
let scopeIsCurrent: (() => boolean) | undefined;
let inputIsActive: (() => boolean) | undefined;
let onStop: (() => void) | undefined;
let dispatching = false;

export function isKokoBroadcastWorkspace(tabId: string) {
  return broadcast.value?.tabId === tabId;
}

export function stopKokoTerminalBroadcast(unavailable = false) {
  if (unavailable && broadcast.value) failure.value = { tabId: broadcast.value.tabId };
  const cleanup = onStop;
  onStop = undefined;
  scopeIsCurrent = undefined;
  inputIsActive = undefined;
  broadcast.value = null;
  cleanup?.();
}

export function unregisterKokoBroadcastEndpoint(paneId: string) {
  const group = broadcast.value;
  if (group && (group.sourceId === paneId || group.targetIds.includes(paneId))) stopKokoTerminalBroadcast(true);
  endpoints.delete(paneId);
}

export function registerKokoBroadcastEndpoint(paneId: string, endpoint: BroadcastEndpoint) {
  unregisterKokoBroadcastEndpoint(paneId);
  endpoints.set(paneId, endpoint);
}

export function isKokoBroadcastAvailable(paneId: string) {
  return endpoints.get(paneId)?.canSend("", false) === true;
}

export function startKokoTerminalBroadcast(
  tabId: string,
  sourceId: string,
  targetIds: string[],
  isCurrent: () => boolean,
  cleanup?: () => void,
  canDispatch?: () => boolean
) {
  const participants = [sourceId, ...targetIds];
  if (
    !tabId ||
    targetIds.length < 1 ||
    new Set(participants).size !== participants.length ||
    !isCurrent() ||
    !participants.every(isKokoBroadcastAvailable)
  )
    return false;
  stopKokoTerminalBroadcast();
  scopeIsCurrent = isCurrent;
  inputIsActive = canDispatch;
  onStop = cleanup;
  broadcast.value = { tabId, sourceId, targetIds: [...targetIds] };
  return true;
}

export function updateKokoBroadcastTargets(targetIds: string[], isCurrent: () => boolean) {
  const group = broadcast.value;
  if (!group) return false;
  if (!targetIds.length) {
    stopKokoTerminalBroadcast();
    return true;
  }
  const participants = [group.sourceId, ...targetIds];
  if (
    new Set(participants).size !== participants.length ||
    !isCurrent() ||
    !participants.every(isKokoBroadcastAvailable)
  )
    return false;
  scopeIsCurrent = isCurrent;
  broadcast.value = { ...group, targetIds: [...targetIds] };
  return true;
}

export function validateKokoTerminalBroadcast() {
  const group = broadcast.value;
  if (group && (!scopeIsCurrent?.() || ![group.sourceId, ...group.targetIds].every(isKokoBroadcastAvailable))) {
    stopKokoTerminalBroadcast(true);
  }
}

export function setKokoBroadcastSource(paneId: string) {
  const group = broadcast.value;
  if (!group || !group.targetIds.includes(paneId) || !scopeIsCurrent?.()) return false;
  if (![group.sourceId, ...group.targetIds].every(isKokoBroadcastAvailable)) return false;
  broadcast.value = {
    ...group,
    sourceId: paneId,
    targetIds: group.targetIds.map((id) => (id === paneId ? group.sourceId : id))
  };
  return true;
}

// Only explicit user input enters here. Terminal replies and target writes must stay local.
export function dispatchKokoBroadcastInput(paneId: string, data: string, paste = false) {
  const group = broadcast.value;
  if (dispatching || !group || group.sourceId !== paneId) return "inactive";
  if (inputIsActive && !inputIsActive()) return "blocked";
  const recipients = [group.sourceId, ...group.targetIds].map((id) => endpoints.get(id));
  if (!scopeIsCurrent?.() || recipients.some((endpoint) => !endpoint?.canSend(data, paste))) {
    stopKokoTerminalBroadcast(true);
    return "blocked";
  }
  dispatching = true;
  try {
    for (const endpoint of recipients) endpoint!.send(data, paste);
    return "sent";
  } catch {
    // Sends are not transactional: stop immediately and let the operator inspect every pane.
    stopKokoTerminalBroadcast(true);
    return "blocked";
  } finally {
    dispatching = false;
  }
}

export function useKokoTerminalBroadcast() {
  return { broadcast: readonly(broadcast), failure: readonly(failure) };
}
