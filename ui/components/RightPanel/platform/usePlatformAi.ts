import type {
  PlatformAiApproval,
  PlatformAiAssistant,
  PlatformAiConversation,
  PlatformAiMessage,
  PlatformAiResultCard,
  PlatformAiStreamEvent
} from "./api";
import {
  cancelPlatformAiConversation,
  confirmPlatformAiApproval,
  createPlatformAiConversation,
  deletePlatformAiConversation,
  getPlatformAiApproval,
  listPlatformAiAssistants,
  listPlatformAiConversations,
  listPlatformAiMessages,
  platformConversationResults,
  rejectPlatformAiApproval,
  serverResults,
  streamPlatformAiMessage,
  toPlatformAiError,
  updatePlatformAiConversation
} from "./api";

export interface PlatformAiTrace {
  id: string;
  type: "progress" | "api_search" | "api_call" | "web_search" | "error";
  status: "running" | "completed" | "failed" | "approval";
  data: Record<string, any>;
  timestamp: number;
}

const DEFAULT_ASSISTANT: PlatformAiAssistant = {
  key: "general",
  name: "JumpServer AI",
  description: "",
  starter_prompts: []
};
const APPROVAL_STORAGE_KEY = "jumpserver_luna_platform_ai_approvals";

const conversations = shallowRef<PlatformAiConversation[]>([]);
const assistants = shallowRef<PlatformAiAssistant[]>([DEFAULT_ASSISTANT]);
const selectedAssistantKey = shallowRef(DEFAULT_ASSISTANT.key);
const activeConversationId = shallowRef("");
const messages = ref<PlatformAiMessage[]>([]);
const traces = ref<Record<string, PlatformAiTrace[]>>({});
const approval = shallowRef<PlatformAiApproval | null>(null);
const loadingConversations = shallowRef(false);
const loadingMessages = shallowRef(false);
const streaming = shallowRef(false);
const stopping = shallowRef(false);
const preparing = shallowRef(false);
const approvalProcessing = shallowRef(false);
const initialized = shallowRef(false);
const lastError = shallowRef<ReturnType<typeof toPlatformAiError> | null>(null);
let sessionScope = "";
let abortController: AbortController | null = null;
let temporaryAssistantId = "";
let activeStreamMessageId = "";
let streamConversationId = "";
let stopRequested = false;
let messageRequestId = 0;
let remotePollTimer: ReturnType<typeof setTimeout> | null = null;

