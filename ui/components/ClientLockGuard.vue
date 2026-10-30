<script setup lang="ts">
import type { ClientPolicyNotice } from "~/components/ClientPolicyNotices.vue";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { isElectronRuntime } from "~/utils/runtime";

interface LockState {
  locked: boolean;
  sessionId: string;
  origin: string;
  username: string;
  idleLockTime: number;
  revision: number;
  canUnlock: boolean;
}

const { t } = useI18n();
const desktop = isElectronRuntime();
const ready = useState("auth-bootstrap-ready", () => false);
const state = shallowRef<LockState | null>(null);
const shield = useTemplateRef<HTMLDialogElement>("shield");
const password = ref("");
const hasPassword = ref<boolean | null>(null);
const settingsUrl = ref("");
const busy = ref(false);
const confirmLogout = ref(false);
const error = ref("");
const blocked = computed(
  () =>
    desktop && (!state.value || state.value.locked || (!state.value.sessionId && state.value.canUnlock && !ready.value))
);
let unlisten: (() => void) | undefined;
let unlistenNotices: (() => void) | undefined;
const notices = shallowRef<ClientPolicyNotice[]>([]);
const dismissed = reactive(new Set<string>());
const visibleNotices = computed(() => notices.value.filter((notice) => !dismissed.has(notice.id)));
let requestSequence = 0;

async function loadInfo() {
  const snapshot = state.value;
  if (!snapshot?.locked || !snapshot.canUnlock) return;
  error.value = "";
  hasPassword.value = null;
  try {
    const info = await desktopInvoke<{ hasPassword: boolean; settingsUrl: string }>("client_lock_info");
    if (state.value?.sessionId !== snapshot.sessionId || state.value.revision !== snapshot.revision) return;
    hasPassword.value = info.hasPassword;
    settingsUrl.value = info.settingsUrl;
    if (info.hasPassword) {
      await nextTick();
      shield.value?.querySelector<HTMLInputElement>("input")?.focus();
    }
  } catch {
    error.value = t("ClientLock.LoadFailed");
  }
}

function applyState(next: LockState) {
  if (state.value && next.revision < state.value.revision) return;
  const changed =
    state.value?.sessionId !== next.sessionId ||
    state.value?.locked !== next.locked ||
    state.value?.revision !== next.revision;
  state.value = next;
  if (changed) {
    password.value = "";
    hasPassword.value = null;
    settingsUrl.value = "";
    error.value = "";
    confirmLogout.value = false;
    if (next.locked && next.canUnlock) void loadInfo();
  }
}

async function refreshState() {
  const sequence = ++requestSequence;
  try {
    const next = await desktopInvoke<LockState>("client_lock_state");
    if (sequence === requestSequence) applyState(next);
  } catch {
    error.value = t("ClientLock.LoadFailed");
  }
}

async function unlock() {
  if (busy.value || !password.value) return;
  busy.value = true;
  error.value = "";
  try {
    await desktopInvoke("client_unlock", { password: password.value });
    await refreshState();
  } catch (cause) {
    error.value = t(String(cause).includes("429") ? "ClientLock.TooManyAttempts" : "ClientLock.UnlockFailed");
  } finally {
    password.value = "";
    busy.value = false;
  }
}

async function openSettings() {
  try {
    await desktopInvoke("client_lock_settings");
  } catch {
    error.value = t("ClientLock.LoadFailed");
  }
}

async function logout() {
  busy.value = true;
  try {
    await desktopInvoke("client_lock_logout");
    await refreshState();
  } catch {
    error.value = t("ClientLock.LoadFailed");
  } finally {
    busy.value = false;
  }
}

watch(
  [blocked, shield],
  async () => {
    await nextTick();
    if (blocked.value && shield.value && !shield.value.open) shield.value.showModal();
    else if (!blocked.value && shield.value?.open) shield.value.close();
  },
  { flush: "post" }
);

onMounted(async () => {
  if (!desktop) return;
  unlisten = await desktopListen<LockState>("client-lock-state", ({ payload }) => {
    ++requestSequence;
    applyState(payload);
  });
  unlistenNotices = await desktopListen<ClientPolicyNotice[]>("client-policy-notices", ({ payload }) => {
    notices.value = payload;
  });
  notices.value = await desktopInvoke<ClientPolicyNotice[]>("client_policy_notices");
  await refreshState();
});
onBeforeUnmount(() => {
  unlisten?.();
  unlistenNotices?.();
});
</script>

