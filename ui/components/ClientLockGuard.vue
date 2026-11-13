<script setup lang="ts">
import type { ClientLockState as LockState } from "~/composables/useClientLockState";
import type { SiteUserData } from "~/store/modules/userInfo";
import type { ClientPolicyNotice } from "~/types";
import { TooltipProvider } from "reka-ui";
import { Translation as I18nT } from "vue-i18n";
import { deferAuthFailureUntil } from "~/composables/useApiRequest";
import { useClientLockState } from "~/composables/useClientLockState";
import { closeCurrentSiteWorkspace } from "~/composables/useSiteAccountSwitch";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isElectronRuntime } from "~/utils/runtime";

const { t } = useI18n();
const desktop = isElectronRuntime();
const ready = useState("auth-bootstrap-ready", () => false);
const lockLogoutPending = useState("client-lock-logout-pending", () => false);
const lockLogoutRecovery = useState<string | null>("client-lock-logout-recovery", () => null);
const handingOff = computed(() => lockLogoutPending.value || lockLogoutRecovery.value !== null);
const state = useClientLockState();
const userInfo = useUserInfoStore();
const accountSites = computed(() => {
  const sites = new Map<string, { address: string; name: string; accounts: typeof userInfo.userMap }>();
  for (const [accountId, account] of Object.entries(userInfo.userMap)) {
    const address = account.site.replace(/\/+$/, "");
    let site = sites.get(address);
    if (!site) {
      site = { address, name: account.siteName === account.site ? "" : account.siteName || "", accounts: {} };
      sites.set(address, site);
    }
    site.accounts[accountId] = account;
  }
  return [...sites.values()];
});
const canSwitchAccount = computed(
  () =>
    !state.value?.expired &&
    Object.entries(userInfo.userMap).some(([id, account]) => id !== state.value?.sessionId && !account.sessionExpired)
);
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
const pendingAction = ref<"unlock" | "logout" | "switch" | null>(null);
const busy = computed(() => pendingAction.value !== null || lockLogoutPending.value);
const confirmLogout = ref(false);
const accountPickerOpen = ref(false);
const accountSwitchError = ref("");
const expiredAccount = shallowRef<Pick<SiteUserData, "name" | "username" | "site"> | null>(null);
const removeExpiredOpen = computed({
  get: () => Boolean(expiredAccount.value),
  set: (open) => {
    if (!open) expiredAccount.value = null;
  }
});
const logoutError = ref("");
const error = ref("");
const blocked = computed(
  () =>
    desktop &&
    (handingOff.value ||
      !state.value ||
      state.value.locked ||
      state.value.expired ||
      (!state.value.sessionId && state.value.canUnlock && !ready.value))
);
let unlisten: (() => void) | undefined;
let unlistenNotices: (() => void) | undefined;
const notices = shallowRef<ClientPolicyNotice[]>([]);
const dismissed = reactive(new Set<string>());
const visibleNotices = computed(() => notices.value.filter((notice) => !dismissed.has(notice.id)));
let requestSequence = 0;

