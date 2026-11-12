<script setup lang="ts">
import type { ClientPolicyNotice } from "~/types";
import { Translation as I18nT } from "vue-i18n";
import { deferAuthFailureUntil } from "~/composables/useApiRequest";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isElectronRuntime } from "~/utils/runtime";

interface LockState {
  locked: boolean;
  logoutAt?: number;
  sessionId: string;
  origin: string;
  username: string;
  idleLockTime: number;
  revision: number;
  lockRevision: number;
  canUnlock: boolean;
}

const { t } = useI18n();
const desktop = isElectronRuntime();
const ready = useState("auth-bootstrap-ready", () => false);
const state = shallowRef<LockState | null>(null);
const userInfo = useUserInfoStore();
const userName = computed(() => {
  const account = userInfo.userMap[state.value?.sessionId || ""];
  const name = account?.name;
  const username = account?.username || state.value?.username;
  return name && username ? `${name} (${username})` : name || username || "";
});
const shield = useTemplateRef<HTMLDialogElement>("shield");
const password = ref("");
const hasPassword = ref<boolean | null>(null);
const settingsUrl = ref("");
const linkCopied = ref(false);
const { start: resetCopyFeedback, stop: stopCopyFeedback } = useTimeoutFn(
  () => {
    linkCopied.value = false;
  },
  3000,
  { immediate: false }
);
const pendingAction = ref<"unlock" | "logout" | null>(null);
const busy = computed(() => pendingAction.value !== null);
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
    const info = await desktopInvoke<{ hasPassword: boolean; settingsUrl: string; attemptsRemaining?: number }>(
      "client_lock_info"
    );
    if (state.value?.sessionId !== snapshot.sessionId || state.value.lockRevision !== snapshot.lockRevision) return;
    hasPassword.value = info.hasPassword;
    if (
      info.hasPassword &&
      typeof info.attemptsRemaining === "number" &&
      info.attemptsRemaining > 0 &&
      info.attemptsRemaining < 5
    ) {
      error.value = t("ScreenLock.AttemptsRemaining", { count: info.attemptsRemaining });
    }
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
  if (next.logoutAt) deferAuthFailureUntil(next.logoutAt);
  const changed =
    state.value?.sessionId !== next.sessionId ||
    state.value?.locked !== next.locked ||
    state.value?.lockRevision !== next.lockRevision;
  state.value = next;
  if (changed) {
    password.value = "";
    hasPassword.value = null;
    settingsUrl.value = "";
    stopCopyFeedback();
    linkCopied.value = false;
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
  pendingAction.value = "unlock";
  error.value = "";
  try {
    const result = await desktopInvoke<LockState & { attemptsRemaining?: number }>("client_unlock", {
      password: password.value
    });
    if (Number.isInteger(result?.attemptsRemaining))
      error.value = t("ScreenLock.AttemptsRemaining", { count: result.attemptsRemaining! });
    await refreshState();
  } catch (cause) {
    error.value = t(String(cause).includes("429") ? "ClientLock.TooManyAttempts" : "ClientLock.UnlockFailed");
  } finally {
    password.value = "";
    pendingAction.value = null;
    await nextTick();
    if (shield.value?.open) shield.value.querySelector<HTMLInputElement>("input")?.focus();
  }
}

async function openSettings() {
  try {
    await desktopInvoke("client_lock_settings");
  } catch {
    error.value = t("ClientLock.LoadFailed");
  }
}

async function copySettingsUrl() {
  if (!settingsUrl.value || busy.value) return;
  try {
    await desktopInvoke("client_lock_copy_settings");
    linkCopied.value = true;
    resetCopyFeedback();
  } catch {
    error.value = t("Common.CopyFailed");
  }
}

async function logout() {
  pendingAction.value = "logout";
  try {
    await desktopInvoke("client_lock_logout");
    await refreshState();
  } catch {
    error.value = t("ClientLock.LoadFailed");
  } finally {
    pendingAction.value = null;
  }
}

