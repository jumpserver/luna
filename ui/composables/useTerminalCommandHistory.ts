import type { Store } from "@tauri-apps/plugin-store";
import type { KokoTerminalCommandProfile } from "@jumpserver/koko/host";

export type TerminalCommandHistoryState = Record<string, Partial<Record<KokoTerminalCommandProfile, string[]>>>;

const WEB_STORE_KEY = "jumpserver-client:terminal-command-history";
const STORE_PATH = "terminal-command-history.json";
const STORE_KEY = "history";
const HISTORY_LIMIT = 200;
const HISTORY_CHANGED_EVENT = "jumpserver-client:terminal-command-history-changed";

export function getTerminalCommandHistoryScope(site: string, accountId: string) {
  return site && accountId ? `${site.replace(/\/+$/, "")}::${accountId}` : "";
}

let tauriStore: Store | null = null;
let tauriStorePromise: Promise<Store> | null = null;
let writeQueue = Promise.resolve();

async function ensureTauriStore() {
  if (tauriStore) return tauriStore;
  if (!tauriStorePromise) {
    const { Store } = await import("@tauri-apps/plugin-store");
    tauriStorePromise = Store.load(STORE_PATH, { defaults: { [STORE_KEY]: {} } });
  }
  tauriStore = await tauriStorePromise;
  return tauriStore;
}

async function loadState(): Promise<TerminalCommandHistoryState> {
  if (!import.meta.client) return {};
  if (isTauriRuntime()) {
    const store = await ensureTauriStore();
    return (await store.get<TerminalCommandHistoryState>(STORE_KEY)) || {};
  }

  try {
    return JSON.parse(globalThis.localStorage?.getItem(WEB_STORE_KEY) || "{}") as TerminalCommandHistoryState;
  } catch {
    return {};
  }
}

async function saveState(state: TerminalCommandHistoryState) {
  if (!import.meta.client) return;
  if (isTauriRuntime()) {
    const store = await ensureTauriStore();
    await store.set(STORE_KEY, state);
    await store.save();
    return;
  }
  globalThis.localStorage?.setItem(WEB_STORE_KEY, JSON.stringify(state));
}

function enqueueWrite(update: (state: TerminalCommandHistoryState) => void) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const state = await loadState();
      update(state);
      await saveState(state);
    });
  return writeQueue;
}

export async function loadTerminalCommandHistory(scope: string, profile: KokoTerminalCommandProfile) {
  if (!scope) return [];
  const state = await loadState();
  return [...(state[scope]?.[profile] || [])];
}

export function recordTerminalCommandInState(
  state: TerminalCommandHistoryState,
  scope: string,
  profile: KokoTerminalCommandProfile,
  command: string
) {
  const scoped = state[scope] || {};
  const previous = scoped[profile] || [];
  scoped[profile] = [command, ...previous.filter((item) => item !== command)].slice(0, HISTORY_LIMIT);
  state[scope] = scoped;
}

function emitHistoryChanged(scope: string, profile?: KokoTerminalCommandProfile) {
  globalThis.dispatchEvent?.(new CustomEvent(HISTORY_CHANGED_EVENT, { detail: { scope, profile } }));
}

export function recordTerminalCommandHistory(scope: string, profile: KokoTerminalCommandProfile, command: string) {
  if (!scope || !command) return Promise.resolve();
  return enqueueWrite((state) => recordTerminalCommandInState(state, scope, profile, command)).then(() => {
    emitHistoryChanged(scope, profile);
  });
}

export function clearTerminalCommandHistory(scope: string) {
  if (!scope) return Promise.resolve();
  return enqueueWrite((state) => {
    delete state[scope];
  }).then(() => {
    emitHistoryChanged(scope);
  });
}

export function subscribeTerminalCommandHistory(
  scope: string,
  profile: KokoTerminalCommandProfile,
  listener: (history: string[]) => void
) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ scope?: string; profile?: KokoTerminalCommandProfile }>).detail;
    if (detail?.scope !== scope || (detail.profile && detail.profile !== profile)) return;
    void loadTerminalCommandHistory(scope, profile).then(listener);
  };
  globalThis.addEventListener?.(HISTORY_CHANGED_EVENT, handler);
  return () => globalThis.removeEventListener?.(HISTORY_CHANGED_EVENT, handler);
}
