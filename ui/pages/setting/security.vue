<script setup lang="ts">
import { apiRequest, getUserProfile } from "~/composables/useApiRequest";
import { desktopOpener } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { formatClientLoginTimestamp } from "~/utils/clientLoginPolicy";

interface DetailRow {
  label: string;
  value: string;
  highlighted?: boolean;
  hint?: string;
}

const { t, locale } = useI18n();
const toast = useToast();
const { loggedIn, currentAccountId, currentUser } = storeToRefs(useUserInfoStore());
const openingCredentials = ref(false);
interface PersonalSecurity {
  client_idle_lock_limit: number;
  client_max_session_limit: number;
  client_reauth_on_exit_required: boolean;
  effective_client_idle_lock_time: number;
  effective_client_max_session_time: number;
  effective_client_reauth_on_exit: boolean;
}
type TimeField = "client_idle_lock_time" | "client_max_session_time";
const timeFields = ["client_max_session_time", "client_idle_lock_time"] as const;
const securitySettings = ref<PersonalSecurity | null>(null);
const form = reactive({
  client_reauth_on_exit: false,
  client_max_session_time: "" as number | string,
  client_idle_lock_time: "" as number | string
});
let initialValues = { ...form };
const loadingSecurity = ref(false);
const savingSecurity = ref(false);
const securityError = ref("");
const reauthRequired = computed(() => securitySettings.value?.client_reauth_on_exit_required ?? false);
const reauthHelp = computed(() =>
  t(reauthRequired.value ? "PersonalSecurity.ReauthRequired" : "PersonalSecurity.ReauthHelp")
);
const fieldTitle = (name: TimeField) =>
  t(name === "client_max_session_time" ? "PersonalSecurity.Lifetime" : "PersonalSecurity.Idle");
const fieldLimit = (name: TimeField) =>
  securitySettings.value?.[
    name === "client_max_session_time" ? "client_max_session_limit" : "client_idle_lock_limit"
  ] ?? 0;
function fieldHelp(name: TimeField) {
  const maximum = fieldLimit(name);
  const help = t(
    maximum
      ? "IdleLock.LimitHelp"
      : name === "client_max_session_time"
        ? "PersonalSecurity.UnlimitedHelp"
        : "IdleLock.DisabledHelp",
    { minutes: maximum }
  );
  const behavior = t(
    name === "client_max_session_time" ? "PersonalSecurity.LifetimeHelp" : "PersonalSecurity.IdleHelp"
  );
  return `${behavior} ${help}`;
}
function applySecuritySettings(value: PersonalSecurity, preserveEdits = false) {
  securitySettings.value = value;
  const next = {
    client_reauth_on_exit: value.effective_client_reauth_on_exit,
    client_max_session_time: value.effective_client_max_session_time,
    client_idle_lock_time: value.effective_client_idle_lock_time
  };
  for (const name of timeFields) if (!preserveEdits || form[name] === initialValues[name]) form[name] = next[name];
  if (!preserveEdits || reauthRequired.value || form.client_reauth_on_exit === initialValues.client_reauth_on_exit)
    form.client_reauth_on_exit = next.client_reauth_on_exit;
  initialValues = { ...next };
}
async function loadSecuritySettings() {
  const accountId = currentAccountId.value;
  securitySettings.value = null;
  securityError.value = "";
  loadingSecurity.value = true;
  try {
    const data = await apiRequest<PersonalSecurity>({ method: "GET", path: "/api/v1/users/profile/idle-lock/" });
    if (accountId === currentAccountId.value) applySecuritySettings(data);
  } catch {
    if (accountId === currentAccountId.value) securityError.value = t("ClientLock.LoadFailed");
  } finally {
    if (accountId === currentAccountId.value) loadingSecurity.value = false;
  }
}
watch(
  () => currentUser.value?.clientLoginPolicy,
  (policy) => {
    if (
      policy?.idle_lock_time_limit !== undefined &&
      policy.max_session_time_limit !== undefined &&
      policy.reauth_on_exit_required !== undefined
    )
      applySecuritySettings(
        {
          client_idle_lock_limit: policy.idle_lock_time_limit,
          client_max_session_limit: policy.max_session_time_limit,
          client_reauth_on_exit_required: policy.reauth_on_exit_required,
          effective_client_idle_lock_time: policy.idle_lock_time,
          effective_client_max_session_time: policy.max_session_time,
          effective_client_reauth_on_exit: policy.reauth_on_exit
        },
        true
      );
  }
);
async function saveSecuritySettings(reset = false) {
  if (savingSecurity.value || !securitySettings.value) return;
  const accountId = currentAccountId.value;
  const body: Record<string, number | boolean | null> = {};
  for (const name of timeFields) {
    if (!reset && form[name] === initialValues[name]) continue;
    const minutes = reset || form[name] === "" ? null : Number(form[name]);
    const maximum = fieldLimit(name);
    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < (maximum ? 1 : 0) || minutes > (maximum || 99999))
    ) {
      securityError.value = `${fieldTitle(name)}: ${t(
        maximum
          ? "IdleLock.LimitHelp"
          : name === "client_max_session_time"
            ? "PersonalSecurity.UnlimitedHelp"
            : "IdleLock.DisabledHelp",
        { minutes: maximum }
      )}`;
      return;
    }
    body[name] = minutes;
  }
  if (reset || form.client_reauth_on_exit !== initialValues.client_reauth_on_exit)
    body.client_reauth_on_exit = reset ? null : form.client_reauth_on_exit;
  if (!Object.keys(body).length) {
    toast.add({
      title: t("IdleLock.Saved"),
      color: "success",
      icon: "i-lucide-check",
      progress: true,
      duration: 1000
    });
    return;
  }
  savingSecurity.value = true;
  securityError.value = "";
  try {
    const data = await apiRequest<PersonalSecurity>({
      method: "PATCH",
      path: "/api/v1/users/profile/idle-lock/",
      body
    });
    if (accountId !== currentAccountId.value) return;
    applySecuritySettings(data);
    toast.add({
      title: t("IdleLock.Saved"),
      color: "success",
      icon: "i-lucide-check",
      progress: true,
      duration: 1000
    });
  } catch {
    if (accountId === currentAccountId.value) {
      await loadSecuritySettings();
      if (accountId === currentAccountId.value) securityError.value = t("IdleLock.SaveFailed");
    }
  } finally {
    if (accountId === currentAccountId.value) savingSecurity.value = false;
  }
}

