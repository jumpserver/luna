<script setup lang="ts">
import { redirectToWebLogin } from "~/utils/runtime";
import { describeWebSessionError } from "~/utils/webSessionLock";

const desktop = isDesktopRuntime();
const { t } = useI18n();
const { state, start, unlock: verify, refresh, logout } = useWebSessionLock();
const dialog = ref<HTMLDialogElement | null>(null);
const password = ref("");
const error = ref("");
const pendingAction = ref<"unlock" | "logout" | "retry" | null>(null);
const busy = computed(() => pendingAction.value !== null);
const blocked = computed(() => !desktop && (!state.value.ready || state.value.locked));
const unconfirmed = computed(() => !state.value.session?.locked);
const logoutAsText = computed(() => Boolean(state.value.error || state.value.session?.has_password));
const displayedError = computed(() => {
  if (state.value.error) {
    const info = state.value.errorInfo;
    return info ? t(info.key, info.params) : formatError(null);
  }
  return (
    error.value ||
    (state.value.session?.has_password &&
    state.value.attemptsRemaining !== null &&
    state.value.attemptsRemaining > 0 &&
    state.value.attemptsRemaining < 5
      ? t("ScreenLock.AttemptsRemaining", { count: state.value.attemptsRemaining })
      : "")
  );
});
const rendered = ref(desktop);

function formatError(cause: unknown) {
  const info = describeWebSessionError(cause);
  return t(info.key, info.params);
}

watch(
  [() => state.value.ready, blocked, dialog],
  async () => {
    if (desktop) return;
    await nextTick();
    if (state.value.ready && !state.value.locked) rendered.value = true;
    if (state.value.ready && state.value.locked && dialog.value) {
      if (!dialog.value.open) {
        error.value = "";
        dialog.value.showModal();
        (
          dialog.value.querySelector<HTMLInputElement>("input") ||
          dialog.value.querySelector<HTMLElement>(".screen-lock-heading")
        )?.focus({ preventScroll: true });
      }
    } else if (dialog.value?.open) {
      password.value = "";
      dialog.value.close();
    }
  },
  { flush: "post" }
);

async function unlock() {
  if (!password.value || busy.value) return;
  pendingAction.value = "unlock";
  error.value = "";
  try {
    await verify(password.value);
  } catch (cause) {
    const status = (cause as { status?: number })?.status;
    const data = (cause as { data?: { attempts_remaining?: number } })?.data;
    if (status === 400 && Number.isInteger(data?.attempts_remaining)) {
      error.value = "";
      return;
    }
    error.value = status === 400 ? t("ScreenLock.UnlockFailed") : formatError(cause);
  } finally {
    password.value = "";
    pendingAction.value = null;
    await nextTick();
    if (dialog.value?.open) dialog.value.querySelector<HTMLInputElement>("input")?.focus();
  }
}
async function exit() {
  pendingAction.value = "logout";
  try {
    await logout();
  } catch (cause) {
    error.value = formatError(cause);
  } finally {
    pendingAction.value = null;
  }
}
async function retry() {
  if (busy.value) return;
  pendingAction.value = "retry";
  error.value = "";
  try {
    await refresh();
  } catch (cause) {
    error.value = formatError(cause);
  } finally {
    pendingAction.value = null;
  }
}
onMounted(() => {
  if (!desktop) void start().catch(() => {});
});
</script>

