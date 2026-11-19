import { computed } from "vue";
import { isDesktopRuntime } from "~/utils/runtime";

export interface ClientLockState {
  locked: boolean;
  expired?: boolean;
  logoutAt?: number;
  sessionId: string;
  origin: string;
  username: string;
  idleLockTime: number;
  revision: number;
  lockRevision: number;
  canUnlock: boolean;
  accountLocks?: Record<string, boolean>;
}

// ClientLockGuard publishes snapshots after rejecting stale revisions.
export const useClientLockState = () => useState<ClientLockState | null>("client-lock-state", () => null);

// A remembered login may be selected while its main-process session is still locked.
export function useClientSessionReady(accountId: () => string) {
  const state = isDesktopRuntime() ? useClientLockState() : null;
  return computed(
    () =>
      !state ||
      Boolean(
        state.value?.sessionId === accountId() && state.value?.sessionId && !state.value.locked && !state.value.expired
      )
  );
}