async function openClientCredentials() {
  const accountId = currentAccountId.value;
  const site = currentUser.value?.site;
  if (!site || openingCredentials.value) return;
  openingCredentials.value = true;
  try {
    const info = await apiRequest<{ settings_path: string }>({
      method: "GET",
      path: "/api/v1/authentication/client-login-session/unlock/"
    });
    if (accountId !== currentAccountId.value) return;
    const url = new URL(info.settings_path, site);
    if (url.origin !== new URL(site).origin || url.pathname !== "/ui/") throw new Error("Invalid settings URL");
    await desktopOpener.openUrl(url.toString());
  } catch {
    toast.add({ title: t("ClientLock.LoadFailed"), color: "error" });
  } finally {
    openingCredentials.value = false;
  }
}

const username = ref("");
watch(
  [loggedIn, currentAccountId],
  async (_, __, onCleanup) => {
    username.value = "";
    securitySettings.value = null;
    Object.assign(form, { client_reauth_on_exit: false, client_max_session_time: "", client_idle_lock_time: "" });
    initialValues = { ...form };
    savingSecurity.value = false;
    if (!loggedIn.value || !isDesktopRuntime()) return;
    void loadSecuritySettings();
    let active = true;
    onCleanup(() => {
      active = false;
    });
    try {
      const profile = await getUserProfile();
      if (active) username.value = profile.username;
    } catch {
      // Policy and login times remain available from the current account's server snapshot.
    }
  },
  { immediate: true }
);

const clientLoginAccount = computed(() => {
  const name = currentUser.value?.name || "—";
  return username.value && username.value !== name ? `${name} (${username.value})` : name;
});