<template>
  <div :inert="blocked || undefined" class="contents"><slot v-if="rendered" /></div>
  <Teleport v-if="!desktop" :to="state.locked && dialog ? dialog : 'body'">
    <WebSessionCountdownNotices :idle-remaining="state.idleRemaining" :expiry-remaining="state.expiryRemaining" />
  </Teleport>
  <div
    v-if="!desktop && !state.ready"
    class="fixed inset-0 z-[700] grid place-items-center bg-[var(--app-surface-canvas)]"
    role="status"
  >
    <p class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      {{ t("ScreenLock.Checking") }}
    </p>
  </div>
  <dialog
    v-if="!desktop"
    ref="dialog"
    class="web-session-lock-shield"
    :aria-label="t('ScreenLock.Title')"
    @cancel.prevent
  >
    <div class="screen-lock-surface">
      <div class="screen-lock-brand">
        <BrandLogo class="screen-lock-brand-mark" />
        <span>JumpServer</span>
      </div>
      <div v-if="!unconfirmed && !state.error" class="screen-lock-security-indicator">
        {{ t("ScreenLock.SecureLabel") }}
      </div>
      <div class="screen-lock-content">
        <UCard :ui="{ root: 'screen-lock-form-card ring-0', body: 'p-7 sm:p-7' }">
          <div class="screen-lock-stack">
            <header class="screen-lock-header">
              <div class="screen-lock-heading" tabindex="-1">
                <UIcon name="i-lucide-lock-keyhole" class="screen-lock-status-icon" />
                <h1 class="text-xl font-semibold">
                  {{
                    t(
                      state.logoutAt
                        ? "ScreenLock.SignedOut"
                        : state.error
                          ? "ScreenLock.CheckFailed"
                          : unconfirmed
                            ? "ScreenLock.Checking"
                            : "ScreenLock.Title"
                    )
                  }}
                </h1>
              </div>
              <p
                v-if="!state.logoutAt && !unconfirmed && !state.error && state.session?.has_password !== false"
                class="screen-lock-description"
              >
                {{ t("ScreenLock.Description") }}
              </p>
            </header>
            <dl v-if="state.session" class="screen-lock-user">
              <dt class="screen-lock-label">{{ t("Common.User") }}</dt>
              <dd class="screen-lock-user-value">{{ state.session.user.name || state.session.user.username }}</dd>
            </dl>
            <p v-if="state.logoutAt" class="screen-lock-description screen-lock-logout-reason" role="status">
              {{ t("ScreenLock.TooManyFailures") }}
            </p>
            <p
              v-if="!state.logoutAt && (state.error || (displayedError && !state.session?.has_password))"
              class="text-sm text-error"
              role="alert"
            >
              {{ displayedError || t("ScreenLock.LoadFailed") }}
            </p>
            <ScreenLockCountdown v-if="state.logoutAt" :at="state.logoutAt" @return-to-login="redirectToWebLogin" />
            <form
              v-else-if="!state.error && !unconfirmed && state.session?.has_password"
              class="screen-lock-form"
              @submit.prevent="unlock"
            >
              <UFormField
                :label="t('ScreenLock.Password')"
                :error="state.error ? undefined : displayedError"
                :ui="{ label: 'screen-lock-label' }"
              >
                <UInput
                  v-model="password"
                  type="password"
                  size="md"
                  :ui="{ base: 'screen-lock-input' }"
                  autocomplete="current-password"
                  :maxlength="128"
                  :disabled="busy"
                  autofocus
                  class="w-full"
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
                {{ t("ScreenLock.Unlock") }}
              </UButton>
            </form>
            <p
              v-else-if="!state.error && !unconfirmed && state.session"
              class="screen-lock-unset-message"
              role="status"
            >
              {{ t("ScreenLock.Unset") }}
            </p>
            <p v-else-if="!state.error" class="text-sm text-muted">{{ t("ScreenLock.Checking") }}</p>
            <div v-if="!state.logoutAt" class="screen-lock-actions">
              <UButton
                v-if="state.error"
                block
                class="screen-lock-unlock-button"
                :loading="pendingAction === 'retry'"
                :disabled="busy"
                @click="retry"
              >
                {{ t("ScreenLock.Retry") }}
              </UButton>
              <UButton
                :color="logoutAsText ? 'neutral' : 'primary'"
                :variant="logoutAsText ? 'link' : 'solid'"
                :block="!logoutAsText"
                :class="
                  logoutAsText
                    ? 'screen-lock-logout-button cursor-pointer text-muted hover:text-primary'
                    : 'screen-lock-unlock-button'
                "
                :loading="pendingAction === 'logout'"
                :disabled="busy"
                @click="exit"
              >
                {{ t("ScreenLock.Logout") }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.web-session-lock-shield {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100svh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--app-fg);
  background: var(--app-surface-canvas);
}
.web-session-lock-shield::backdrop {
  background: var(--app-surface-canvas);
}
.web-session-lock-shield .screen-lock-surface {
  background: var(--app-surface-canvas);
}
.web-session-lock-shield :deep(.screen-lock-form-card) {
  background: var(--app-surface-card);
  border-color: var(--app-border-card);
}
.screen-lock-actions {
  flex-direction: column;
}
</style>

<style src="~/assets/css/screen-lock.css" />