watch(
  [blocked, shield],
  async () => {
    await nextTick();
    if (blocked.value && shield.value && !shield.value.open) {
      shield.value.showModal();
      (
        shield.value.querySelector<HTMLInputElement>("input") ||
        shield.value.querySelector<HTMLElement>(".screen-lock-heading")
      )?.focus({ preventScroll: true });
    } else if (!blocked.value && shield.value?.open) shield.value.close();
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
  await refreshState();
  notices.value = await desktopInvoke<ClientPolicyNotice[]>("client_policy_notices");
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
    :aria-labelledby="state?.locked ? 'client-lock-title' : undefined"
    :aria-label="state?.locked ? undefined : t('ScreenLock.Checking')"
    :aria-describedby="
      state?.locked && !state.logoutAt && (!state.canUnlock || hasPassword !== false)
        ? 'client-lock-description'
        : undefined
    "
    @cancel.prevent
    @keydown.stop
    @keyup.stop
    @click.stop
    @pointerdown.stop
  >
    <div v-if="state?.locked" class="screen-lock-surface">
      <div class="screen-lock-brand">
        <BrandLogo class="screen-lock-brand-mark" />
        <span>JumpServer</span>
      </div>
      <div class="screen-lock-security-indicator">{{ t("ScreenLock.SecureLabel") }}</div>
      <div class="screen-lock-content">
        <UCard :ui="{ root: 'screen-lock-form-card ring-0', body: 'p-7 sm:p-7' }">
          <div class="screen-lock-stack">
            <header class="screen-lock-header">
              <div class="screen-lock-heading" tabindex="-1">
                <UIcon name="i-lucide-lock-keyhole" class="screen-lock-status-icon" />
                <h1 id="client-lock-title" class="text-lg font-semibold">
                  {{ t(state?.logoutAt ? "ScreenLock.SignedOut" : "ScreenLock.Title") }}
                </h1>
              </div>
              <p
                v-if="!state?.logoutAt && (!state?.canUnlock || hasPassword !== false)"
                id="client-lock-description"
                class="screen-lock-description"
              >
                {{ t(state?.canUnlock ? "ScreenLock.Description" : "ClientLock.MainOnly") }}
              </p>
            </header>
            <dl v-if="state?.origin" class="screen-lock-user">
              <dt class="screen-lock-label">{{ t("Common.LoginSite") }}</dt>
              <dd class="screen-lock-user-value">{{ state.origin }}</dd>
            </dl>
            <dl v-if="state?.sessionId" class="screen-lock-user">
              <dt class="screen-lock-label">{{ t("Common.User") }}</dt>
              <dd class="screen-lock-user-value">{{ userName }}</dd>
            </dl>
            <p v-if="state?.logoutAt" class="screen-lock-description screen-lock-logout-reason" role="status">
              {{ t("ScreenLock.TooManyFailures") }}
            </p>
            <ScreenLockCountdown
              v-if="state?.logoutAt"
              :at="state.logoutAt"
              :can-return="state.canUnlock"
              :loading="pendingAction === 'logout'"
              @return-to-login="logout"
            />
            <UAlert
              v-if="error && !state?.logoutAt && hasPassword !== true"
              color="error"
              variant="soft"
              :description="error"
            >
              <template v-if="hasPassword === null && state?.canUnlock" #actions>
                <UButton color="neutral" variant="outline" :disabled="busy" @click="loadInfo">
                  {{ t("ClientLock.Refresh") }}
                </UButton>
              </template>
            </UAlert>
            <template v-if="state?.locked && state.canUnlock && !state.logoutAt">
              <div v-if="hasPassword === false" class="space-y-1" role="status">
                <p class="screen-lock-unset-message">{{ t("ClientLock.UnsetTitle") }}</p>
                <I18nT keypath="ClientLock.Unset" tag="p" scope="global" class="screen-lock-description">
                  <template #setPassword>{{ t("ClientLock.SetPassword") }}</template>
                  <template #copyLink>
                    {{ " " }}
                    <UButton
                      color="primary"
                      variant="link"
                      class="p-0 align-baseline underline decoration-current underline-offset-2"
                      :disabled="busy || !settingsUrl"
                      @click="copySettingsUrl"
                    >
                      {{ t(linkCopied ? "Auth.CopySuccess" : "RightPanel.CopyLink") }}
                    </UButton>
                    {{ " " }}
                  </template>
                  <template #refresh>
                    {{ " " }}
                    <UButton
                      color="primary"
                      variant="link"
                      class="p-0 align-baseline underline decoration-current underline-offset-2"
                      :disabled="busy"
                      @click="loadInfo"
                    >
                      {{ t("ClientLock.Refresh") }}
                    </UButton>
                    {{ " " }}
                  </template>
                </I18nT>
              </div>
              <form v-if="hasPassword === true" class="screen-lock-form" @submit.prevent="unlock">
                <UFormField :label="t('ClientLock.Password')" :error="error" :ui="{ label: 'screen-lock-label' }">
                  <UInput
                    v-model="password"
                    type="password"
                    size="md"
                    :ui="{ base: 'screen-lock-input' }"
                    autocomplete="current-password"
                    :maxlength="128"
                    class="w-full"
                    autofocus
                    :disabled="busy"
                  />
                </UFormField>
                <UButton
                  type="submit"
                  block
                  size="md"
                  class="screen-lock-unlock-button"
                  :loading="pendingAction === 'unlock'"
                  :disabled="!password || busy"
                >
                  {{ t("ClientLock.Unlock") }}
                </UButton>
              </form>
              <UButton
                v-if="hasPassword === false"
                block
                size="md"
                class="screen-lock-unlock-button client-lock-setup-button"
                :disabled="busy"
                @click="openSettings"
              >
                {{ t("ClientLock.SetPassword") }}
              </UButton>
              <div class="screen-lock-actions">
                <UButton
                  color="neutral"
                  variant="link"
                  class="screen-lock-logout-button cursor-pointer text-muted hover:text-highlighted"
                  :disabled="busy"
                  @click="confirmLogout = true"
                >
                  {{ t("ClientLock.Logout") }}
                </UButton>
              </div>
              <template v-if="confirmLogout">
                <UAlert color="warning" variant="soft" :description="t('Login.LogoutSessionsDescription')" />
                <div class="flex justify-end gap-3">
                  <UButton color="neutral" variant="ghost" :disabled="busy" @click="confirmLogout = false">
                    {{ t("Common.Cancel") }}
                  </UButton>
                  <UButton color="warning" :loading="pendingAction === 'logout'" @click="logout">
                    {{ t("Common.Confirm") }}
                  </UButton>
                </div>
              </template>
            </template>
            <UButton v-else-if="state?.locked && !state.logoutAt" block @click="desktopInvoke('client_lock_show_main')">
              {{ t("ClientLock.GoToMain") }}
            </UButton>
            <UButton v-else-if="error" color="neutral" @click="refreshState">{{ t("ClientLock.Refresh") }}</UButton>
            <UIcon v-else-if="!state?.logoutAt" name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
          </div>
        </UCard>
      </div>
    </div>
    <div v-else class="grid min-h-screen place-items-center" role="status">
      <div class="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-sm text-muted">
        <template v-if="error">
          <p>{{ error }}</p>
          <UButton color="neutral" variant="outline" @click="refreshState">{{ t("ClientLock.Refresh") }}</UButton>
        </template>
        <template v-else>
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
          <p>{{ t("ScreenLock.Checking") }}</p>
        </template>
      </div>
    </div>
    <ClientPolicyNotices v-if="state?.locked" :notices="visibleNotices" @dismiss="dismissed.add($event)" />
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
.screen-lock-form-card .client-lock-setup-button {
  height: 36px;
  min-height: 36px;
}
.screen-lock-form-card .client-lock-setup-button:not(:disabled):hover {
  background: color-mix(in srgb, var(--screen-lock-accent) 88%, var(--screen-lock-text));
}
</style>

<style src="~/assets/css/screen-lock.css" />
