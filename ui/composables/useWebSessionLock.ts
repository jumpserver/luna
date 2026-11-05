import { apiRequest, deferAuthFailureUntil, notifyWebSessionClose } from "~/composables/useApiRequest";
import { isDesktopRuntime, redirectToWebLogin, redirectToWebLogout } from "~/utils/runtime";
import { createWebSessionLock } from "~/utils/webSessionLock";

export interface WebLoginSession {
  scope: string;
  locked: boolean;
  has_password: boolean;
  idle_lock_time: number;
  authenticated_at: string | null;
  expires_at: string | null;
  max_expires_at: string | null;
  session_timeout: number;
  server_time?: string;
  sliding_expiry: boolean;
  expire_at_browser_close: boolean;
  user: { id: string; name: string; username: string };
}

interface WebLockState {
  ready: boolean;
  locked: boolean;
  pending: boolean;
  logoutAt: number;
  attemptsRemaining: number | null;
  error: boolean;
  session: WebLoginSession | null;
}
interface WebLockController {
  start(): Promise<void>;
  sync(): Promise<void>;
  lock(): Promise<void>;
  unlock(password: string): Promise<void>;
  stop(): void;
}
let creating: Promise<WebLockController> | null = null;

export function useWebSessionLock() {
  const state = useState<WebLockState>("web-session-lock", () => ({
    ready: false,
    locked: true,
    pending: false,
    logoutAt: 0,
    attemptsRemaining: null,
    error: false,
    session: null
  }));
  const start = async () => {
    if (!import.meta.client || isDesktopRuntime()) return null;
    if (!creating) {
      creating = (async () => {
        const controller: WebLockController = createWebSessionLock({
          notifyClose: notifyWebSessionClose,
          request: (method: "GET" | "POST", path: string, body?: unknown, headers?: Record<string, string>) =>
            apiRequest({ method, path, headers, ...(body === undefined ? {} : { body }), timeoutMs: 10000 }),
          onChange: (next: WebLockState) => {
            if (next.logoutAt) deferAuthFailureUntil(next.logoutAt);
            if (next.error) console.error("Web session lock status check failed");
            state.value = { ...next, error: Boolean(next.error) };
          },
          onSessionChanged: () => window.location.reload(),
          onUnauthenticated: (authPath?: string) => redirectToWebLogin(authPath)
        });
        await controller.start();
        return controller;
      })().catch((error) => {
        console.error(
          "Web session lock initialization failed:",
          error instanceof Error ? error.message : "Unknown error"
        );
        creating = null;
        state.value = { ...state.value, ready: true, locked: true, error: true };
        throw error;
      });
    }
    return creating;
  };
  return {
    state,
    start,
    lock: async () => (await start())?.lock(),
    unlock: async (password: string) => (await start())?.unlock(password),
    refresh: async () => {
      if (!creating && state.value.error) {
        window.location.reload();
        return;
      }
      await (await start())?.sync();
    },
    logout: () => {
      if (import.meta.client && !isDesktopRuntime()) redirectToWebLogout();
    }
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void creating?.then(
      (controller) => controller.stop(),
      () => {}
    );
  });
}