const clientLoginRows = computed<DetailRow[]>(() => {
  const policy = currentUser.value?.clientLoginPolicy;
  const session = currentUser.value?.clientLoginSession;
  const unknown = t("UserProfile.ClientLoginUnknown");
  const timestamp = (value?: string | null) => formatClientLoginTimestamp(value, locale.value) || unknown;
  const deadline = session?.effective_expires_at ?? session?.expires_at;
  const effectiveExpiry =
    session && policy ? (deadline ? timestamp(deadline) : t("UserProfile.ClientLoginUnlimited")) : unknown;
  return [
    { label: t("UserProfile.ClientLoginStartedAt"), value: timestamp(session?.authenticated_at), highlighted: true },
    {
      label: t("UserProfile.ClientLoginEffectiveExpiry"),
      hint: session?.expiry_reason === "policy_changed" ? t("UserProfile.ClientLoginPolicyExpiry") : undefined,
      value: effectiveExpiry,
      highlighted: true
    }
  ];
});
</script>

<template>
  <div v-if="isDesktopRuntime() && loggedIn" class="space-y-8">
    <SettingsSection :title="t('UserProfile.SiteAndUser')">
      <SettingsGroup>
        <div class="flex flex-wrap items-start justify-between gap-x-8 gap-y-1 px-4 py-3 text-sm">
          <span class="text-muted">{{ t("UserProfile.CurrentSite") }}</span>
          <span class="min-w-0 break-all text-right text-highlighted">
            {{ currentUser?.siteName || currentUser?.site }}
            <span v-if="currentUser?.siteName" class="text-muted">({{ currentUser?.site }})</span>
          </span>
        </div>
        <div class="flex flex-wrap items-start justify-between gap-x-8 gap-y-1 px-4 py-3 text-sm">
          <span class="text-muted">{{ t("UserProfile.ClientLoginCurrentUser") }}</span>
          <span class="min-w-0 break-words text-right text-highlighted">{{ clientLoginAccount }}</span>
        </div>
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection :title="t('UserProfile.ClientLoginInfo')" :description="t('UserProfile.ClientLoginExpiryHint')">
      <SettingsGroup>
        <div
          v-for="row in clientLoginRows"
          :key="row.label"
          class="flex flex-wrap items-start justify-between gap-x-8 gap-y-1 px-4 py-3 text-sm"
        >
          <div>
            <span :class="row.highlighted ? 'font-medium text-highlighted' : 'text-muted'">{{ row.label }}</span>
            <p v-if="row.hint" class="mt-1 text-xs text-muted">{{ row.hint }}</p>
          </div>
          <span class="min-w-0 break-words text-right text-highlighted" :class="{ 'font-medium': row.highlighted }">
            {{ row.value }}
          </span>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection :title="t('PersonalSecurity.ClientSettings')">
      <SettingsGroup>
        <SettingsRow :title="t('PersonalSecurity.Reauth')" :description="reauthHelp">
          <USwitch
            v-model="form.client_reauth_on_exit"
            :aria-label="t('PersonalSecurity.Reauth')"
            :disabled="reauthRequired || loadingSecurity || savingSecurity || !securitySettings"
          />
        </SettingsRow>
        <SettingsRow
          v-for="name in timeFields"
          :key="name"
          :title="fieldTitle(name)"
          :description="fieldHelp(name)"
          fluid
        >
          <UInput
            v-model.number="form[name]"
            type="number"
            :min="fieldLimit(name) ? 1 : 0"
            :max="fieldLimit(name) || 99999"
            :aria-label="fieldTitle(name)"
            :placeholder="t('IdleLock.InputPlaceholder')"
            size="sm"
            class="w-1/3 min-w-24"
            :disabled="loadingSecurity || savingSecurity || !securitySettings"
          />
        </SettingsRow>
        <p v-if="securityError" class="px-4 pb-3 text-sm text-error">{{ securityError }}</p>
        <div class="flex flex-wrap justify-end gap-3 px-4 py-3">
          <UButton
            size="sm"
            :loading="savingSecurity"
            :disabled="loadingSecurity || !securitySettings"
            @click="saveSecuritySettings()"
          >
            {{ t("Common.Save") }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="loadingSecurity || savingSecurity || !securitySettings"
            @click="saveSecuritySettings(true)"
          >
            {{ t("IdleLock.ResetDefault") }}
          </UButton>
          <UButton v-if="securityError" color="neutral" variant="ghost" size="sm" @click="loadSecuritySettings">
            {{ t("ScreenLock.Retry") }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-external-link"
            :loading="openingCredentials"
            @click="openClientCredentials"
          >
            {{ t("ClientLock.ManagePassword") }}
          </UButton>
        </div>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>
