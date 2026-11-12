<script setup lang="ts">
import { apiRequest } from "~/composables/useApiRequest";
import { desktopOpener } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const emit = defineEmits<{ ready: [] }>();
const { t } = useI18n();
const toast = useToast();
const { loggedIn, currentAccountId, currentUser } = storeToRefs(useUserInfoStore());
const openingCredentials = ref(false);
let active = true;
const isCurrentAccount = (accountId: string) => active && loggedIn.value && accountId === currentAccountId.value;
onBeforeUnmount(() => {
  active = false;
});

interface PersonalSecurity {
  client_idle_lock_limit: number;
  client_max_session_limit: number;
  client_reauth_on_exit_required: boolean;
  effective_client_idle_lock_time: number;
  effective_client_max_session_time: number;
  effective_client_reauth_on_exit: boolean;
}
type TimeField = "client_idle_lock_time" | "client_max_session_time";
type SecurityField = TimeField | "client_reauth_on_exit";
type SecurityAction = SecurityField | "reset";
const timeFields = ["client_max_session_time", "client_idle_lock_time"] as const;
const securitySettings = ref<PersonalSecurity | null>(null);
const form = reactive({
  client_reauth_on_exit: false,
  client_max_session_time: "" as number | string,
  client_idle_lock_time: "" as number | string
});
const initialValues = ref({ ...form });
const loadingSecurity = ref(false);
const savingSecurity = ref(false);
let securitySave = Promise.resolve();
const securityError = ref("");
const securityErrorField = ref<SecurityAction | null>(null);
function clearSecurityError(field?: SecurityAction) {
  if (field && field !== "reset" && securityErrorField.value !== field) return;
  securityError.value = "";
  securityErrorField.value = null;
}
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
      ? "PersonalSecurity.LimitHelp"
      : name === "client_max_session_time"
        ? "PersonalSecurity.UnlimitedHelp"
        : "IdleLock.DisabledHelp"
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
  for (const name of timeFields)
    if (!preserveEdits || form[name] === initialValues.value[name]) form[name] = next[name];
  if (
    !preserveEdits ||
    reauthRequired.value ||
    form.client_reauth_on_exit === initialValues.value.client_reauth_on_exit
  )
    form.client_reauth_on_exit = next.client_reauth_on_exit;
  initialValues.value = { ...next };
}
async function loadSecuritySettings() {
  const accountId = currentAccountId.value;
  securitySettings.value = null;
  clearSecurityError();
  loadingSecurity.value = true;
  try {
    const data = await apiRequest<PersonalSecurity>({ method: "GET", path: "/api/v1/users/profile/idle-lock/" });
    if (isCurrentAccount(accountId)) applySecuritySettings(data);
  } catch {
    if (isCurrentAccount(accountId)) securityError.value = t("ClientLock.LoadFailed");
  } finally {
    if (isCurrentAccount(accountId)) {
      loadingSecurity.value = false;
      emit("ready");
    }
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
function saveSecuritySettings(field: SecurityAction) {
  if (loadingSecurity.value || !securitySettings.value) return;
  const accountId = currentAccountId.value;
  const values = { ...form };
  const reset = field === "reset";
  // Serialize confirmed edits without disabling the next field or overwriting its draft.
  securitySave = securitySave.then(async () => {
    if (!isCurrentAccount(accountId) || !securitySettings.value) return;
    const body: Partial<Record<SecurityField, number | boolean | null>> = {};
    for (const name of timeFields) {
      if (!reset && (name !== field || values[name] === initialValues.value[name])) continue;
      const minutes = reset || values[name] === "" ? null : Number(values[name]);
      const maximum = fieldLimit(name);
      if (
        minutes !== null &&
        (!Number.isInteger(minutes) || minutes < (maximum ? 1 : 0) || minutes > (maximum || 99999))
      ) {
        securityErrorField.value = field;
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
    if (
      reset ||
      (field === "client_reauth_on_exit" && values.client_reauth_on_exit !== initialValues.value.client_reauth_on_exit)
    )
      body.client_reauth_on_exit = reset ? null : values.client_reauth_on_exit;
    if (!Object.keys(body).length) {
      clearSecurityError(field);
      return;
    }
    savingSecurity.value = true;
    clearSecurityError(field);
    try {
      const data = await apiRequest<PersonalSecurity>({
        method: "PATCH",
        path: "/api/v1/users/profile/idle-lock/",
        body
      });
      if (!isCurrentAccount(accountId)) return;
      const drafts = { ...form };
      applySecuritySettings(data, true);
      for (const name of Object.keys(body) as SecurityField[])
        Object.assign(form, { [name]: drafts[name] === values[name] ? initialValues.value[name] : drafts[name] });
      toast.add({
        title: t("IdleLock.Saved"),
        color: "success",
        icon: "i-lucide-check",
        progress: true,
        duration: 1000
      });
    } catch {
      if (isCurrentAccount(accountId)) {
        securityErrorField.value = field;
        securityError.value = t("IdleLock.SaveFailed");
      }
    } finally {
      if (isCurrentAccount(accountId)) savingSecurity.value = false;
    }
  });
  return securitySave;
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
    if (!isCurrentAccount(accountId)) return;
    const url = new URL(info.settings_path, site);
    if (url.origin !== new URL(site).origin || url.pathname !== "/ui/") throw new Error("Invalid settings URL");
    await desktopOpener.openUrl(url.toString());
  } catch {
    if (isCurrentAccount(accountId)) toast.add({ title: t("ClientLock.LoadFailed"), color: "error" });
  } finally {
    if (isCurrentAccount(accountId)) openingCredentials.value = false;
  }
}

watch(
  [loggedIn, currentAccountId],
  () => {
    securitySettings.value = null;
    Object.assign(form, { client_reauth_on_exit: false, client_max_session_time: "", client_idle_lock_time: "" });
    initialValues.value = { ...form };
    savingSecurity.value = false;
    if (loggedIn.value && isDesktopRuntime()) void loadSecuritySettings();
  },
  { immediate: true }
);
</script>

<template>
  <SettingsSection :title="t('PersonalSecurity.ClientSettings')">
    <template #actions>
      <UButton
        :label="t('IdleLock.ResetDefault')"
        color="neutral"
        variant="link"
        size="sm"
        class="p-0 text-muted hover:text-highlighted focus-visible:text-highlighted"
        :disabled="loadingSecurity || savingSecurity || !securitySettings"
        @click="saveSecuritySettings('reset')"
      />
    </template>
    <SettingsGroup>
      <SettingsRow :title="t('PersonalSecurity.Reauth')" :description="reauthHelp">
        <USwitch
          v-model="form.client_reauth_on_exit"
          :aria-label="t('PersonalSecurity.Reauth')"
          :disabled="reauthRequired || loadingSecurity || !securitySettings"
          @update:model-value="saveSecuritySettings('client_reauth_on_exit')"
        />
      </SettingsRow>
      <SettingsRow
        v-for="name in timeFields"
        :key="name"
        :title="fieldTitle(name)"
        :description="fieldHelp(name)"
        fluid
      >
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            v-if="name === 'client_idle_lock_time'"
            :label="t('ClientLock.ManagePassword')"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            :loading="openingCredentials"
            :disabled="openingCredentials"
            @click="openClientCredentials"
          />
          <UInput
            v-model.number="form[name]"
            type="number"
            :min="fieldLimit(name) ? 1 : 0"
            :max="fieldLimit(name) || 99999"
            :aria-label="fieldTitle(name)"
            :placeholder="t('IdleLock.InputPlaceholder')"
            size="sm"
            class="w-2/9 min-w-16"
            :ui="{ base: 'focus-visible:outline-none' }"
            :disabled="loadingSecurity || !securitySettings"
            @blur="saveSecuritySettings(name)"
          />
        </div>
      </SettingsRow>
      <p v-if="securityError" class="px-4 pb-3 text-sm text-error">{{ securityError }}</p>
      <div v-if="securityError" class="flex justify-end px-4 pb-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          class="enabled:hover:text-primary enabled:hover:ring-1 enabled:hover:ring-inset enabled:hover:ring-primary focus-visible:text-primary focus-visible:ring-primary"
          @click="securityErrorField ? saveSecuritySettings(securityErrorField) : loadSecuritySettings()"
        >
          {{ t("ScreenLock.Retry") }}
        </UButton>
      </div>
    </SettingsGroup>
  </SettingsSection>
</template>