<template>
  <div :inert="blocked || undefined" class="contents">
    <slot />
  </div>
  <ClientPolicyNotices v-if="desktop && !blocked" :notices="visibleNotices" @dismiss="dismissed.add($event)" />
  <dialog
    v-if="desktop"
    ref="shield"
    class="client-lock-shield"
    aria-labelledby="client-lock-title"
    aria-describedby="client-lock-description"
    @cancel.prevent
    @keydown.stop
    @keyup.stop
    @click.stop
    @pointerdown.stop
  >
    <div class="flex min-h-full items-center justify-center p-8">
      <UCard class="w-full max-w-md">
        <div class="flex flex-col gap-5">
          <UIcon name="i-lucide-lock-keyhole" class="size-9 text-primary" />
          <div>
            <h1 id="client-lock-title" class="text-lg font-semibold">{{ t("ClientLock.Title") }}</h1>
            <p id="client-lock-description" class="mt-2 text-sm text-muted">
              {{ t(state?.canUnlock ? "ClientLock.Description" : "ClientLock.MainOnly") }}
            </p>
          </div>
          <div v-if="state?.sessionId" class="break-all text-sm">
            <div class="font-medium">{{ state.username }}</div>
            <div class="mt-1 text-muted">{{ state.origin }}</div>
          </div>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
          <template v-if="state?.locked && state.canUnlock">
            <UAlert v-if="hasPassword === false" color="warning" variant="soft" :description="t('ClientLock.Unset')" />
            <form v-if="hasPassword === true" class="flex flex-col gap-4" @submit.prevent="unlock">
              <UFormField :label="t('ClientLock.Password')" required>
                <UInput
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  :maxlength="128"
                  class="w-full"
                  autofocus
                  :disabled="busy"
                />
              </UFormField>
              <UButton type="submit" block :loading="busy" :disabled="!password">{{ t("ClientLock.Unlock") }}</UButton>
            </form>
            <UButton
              v-if="hasPassword !== null"
              color="neutral"
              variant="outline"
              :disabled="busy"
              @click="openSettings"
            >
              {{ t(hasPassword ? "ClientLock.Reset" : "ClientLock.SetPassword") }}
            </UButton>
            <p v-if="hasPassword === false && settingsUrl" class="break-all text-xs text-muted">{{ settingsUrl }}</p>
            <div class="flex justify-between gap-3">
              <UButton color="neutral" variant="ghost" :disabled="busy" @click="loadInfo">
                {{ t("ClientLock.Refresh") }}
              </UButton>
              <UButton color="neutral" variant="ghost" :disabled="busy" @click="confirmLogout = true">
                {{ t("ClientLock.Logout") }}
              </UButton>
            </div>
            <template v-if="confirmLogout">
              <UAlert color="warning" variant="soft" :description="t('Login.LogoutSessionsDescription')" />
              <div class="flex justify-end gap-3">
                <UButton color="neutral" variant="ghost" :disabled="busy" @click="confirmLogout = false">
                  {{ t("Common.Cancel") }}
                </UButton>
                <UButton color="warning" :loading="busy" @click="logout">{{ t("Common.Confirm") }}</UButton>
              </div>
            </template>
          </template>
          <UButton v-else-if="state?.locked" block @click="desktopInvoke('client_lock_show_main')">
            {{ t("ClientLock.GoToMain") }}
          </UButton>
          <UButton v-else-if="error" color="neutral" @click="refreshState">{{ t("ClientLock.Refresh") }}</UButton>
          <UIcon v-else name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
        </div>
      </UCard>
    </div>
    <ClientPolicyNotices v-if="blocked" :notices="visibleNotices" @dismiss="dismissed.add($event)" />
  </dialog>
</template>

<style scoped>
.client-lock-shield {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--app-text-primary);
  background: var(--app-surface-canvas);
}
.client-lock-shield::backdrop {
  background: var(--app-surface-canvas);
}
</style>