function temporaryId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readApprovalStorage() {
  try {
    return JSON.parse(sessionStorage.getItem(APPROVAL_STORAGE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberApproval(conversationId: string, approvalId: string) {
  if (!conversationId || !approvalId) return;
  const stored = readApprovalStorage();
  stored[conversationId] = approvalId;
  try {
    sessionStorage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Approval recovery remains available for the current panel lifetime.
  }
}

function forgetApproval(conversationId: string) {
  if (!conversationId) return;
  const stored = readApprovalStorage();
  delete stored[conversationId];
  try {
    sessionStorage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Session storage is optional.
  }
}

function normalizeMessage(message: Partial<PlatformAiMessage> & Pick<PlatformAiMessage, "id" | "role">) {
  return {
    id: message.id,
    role: message.role,
    content: message.content || "",
    status: message.status || "completed",
    error: message.error || "",
    result_cards: Array.isArray(message.result_cards) ? message.result_cards.map((card) => ({ ...card })) : [],
    date_created: message.date_created || new Date().toISOString()
  } satisfies PlatformAiMessage;
}

function restoredTrace(message: PlatformAiMessage): PlatformAiTrace[] {
  const restored: PlatformAiTrace[] = [];
  for (const [index, card] of (message.result_cards || []).entries()) {
    if (card.type === "progress" && typeof card.content?.text === "string") {
      restored.push({
        id: `restored-progress-${message.id}-${index}`,
        type: "progress",
        status: "completed",
        data: { content: card.content.text },
        timestamp: Date.parse(String(card.content.timestamp || "")) || 0
      });
      continue;
    }
    if (card.source?.type === "core_api") {
      restored.push({
        id: `restored-api-${message.id}-${index}`,
        type: "api_call",
        status: Number(card.source.status_code) >= 400 ? "failed" : "completed",
        data: {
          operation_id: card.source.operation_id,
          action: card.source.action,
          summary: card.title
        },
        timestamp: Date.parse(String(card.source.timestamp || "")) || 0
      });
      continue;
    }
    if (card.type === "sources" || card.source?.type === "web_search") {
      const sources = Array.isArray(card.content?.sources) ? card.content.sources.length : 0;
      restored.push({
        id: `restored-web-${message.id}-${index}`,
        type: "web_search",
        status: "completed",
        data: { action: card.source?.action, sourceCount: sources },
        timestamp: Date.parse(String(card.source?.timestamp || "")) || 0
      });
    }
  }
  return restored;
}

const activeConversation = computed(
  () => conversations.value.find((item) => item.id === activeConversationId.value) || null
);
const currentAssistant = computed(
  () =>
    assistants.value.find((item) => item.key === selectedAssistantKey.value) || assistants.value[0] || DEFAULT_ASSISTANT
);
const visibleMessages = computed(() => messages.value.filter((item) => !["system", "tool"].includes(item.role)));
const lastMessage = computed(() => visibleMessages.value.at(-1) || null);
const awaitingApproval = computed(
  () => approval.value?.status === "pending" || lastMessage.value?.status === "awaiting_approval"
);
const recoverableRun = computed(
  () => !streaming.value && ["pending", "streaming"].includes(lastMessage.value?.status || "")
);
const busy = computed(
  () =>
    streaming.value ||
    stopping.value ||
    preparing.value ||
    approvalProcessing.value ||
    awaitingApproval.value ||
    recoverableRun.value
);

function clearRemotePoll() {
  if (remotePollTimer) clearTimeout(remotePollTimer);
  remotePollTimer = null;
}

function resetState(nextScope = "") {
  clearRemotePoll();
  abortController?.abort();
  abortController = null;
  sessionScope = nextScope;
  conversations.value = [];
  assistants.value = [DEFAULT_ASSISTANT];
  selectedAssistantKey.value = DEFAULT_ASSISTANT.key;
  activeConversationId.value = "";
  messages.value = [];
  traces.value = {};
  approval.value = null;
  initialized.value = false;
  lastError.value = null;
  streaming.value = false;
  stopping.value = false;
  preparing.value = false;
  approvalProcessing.value = false;
}

function setError(error: unknown) {
  const normalized = toPlatformAiError(error);
  lastError.value = normalized;
  return normalized;
}

function updateConversationLocally(id: string, changes: Partial<PlatformAiConversation>) {
  conversations.value = conversations.value
    .map((item) => (item.id === id ? { ...item, ...changes } : item))
    .sort((left, right) => Date.parse(right.date_updated || "") - Date.parse(left.date_updated || ""));
}

function scheduleRemotePoll(id: string) {
  clearRemotePoll();
  if (activeConversationId.value !== id || (!recoverableRun.value && !awaitingApproval.value)) return;
  remotePollTimer = setTimeout(() => {
    remotePollTimer = null;
    void loadMessages(id, true);
  }, 2000);
}

async function restoreApproval(conversationId: string) {
  approval.value = null;
  if (lastMessage.value?.status !== "awaiting_approval") {
    forgetApproval(conversationId);
    return;
  }
  const approvalId = readApprovalStorage()[conversationId];
  if (!approvalId) return;
  try {
    const restored = await getPlatformAiApproval(approvalId);
    if (restored.status === "pending") approval.value = { ...restored, id: restored.id || approvalId };
    else forgetApproval(conversationId);
  } catch {
    forgetApproval(conversationId);
  }
}

async function loadMessages(id = activeConversationId.value, silent = false) {
  const requestId = ++messageRequestId;
  clearRemotePoll();
  if (!id) {
    messages.value = [];
    traces.value = {};
    approval.value = null;
    return true;
  }
  if (!silent) loadingMessages.value = true;
  try {
    const response = await listPlatformAiMessages(id);
    if (requestId !== messageRequestId || activeConversationId.value !== id) return false;
    messages.value = response.map(normalizeMessage);
    traces.value = Object.fromEntries(
      messages.value
        .map((message): [string, PlatformAiTrace[]] => [message.id, restoredTrace(message)])
        .filter((entry) => entry[1].length > 0)
    );
    await restoreApproval(id);
    lastError.value = null;
    return true;
  } catch (error) {
    if (!silent && requestId === messageRequestId) setError(error);
    return false;
  } finally {
    if (!silent && requestId === messageRequestId) loadingMessages.value = false;
    if (requestId === messageRequestId) scheduleRemotePoll(id);
  }
}

async function selectConversation(id: string) {
  if (!id || id === activeConversationId.value) return true;
  if (busy.value) return false;
  const conversation = conversations.value.find((item) => item.id === id);
  selectedAssistantKey.value = conversation?.assistant || DEFAULT_ASSISTANT.key;
  activeConversationId.value = id;
  messages.value = [];
  traces.value = {};
  approval.value = null;
  lastError.value = null;
  return loadMessages(id);
}

async function loadConversations(selectFirst = false, silent = false) {
  if (!silent) loadingConversations.value = true;
  try {
    conversations.value = platformConversationResults(await listPlatformAiConversations());
    if (activeConversationId.value && !conversations.value.some((item) => item.id === activeConversationId.value)) {
      activeConversationId.value = "";
    }
    if (selectFirst && !activeConversationId.value && conversations.value.length) {
      await selectConversation(conversations.value[0]!.id);
    }
    lastError.value = null;
    return true;
  } catch (error) {
    setError(error);
    return false;
  } finally {
    if (!silent) loadingConversations.value = false;
  }
}

async function initialize(scope: string) {
  if (sessionScope !== scope) resetState(scope);
  if (initialized.value || loadingConversations.value) return;
  loadingConversations.value = true;
  try {
    const assistantResponse = await listPlatformAiAssistants();
    const availableAssistants = serverResults(assistantResponse);
    if (!availableAssistants.length) throw new Error("Platform AI has no available assistants");
    assistants.value = availableAssistants;
    if (!availableAssistants.some((item) => item.key === selectedAssistantKey.value)) {
      selectedAssistantKey.value = availableAssistants[0]!.key;
    }
    const loaded = await loadConversations(true, true);
    initialized.value = loaded;
  } catch (error) {
    setError(error);
  } finally {
    loadingConversations.value = false;
  }
}

function newConversation() {
  if (busy.value) return false;
  clearRemotePoll();
  activeConversationId.value = "";
  messages.value = [];
  traces.value = {};
  approval.value = null;
  lastError.value = null;
  return true;
}

async function selectAssistant(key: string) {
  if (!key || key === selectedAssistantKey.value) return true;
  if (busy.value || !assistants.value.some((item) => item.key === key)) return false;
  const previous = selectedAssistantKey.value;
  selectedAssistantKey.value = key;
  if (!activeConversationId.value) return true;
  try {
    const updated = await updatePlatformAiConversation(activeConversationId.value, { assistant: key });
    updateConversationLocally(updated.id, updated);
    return true;
  } catch (error) {
    selectedAssistantKey.value = previous;
    setError(error);
    return false;
  }
}

async function ensureConversation(content: string) {
  if (activeConversation.value) return activeConversation.value;
  const conversation = await createPlatformAiConversation(selectedAssistantKey.value);
  conversations.value = [conversation, ...conversations.value.filter((item) => item.id !== conversation.id)];
  activeConversationId.value = conversation.id;
  updateConversationLocally(conversation.id, {
    title: content.replace(/\s+/g, " ").trim().slice(0, 80),
    date_updated: new Date().toISOString()
  });
  return conversation;
}

function messageById(id: string) {
  return messages.value.find((item) => item.id === id);
}

function transferTemporaryMessage(realId: string) {
  if (!realId) return;
  const message = messageById(temporaryAssistantId);
  if (message) message.id = realId;
  if (traces.value[temporaryAssistantId]) {
    traces.value[realId] = traces.value[temporaryAssistantId]!;
    delete traces.value[temporaryAssistantId];
  }
  activeStreamMessageId = realId;
  temporaryAssistantId = "";
}

function currentStreamMessage() {
  return messageById(activeStreamMessageId || temporaryAssistantId);
}

function appendTrace(
  type: PlatformAiTrace["type"],
  data: Record<string, any>,
  status: PlatformAiTrace["status"] = "running"
) {
  const messageId = activeStreamMessageId || temporaryAssistantId;
  if (!messageId) return;
  const items = traces.value[messageId] || [];
  items.push({ id: temporaryId(type), type, data, status, timestamp: Date.now() });
  traces.value[messageId] = items;
}

function updateLastTrace(
  type: PlatformAiTrace["type"],
  matcher: ((trace: PlatformAiTrace) => boolean) | null,
  data: Record<string, any>,
  status: PlatformAiTrace["status"]
) {
  const items = traces.value[activeStreamMessageId || temporaryAssistantId] || [];
  const trace = [...items].reverse().find((item) => item.type === type && (!matcher || matcher(item)));
  if (!trace) return;
  trace.data = { ...trace.data, ...data };
  trace.status = status;
  trace.timestamp = Date.now();
}

function handleStreamEvent({ event, data }: PlatformAiStreamEvent) {
  const payload = data && typeof data === "object" ? data : { content: String(data || "") };
  if (event === "message_start") transferTemporaryMessage(String(payload.message_id || ""));
  if (event === "message_delta") {
    const message = currentStreamMessage();
    if (message) message.content += payload.content || "";
  }
  if (event === "agent_progress") appendTrace("progress", { content: payload.content || "" }, "completed");
  if (event === "api_search_start") appendTrace("api_search", payload);
  if (event === "api_search_result") {
    updateLastTrace("api_search", null, { ...payload, operationCount: payload.operations?.length || 0 }, "completed");
  }
  if (event === "web_search_start") appendTrace("web_search", payload);
  if (event === "web_search_result") {
    updateLastTrace(
      "web_search",
      null,
      { ...payload, sourceCount: payload.sources?.length || 0 },
      payload.ok ? "completed" : "failed"
    );
  }
  if (event === "api_call_start") appendTrace("api_call", payload);
  if (event === "api_call_result") {
    updateLastTrace(
      "api_call",
      (item) => item.data.operation_id === payload.operation_id && item.status === "running",
      payload,
      payload.ok ? "completed" : "failed"
    );
  }
  if (event === "approval_required") {
    approval.value = {
      ...payload,
      id: String(payload.approval_id || ""),
      status: "pending"
    };
    rememberApproval(activeConversationId.value, String(payload.approval_id || ""));
    updateLastTrace("api_call", (item) => item.data.operation_id === payload.operation_id, payload, "approval");
  }
  if (event === "message_done") {
    const message = messageById(String(payload.message_id || "")) || currentStreamMessage();
    if (message) {
      message.status = payload.status || "completed";
      if (Array.isArray(payload.result_cards)) {
        message.result_cards = payload.result_cards.map((card: PlatformAiResultCard) => ({ ...card }));
        traces.value[message.id] = restoredTrace(message);
      }
    }
  }
  if (event === "message_error") {
    const message = messageById(String(payload.message_id || "")) || currentStreamMessage();
    if (message) {
      message.status = "failed";
      message.error = payload.detail || payload.code || "";
    }
    appendTrace("error", payload, "failed");
  }
}

async function sendMessage(rawContent: string) {
  const content = rawContent.trim();
  if (!content || busy.value) return false;
  clearRemotePoll();
  lastError.value = null;
  stopRequested = false;
  preparing.value = true;
  let conversation: PlatformAiConversation;
  try {
    conversation = await ensureConversation(content);
  } catch (error) {
    setError(error);
    return false;
  } finally {
    preparing.value = false;
  }

  const now = new Date().toISOString();
  temporaryAssistantId = temporaryId("assistant");
  activeStreamMessageId = "";
  messages.value.push(
    normalizeMessage({ id: temporaryId("user"), role: "user", content, date_created: now }),
    normalizeMessage({
      id: temporaryAssistantId,
      role: "assistant",
      content: "",
      status: "streaming",
      date_created: now
    })
  );
  traces.value[temporaryAssistantId] = [];
  updateConversationLocally(conversation.id, {
    title: conversation.title || content.replace(/\s+/g, " ").slice(0, 80),
    date_updated: now
  });
  streaming.value = true;
  streamConversationId = conversation.id;
  abortController = new AbortController();

  try {
    await streamPlatformAiMessage(conversation.id, content, {
      signal: abortController.signal,
      onEvent: handleStreamEvent
    });
    const message = currentStreamMessage();
    if (message?.status === "streaming") message.status = approval.value ? "awaiting_approval" : "completed";
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return false;
    const normalized = setError(error);
    const message = currentStreamMessage();
    if (message) {
      message.status = "failed";
      message.error = normalized.message;
    }
    return false;
  } finally {
    streaming.value = false;
    abortController = null;
    streamConversationId = "";
    temporaryAssistantId = "";
    activeStreamMessageId = "";
    if (!stopRequested) await loadConversations(false, true);
  }
}

async function stopGeneration() {
  if (stopping.value || preparing.value || approvalProcessing.value) return;
  const conversationId = streamConversationId || activeConversationId.value;
  if (!conversationId) return;
  stopping.value = true;
  stopRequested = true;
  abortController?.abort();
  try {
    await cancelPlatformAiConversation(conversationId);
  } catch (error) {
    setError(error);
  } finally {
    forgetApproval(conversationId);
    approval.value = null;
    await loadMessages(conversationId);
    await loadConversations(false, true);
    stopping.value = false;
    stopRequested = false;
  }
}

async function confirmApproval() {
  if (!approval.value?.id || approvalProcessing.value) return false;
  approvalProcessing.value = true;
  try {
    await confirmPlatformAiApproval(approval.value.id);
    forgetApproval(activeConversationId.value);
    approval.value = null;
    await loadMessages();
    await loadConversations(false, true);
    return true;
  } catch (error) {
    setError(error);
    return false;
  } finally {
    approvalProcessing.value = false;
  }
}

async function rejectApproval() {
  if (approvalProcessing.value) return false;
  if (!approval.value?.id) {
    await stopGeneration();
    return true;
  }
  approvalProcessing.value = true;
  try {
    await rejectPlatformAiApproval(approval.value.id);
    forgetApproval(activeConversationId.value);
    approval.value = null;
    await loadMessages();
    await loadConversations(false, true);
    return true;
  } catch (error) {
    setError(error);
    return false;
  } finally {
    approvalProcessing.value = false;
  }
}

async function renameConversation(id: string, title: string) {
  try {
    const updated = await updatePlatformAiConversation(id, { title: title.trim() });
    updateConversationLocally(id, updated);
    return true;
  } catch (error) {
    setError(error);
    return false;
  }
}

async function removeConversation(id: string) {
  if (busy.value && activeConversationId.value === id) return false;
  try {
    await deletePlatformAiConversation(id);
    forgetApproval(id);
    conversations.value = conversations.value.filter((item) => item.id !== id);
    if (activeConversationId.value === id) {
      activeConversationId.value = "";
      messages.value = [];
      traces.value = {};
      approval.value = null;
      if (conversations.value.length) await selectConversation(conversations.value[0]!.id);
    }
    return true;
  } catch (error) {
    setError(error);
    return false;
  }
}

export function usePlatformAi() {
  return {
    conversations,
    assistants,
    selectedAssistantKey,
    activeConversation,
    activeConversationId,
    currentAssistant,
    messages,
    visibleMessages,
    traces,
    approval,
    loadingConversations,
    loadingMessages,
    streaming,
    stopping,
    preparing,
    approvalProcessing,
    initialized,
    lastError,
    awaitingApproval,
    recoverableRun,
    busy,
    reset: resetState,
    initialize,
    loadConversations,
    loadMessages,
    selectConversation,
    newConversation,
    selectAssistant,
    sendMessage,
    stopGeneration,
    confirmApproval,
    rejectApproval,
    renameConversation,
    removeConversation
  };
}
