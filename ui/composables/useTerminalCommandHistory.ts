import type { KokoTerminalCommandProfile } from "#koko/host";
import type { DesktopStore } from "~/shared/desktop/bridge";
import { isSafeTerminalCommandHistory } from "#koko/host";
import { desktopStore } from "~/shared/desktop/bridge";

export type TerminalCommandHistoryState = Record<string, Partial<Record<KokoTerminalCommandProfile, string[]>>>;

const WEB_STORE_KEY = "jumpserver-client:terminal-command-history";
const STORE_PATH = "terminal-command-history.json";
const STORE_KEY = "history";
const HISTORY_LIMIT = 200;
const HISTORY_CHANGED_EVENT = "jumpserver-client:terminal-command-history-changed";

export function getTerminalCommandHistoryScope(site: string, userId: string) {
  const normalizedSite = site.replace(/\/+$/, "");
  const normalizedUserId = userId.trim();
  if (!normalizedSite || !normalizedUserId) return "";
  if (/^https?:\/\//i.test(normalizedUserId) || normalizedUserId === normalizedSite) return "";
  return `${normalizedSite}::${normalizedUserId}`;
}

export function getAuthenticatedTerminalCommandHistoryScope(options: {
  authenticated: boolean;
  site: string;
  userId: string;
}) {
  if (!options.authenticated) return "";
  return getTerminalCommandHistoryScope(options.site, options.userId);
}

let storeInstance: DesktopStore | null = null;
let storePromise: Promise<DesktopStore> | null = null;
let writeQueue = Promise.resolve();

async function ensureStore() {
  if (storeInstance) return storeInstance;
  if (!storePromise) storePromise = desktopStore.load(STORE_PATH, { [STORE_KEY]: {} });
  storeInstance = await storePromise;
  return storeInstance;
}

async function loadState(): Promise<TerminalCommandHistoryState> {
  if (!import.meta.client) return {};
  if (isDesktopRuntime()) {
    const store = await ensureStore();
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
  if (isDesktopRuntime()) {
    const store = await ensureStore();
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
  const history = state?.[scope]?.[profile];
  return Array.isArray(history) ? history.filter(isSafeTerminalCommandHistory).slice(0, HISTORY_LIMIT) : [];
}

export function recordTerminalCommandInState(
  state: TerminalCommandHistoryState,
  scope: string,
  profile: KokoTerminalCommandProfile,
  command: string
) {
  if (!scope || !isSafeTerminalCommandHistory(command)) return;
  const scoped = state[scope] || {};
  const previous = Array.isArray(scoped[profile]) ? scoped[profile].filter(isSafeTerminalCommandHistory) : [];
  scoped[profile] = [command, ...previous.filter((item) => item !== command)].slice(0, HISTORY_LIMIT);
  state[scope] = scoped;
}

function emitHistoryChanged(scope: string, profile?: KokoTerminalCommandProfile) {
  const detail = { scope, profile };
  if (typeof CustomEvent !== "undefined") {
    globalThis.dispatchEvent?.(new CustomEvent(HISTORY_CHANGED_EVENT, { detail }));
  }
}

export function recordTerminalCommandHistory(scope: string, profile: KokoTerminalCommandProfile, command: string) {
  if (!scope || !isSafeTerminalCommandHistory(command)) return Promise.resolve();
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
  let disposed = false;
  let stopDesktopListener = () => {};
  const reload = () => {
    void loadTerminalCommandHistory(scope, profile).then((history) => {
      if (!disposed) listener(history);
    });
  };
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ scope?: string; profile?: KokoTerminalCommandProfile }>).detail;
    if (detail?.scope !== scope || (detail.profile && detail.profile !== profile)) return;
    reload();
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key === WEB_STORE_KEY) reload();
  };

  globalThis.addEventListener?.(HISTORY_CHANGED_EVENT, handler);
  globalThis.addEventListener?.("storage", storageHandler);
  if (isDesktopRuntime()) {
    void ensureStore()
      .then((store) => store.onChange((key) => key === STORE_KEY && reload()))
      .then((unlisten) => {
        if (disposed) unlisten();
        else stopDesktopListener = unlisten;
      })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    globalThis.removeEventListener?.(HISTORY_CHANGED_EVENT, handler);
    globalThis.removeEventListener?.("storage", storageHandler);
    stopDesktopListener();
  };
}
