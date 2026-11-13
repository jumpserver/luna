<script setup lang="ts">
import { Translation as I18nT } from "vue-i18n";
import { useAccountSwitchPrompt } from "~/composables/useAccountSwitchPrompt";
import { useClientLockState } from "~/composables/useClientLockState";
import { desktopClipboard, desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { pending, finish } = useAccountSwitchPrompt();
const userInfo = useUserInfoStore();
const { currentAccountId, loggedIn } = storeToRefs(userInfo);
const mainLock = useClientLockState();
const open = computed({ get: () => Boolean(pending.value), set: (value) => !value && finish(false) });
const password = ref("");
const busy = ref(false);
const error = ref("");
const hasPassword = ref<boolean | null>(null);
const settingsUrl = ref("");
const copied = ref(false);
const expired = ref(false);
const isLogin = computed(() => pending.value?.kind === "login" || expired.value);
const accountLabel = computed(() => {
  const account = pending.value?.account;
  return account?.name && account.username
    ? `${account.name} (${account.username})`
    : account?.name || account?.username || "";
});
const { start: resetCopied, stop: stopCopied } = useTimeoutFn(() => (copied.value = false), 3000, {
  immediate: false
});
const args = () => ({ sessionId: pending.value!.account.accountId, connectionId: pending.value!.connectionId });

async function loadInfo() {
  const request = pending.value;
  if (!request || request.kind !== "unlock") return;
  busy.value = true;
  error.value = "";
  hasPassword.value = null;
  try {
    const info = await desktopInvoke<{ hasPassword: boolean; settingsUrl: string; attemptsRemaining?: number }>(
      "client_account_lock_info",
      args()
    );
    if (pending.value !== request) return;
    hasPassword.value = info.hasPassword;
    settingsUrl.value = info.settingsUrl;
  } catch {
    if (pending.value === request) error.value = t("ClientLock.LoadFailed");
  } finally {
    if (pending.value === request) busy.value = false;
  }
}

async function unlock() {
  const request = pending.value;
  if (!request || busy.value || !password.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await desktopInvoke<{ locked: boolean; logoutAt?: number; attemptsRemaining?: number }>(
      "client_account_unlock",
      { ...args(), password: password.value }
    );
    if (pending.value !== request) return;
    if (result.logoutAt) {
      expired.value = true;
    } else if (!result.locked) {
      finish(true, request);
    } else {
      error.value = Number.isInteger(result.attemptsRemaining)
        ? t("ScreenLock.AttemptsRemaining", { count: result.attemptsRemaining! })
        : t("ClientLock.UnlockFailed");
    }
  } catch (cause) {
    if (pending.value === request)
      error.value = t(String(cause).includes("429") ? "ClientLock.TooManyAttempts" : "ClientLock.UnlockFailed");
  } finally {
    if (pending.value === request) {
      password.value = "";
      busy.value = false;
    }
  }
}

async function openSettings() {
  const request = pending.value;
  if (!request) return;
  try {
    await desktopInvoke("client_account_lock_settings", args());
  } catch {
    if (pending.value === request) error.value = t("ClientLock.LoadFailed");
  }
}

async function copyLink() {
  if (!settingsUrl.value) return;
  const request = pending.value;
  try {
    await desktopClipboard.writeText(settingsUrl.value);
    if (pending.value !== request) return;
    copied.value = true;
    resetCopied();
  } catch {
    if (pending.value === request) error.value = t("Common.CopyFailed");
  }
}

function confirmLogin() {
  const request = pending.value;
  if (!request) return;
  // An exhausted lock password ends this attempt; login opens the existing prefilled form.
  if (request.kind === "unlock") {
    const accountId = request.account.accountId;
    finish(false, request);
    const { site, siteName } = request.account;
    useEventBus().emit("login", {
      accountId,
      ...(!userInfo.userMap[accountId] ? { prefill: { site, siteName } } : {})
    });
  } else finish(true, request);
}

watch(pending, (request) => {
  password.value = "";
  error.value = "";
  busy.value = false;
  hasPassword.value = null;
  settingsUrl.value = "";
  copied.value = false;
  expired.value = false;
  stopCopied();
  if (request?.kind === "unlock") void loadInfo();
});
watch([currentAccountId, loggedIn], () => finish(false));
watch(
  () => mainLock.value?.locked,
  (locked) => {
    if (locked) finish(false);
  }
);
onBeforeUnmount(() => finish(false));
</script>

<template>
  <ModalMessageDialog
    v-model:open="open"
    :title="t(isLogin ? 'Login.ReauthenticateConfirm' : 'ClientLock.UnlockAccount')"
    :busy="busy"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <dl class="space-y-1">
          <dt class="text-[13px] leading-5 text-muted">{{ t("Common.LoginSite") }}</dt>
          <dd class="m-0 text-[14px] break-all font-medium text-highlighted">{{ pending?.account.site }}</dd>
        </dl>
        <dl class="space-y-1">
          <dt class="text-[13px] leading-5 text-muted">{{ t("Common.User") }}</dt>
          <dd class="m-0 text-[14px] break-words font-medium text-highlighted">{{ accountLabel }}</dd>
        </dl>
        <template v-if="!isLogin">
          <div v-if="busy && hasPassword === null" role="status" class="flex justify-center py-3">
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
          </div>
          <form v-if="hasPassword" id="switch-account-unlock" @submit.prevent="unlock">
            <UFormField
              :label="t('ClientLock.Password')"
              :error="error || undefined"
              :ui="{ label: 'text-[13px] leading-5 font-normal text-muted' }"
            >
              <UInput
                v-model="password"
                type="password"
                autocomplete="current-password"
                autofocus
                :maxlength="128"
                :disabled="busy"
                class="w-full"
              />
            </UFormField>
          </form>
          <div v-else-if="hasPassword === false" class="space-y-2">
            <p class="text-highlighted">{{ t("ClientLock.UnsetTitle") }}</p>
            <I18nT keypath="ClientLock.SwitchUnset" tag="p" scope="global" class="text-muted">
              <template #setPassword>{{ t("ClientLock.SetPassword") }}</template>
              <template #copyLink>
                {{ " " }}
                <UButton
                  variant="link"
                  class="p-0 underline decoration-current"
                  :disabled="!settingsUrl"
                  @click="copyLink"
                >
                  {{ t(copied ? "Auth.CopySuccess" : "RightPanel.CopyLink") }}
                </UButton>
                {{ " " }}
              </template>
              <template #refresh>
                {{ " " }}
                <UButton variant="link" class="p-0 underline decoration-current" :disabled="busy" @click="loadInfo">
                  {{ t("ClientLock.Refresh") }}
                </UButton>
                {{ " " }}
              </template>
            </I18nT>
          </div>
          <UAlert v-if="error && !hasPassword" color="error" variant="soft" :description="error" />
        </template>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :disabled="busy" @click="finish(false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton v-if="isLogin" @click="confirmLogin">{{ t("Common.Confirm") }}</UButton>
      <UButton
        v-else-if="hasPassword"
        type="submit"
        form="switch-account-unlock"
        :loading="busy"
        :disabled="busy || !password"
      >
        {{ t("ClientLock.Unlock") }}
      </UButton>
      <UButton v-else-if="hasPassword === false" :disabled="busy" @click="openSettings">
        {{ t("ClientLock.SetPassword") }}
      </UButton>
      <UButton v-else-if="error" :disabled="busy" @click="loadInfo">{{ t("ClientLock.Refresh") }}</UButton>
    </template>
  </ModalMessageDialog>
</template>