async function loadInfo() {
  const snapshot = state.value;
  if (!snapshot?.locked || snapshot.expired || !snapshot.canUnlock) return;
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
    state.value?.expired !== next.expired ||
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
    accountPickerOpen.value = false;
    expiredAccount.value = null;
    if (next.locked && !next.expired && next.canUnlock) void loadInfo();
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

function requestLogout() {
  logoutError.value = "";
  confirmLogout.value = true;
}

function openAccountPicker() {
  if (!canSwitchAccount.value) return;
  accountSwitchError.value = "";
  accountPickerOpen.value = true;
}

async function switchLockedAccount(accountId: string) {
  if (busy.value || state.value?.expired || accountId === state.value?.sessionId) return;
  const sourceAccountId = state.value?.sessionId;
  pendingAction.value = "switch";
  accountSwitchError.value = "";
  try {
    const switched = await userInfo.setCurrentAccount(accountId, {
      lockedSwitch: true,
      beforeSwitch: closeCurrentSiteWorkspace
    });
    if (!switched) {
      const account = userInfo.userMap[accountId];
      if (account?.sessionExpired) {
        const { name, username, site } = account;
        // Preflight already confirmed this saved login is invalid; dismissal only acknowledges removal.
        await userInfo.deleteUserData(accountId, { alreadyLoggedOut: true });
        if (state.value?.sessionId !== sourceAccountId) return;
        accountPickerOpen.value = false;
        expiredAccount.value = { name, username, site };
        return;
      }
      accountSwitchError.value = t(
        userInfo.userMap[accountId]?.sessionExpired ? "Login.SessionExpired" : "Login.SwitchFailed"
      );
      return;
    }
    accountPickerOpen.value = false;
    await refreshState();
  } catch {
    accountSwitchError.value = t("Login.SwitchFailed");
  } finally {
    pendingAction.value = null;
  }
}

function restoreLogoutFocus() {
  if (shield.value?.open && (state.value?.locked || state.value?.expired) && !state.value.logoutAt)
    shield.value.querySelector<HTMLButtonElement>(".screen-lock-logout-button")?.focus({ preventScroll: true });
}

async function logout() {
  if (busy.value) return;
  pendingAction.value = "logout";
  logoutError.value = "";
  try {
    await desktopInvoke("client_lock_logout");
    await refreshState();
  } catch {
    if (confirmLogout.value) logoutError.value = t("UserProfile.LogoutAccountFailed");
    else error.value = t("ClientLock.LoadFailed");
  } finally {
    pendingAction.value = null;
  }
}

async function retryLockLogout() {
  const previousSite = lockLogoutRecovery.value;
  if (busy.value || previousSite === null) return;
  lockLogoutPending.value = true;
  try {
    await userInfo.selectNextAccount(previousSite, { removeExpiredAccounts: true });
    await refreshState();
    if (userInfo.loggedIn || Object.keys(userInfo.userMap).length === 0) lockLogoutRecovery.value = null;
  } catch {
    // An unavailable site keeps the shield and saved accounts available for another retry.
  } finally {
    lockLogoutPending.value = false;
  }
}

watch(handingOff, (active) => {
  if (!active) return;
  confirmLogout.value = false;
  accountPickerOpen.value = false;
  expiredAccount.value = null;
});

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
    :aria-labelledby="handingOff || state?.locked || state?.expired ? 'client-lock-title' : undefined"
    :aria-label="handingOff || state?.locked || state?.expired ? undefined : t('ScreenLock.Checking')"
    :aria-describedby="
      !handingOff && state?.locked && !state.expired && !state.logoutAt && (!state.canUnlock || hasPassword !== false)
        ? 'client-lock-description'
        : undefined
    "
    @cancel.prevent="!busy && ((confirmLogout = false), (accountPickerOpen = false), (removeExpiredOpen = false))"
    @keydown.stop
    @keyup.stop
    @click.stop
    @pointerdown.stop
  >
    <div v-if="handingOff" class="screen-lock-surface">
      <div class="screen-lock-brand">
        <BrandLogo class="screen-lock-brand-mark" />
        <span>JumpServer</span>
      </div>
      <div class="screen-lock-content">
        <UCard :ui="{ root: 'screen-lock-form-card ring-0', body: 'p-7 sm:p-7' }">
          <div class="screen-lock-stack">
            <div class="screen-lock-heading" tabindex="-1">
              <UIcon name="i-lucide-lock-keyhole" class="screen-lock-status-icon" />
              <h1 id="client-lock-title" class="text-lg font-semibold">{{ t("ScreenLock.Title") }}</h1>
            </div>
            <p class="screen-lock-description" role="status">
              {{ t(lockLogoutPending ? "ScreenLock.Checking" : "ClientLock.HandoffFailed") }}
            </p>
            <UIcon
              v-if="lockLogoutPending"
              name="i-lucide-loader-circle"
              class="mx-auto size-5 animate-spin text-muted"
            />
            <UButton v-else block @click="retryLockLogout">{{ t("UserProfile.Retry") }}</UButton>
          </div>
        </UCard>
      </div>
    </div>
    <div v-else-if="state?.locked || state?.expired" class="screen-lock-surface">
      <div class="screen-lock-brand">
        <BrandLogo class="screen-lock-brand-mark" />
        <span>JumpServer</span>
      </div>
      <div v-if="!state.expired" class="screen-lock-security-indicator">{{ t("ScreenLock.SecureLabel") }}</div>
      <div class="screen-lock-content">
        <UCard :ui="{ root: 'screen-lock-form-card ring-0', body: 'p-7 sm:p-7' }">
          <div class="screen-lock-stack">
            <header class="screen-lock-header">
              <div class="screen-lock-heading" tabindex="-1">
                <UIcon name="i-lucide-lock-keyhole" class="screen-lock-status-icon" />
                <h1 id="client-lock-title" class="text-lg font-semibold">
                  {{
                    t(
                      state.expired
                        ? "Login.SessionExpired"
                        : state.logoutAt
                          ? "ScreenLock.SignedOut"
                          : "ScreenLock.Title"
                    )
                  }}
                </h1>
              </div>
              <p
                v-if="!state.expired && !state?.logoutAt && (!state?.canUnlock || hasPassword !== false)"
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
              v-if="error && !state.expired && !state?.logoutAt && hasPassword !== true"
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
            <template v-if="state?.locked && !state.expired && state.canUnlock && !state.logoutAt">
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
                  v-if="canSwitchAccount"
                  color="neutral"
                  variant="link"
                  class="screen-lock-logout-button cursor-pointer text-muted hover:text-highlighted"
                  :disabled="busy"
                  @click="openAccountPicker"
                >
                  {{ t("ClientLock.SwitchAccount") }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="link"
                  class="screen-lock-logout-button cursor-pointer text-muted hover:text-highlighted"
                  :disabled="busy"
                  @click="requestLogout"
                >
                  {{ t("ClientLock.Logout") }}
                </UButton>
              </div>
            </template>
            <div v-else-if="state.expired && state.canUnlock" class="screen-lock-actions">
              <UButton
                color="neutral"
                variant="link"
                class="screen-lock-logout-button cursor-pointer text-muted hover:text-highlighted"
                :disabled="busy"
                @click="requestLogout"
              >
                {{ t("ClientLock.Logout") }}
              </UButton>
            </div>
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
    <ClientPolicyNotices
      v-if="state?.locked && !handingOff"
      :notices="visibleNotices"
      @dismiss="dismissed.add($event)"
    />
    <ModalMessageDialog
      v-if="blocked && !handingOff"
      :key="`accounts:${state?.sessionId}`"
      v-model:open="accountPickerOpen"
      :portal="false"
      :title="t('ClientLock.SwitchAccount')"
      :busy="busy"
    >
      <template #body>
        <!-- The lock shield is outside ManagedApp's UApp and its tooltip provider. -->
        <TooltipProvider>
          <div class="space-y-4">
            <UAlert v-if="accountSwitchError" color="error" variant="soft" :description="accountSwitchError" />
            <div
              v-for="site in accountSites"
              :key="site.address"
              class="overflow-hidden rounded-[var(--app-radius)] border border-default"
            >
              <div class="flex items-start gap-3 border-b border-default px-3 py-2 text-sm">
                <UIcon name="i-lucide-globe" class="mt-0.5 size-4 shrink-0 text-highlighted" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="break-all font-medium text-highlighted">{{ site.address }}</p>
                  <p v-if="site.name" class="break-words text-muted">{{ site.name }}</p>
                </div>
              </div>
              <div class="divide-y divide-default pl-8">
                <UButton
                  v-for="(account, accountId) in site.accounts"
                  :key="accountId"
                  color="neutral"
                  variant="ghost"
                  block
                  class="my-1 justify-start px-2 text-left"
                  :class="{ 'disabled:opacity-100 aria-disabled:opacity-100': accountId === state?.sessionId }"
                  :disabled="busy || accountId === state?.sessionId"
                  @click="switchLockedAccount(String(accountId))"
                >
                  <UIcon name="i-lucide-circle-user-round" class="size-4 shrink-0" />
                  <span class="min-w-0 flex-1 break-words">
                    {{
                      account.name && account.username
                        ? `${account.name} (${account.username})`
                        : account.name || account.username
                    }}
                  </span>
                  <span
                    class="ml-auto flex shrink-0 cursor-default items-center gap-1.5"
                    @pointerdown.prevent
                    @click.stop
                  >
                    <UTooltip
                      v-if="account.sessionExpired"
                      :text="t('Login.SessionExpired')"
                      :content="{ side: 'top', align: 'center' }"
                      :portal="false"
                    >
                      <UIcon
                        name="i-lucide-circle-x"
                        class="size-3.5 shrink-0 text-error"
                        :aria-label="t('Login.SessionExpired')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-else-if="accountId === state?.sessionId"
                      :text="t('UserProfile.CurrentActiveUser')"
                      :content="{ side: 'top', align: 'center' }"
                      :portal="false"
                    >
                      <UIcon
                        name="i-lucide-circle-check"
                        class="size-3.5 shrink-0 text-(--theme-accent)"
                        :aria-label="t('UserProfile.CurrentActiveUser')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="!account.sessionExpired && state?.accountLocks?.[accountId]"
                      :text="t('UserProfile.Locked')"
                      :content="{ side: 'top', align: 'center' }"
                      :portal="false"
                    >
                      <UIcon
                        name="i-lucide-lock"
                        class="size-3.5 shrink-0 text-warning"
                        :aria-label="t('UserProfile.Locked')"
                      />
                    </UTooltip>
                  </span>
                </UButton>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" :disabled="busy" @click="accountPickerOpen = false">
          {{ t("Common.Cancel") }}
        </UButton>
      </template>
    </ModalMessageDialog>
    <ModalMessageDialog
      v-if="blocked && !handingOff && removeExpiredOpen"
      v-model:open="removeExpiredOpen"
      :portal="false"
      :title="t('ClientLock.ExpiredAccountRemoved')"
      :busy="busy"
    >
      <template #body>
        <div v-if="expiredAccount" class="space-y-1 text-sm">
          <p class="break-words text-highlighted">
            {{
              expiredAccount.name && expiredAccount.username
                ? `${expiredAccount.name} (${expiredAccount.username})`
                : expiredAccount.name || expiredAccount.username
            }}
          </p>
          <p class="break-all text-muted">{{ expiredAccount.site }}</p>
        </div>
      </template>
      <template #footer>
        <UButton :disabled="busy" @click="removeExpiredOpen = false">
          {{ t("Common.Confirm") }}
        </UButton>
      </template>
    </ModalMessageDialog>
    <!-- Unmount before the native dialog closes; hiding it would interrupt modal cleanup. -->
    <ModalMessageDialog
      v-if="blocked && !handingOff"
      :key="state?.sessionId"
      v-model:open="confirmLogout"
      :portal="false"
      :title="t('ClientLock.LogoutConfirm')"
      :busy="busy"
      @after:leave="restoreLogoutFocus"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="space-y-1">
            <p class="break-words text-highlighted">{{ userName }}</p>
            <p class="break-all text-muted">{{ state?.origin }}</p>
          </div>
          <p class="text-muted">{{ t("Login.LogoutSessionsDescription") }}</p>
          <UAlert v-if="logoutError" color="error" variant="soft" :description="logoutError" />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" :disabled="busy" @click="confirmLogout = false">
          {{ t("Common.Cancel") }}
        </UButton>
        <UButton color="error" :loading="pendingAction === 'logout'" :disabled="busy" @click="logout">
          {{ t("ClientLock.Logout") }}
        </UButton>
      </template>
    </ModalMessageDialog>
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
