<script setup lang="ts">
import type { SiteUserData } from "~/store/modules/userInfo";
import type { LabeledValue, UserData, UserProfile } from "~/types";
import { useLocalStorage } from "@vueuse/core";
import { getUserProfile } from "~/composables/useApiRequest";
import { useClientAccountHandoff } from "~/composables/useClientAccountHandoff";
import { useClientLockState, useClientSessionReady } from "~/composables/useClientLockState";
import { confirmLeaveCurrentSiteSessions, useSiteAccountSwitch } from "~/composables/useSiteAccountSwitch";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface DetailRow {
  label: string;
  value: string;
  hint?: string;
}

const { t, locale } = useI18n();
const toast = useToast();
const localePath = useLocalePath();
const { closeSettings } = useSettingsWindow();
const userInfoStore = useUserInfoStore();
const { switchAccount: switchSiteAccount, switchingAccountId } = useSiteAccountSwitch();
const { loggedIn, currentAccountId, currentUser, userMap, isLoggingOut } = storeToRefs(userInfoStore);
const { active: accountHandoffActive } = useClientAccountHandoff();
const clientLockState = useClientLockState();
const canLoadProfile = useClientSessionReady(() => currentAccountId.value);
const profile = ref<UserProfile | null>(null);
const loading = ref(false);
const clientLoginReady = ref(false);
const pageLoading = computed(
  () =>
    accountHandoffActive.value ||
    loading.value ||
    Boolean(switchingAccountId.value) ||
    (!loggedIn.value && isLoggingOut.value) ||
    (isDesktopRuntime() && loggedIn.value && profile.value !== null && !clientLoginReady.value)
);
const loadError = ref("");
const avatarFailed = ref(false);
const sitesExpanded = useLocalStorage("jumpserver-client:site-management-expanded", false, { writeDefaults: false });
const sitesContentId = useId();
let requestSequence = 0;

const sites = computed(() => {
  const entries = Object.entries(userMap.value);
  const groups = new Map<string, { address: string; name: string; accounts: [string, SiteUserData][] }>();
  for (const entry of entries) {
    const [, account] = entry;
    let address = account.site.trim().replace(/\/+$/, "");
    try {
      // Keep deployment paths: the same host can contain separate JumpServer sites.
      address = new URL(address).href.replace(/\/+$/, "");
    } catch {
      // Keep saved addresses visible so their accounts can still be used to log in.
    }
    let group = groups.get(address);
    if (!group) {
      group = { address, name: account.siteName === account.site ? "" : account.siteName, accounts: [] };
      groups.set(address, group);
    }
    group.accounts.push(entry);
  }
  return [...groups.values()];
});

const activeSite = computed(() =>
  sites.value.find((site) => site.accounts.some(([accountId]) => accountId === currentAccountId.value))
);

const logoutAccountId = ref("");
const logoutOpen = ref(false);
const loggingOutAccountId = ref("");
const logoutAccountData = computed(() => userMap.value[logoutAccountId.value]);
const removingAccount = computed(() => logoutAccountId.value !== currentAccountId.value);
const logoutSite = computed(() =>
  sites.value.find((site) => site.accounts.some(([accountId]) => accountId === logoutAccountId.value))
);

function requestLogout(accountId: string) {
  if (switchingAccountId.value || loggingOutAccountId.value) return;
  logoutAccountId.value = accountId;
  logoutOpen.value = true;
}

async function logoutAccount() {
  const accountId = logoutAccountId.value;
  if (!logoutAccountData.value || switchingAccountId.value || loggingOutAccountId.value) return;
  loggingOutAccountId.value = accountId;
  logoutOpen.value = false;
  const wasCurrent = accountId === currentAccountId.value;
  try {
    if (wasCurrent && !(await confirmLeaveCurrentSiteSessions("logout"))) return;
    await userInfoStore.deleteUserData(accountId);
    if (wasCurrent && !loggedIn.value) {
      await closeSettings();
      await navigateTo(localePath({ path: "/" }));
    }
  } catch {
    toast.add({
      title: t(wasCurrent ? "UserProfile.LogoutAccountFailed" : "UserProfile.RemoveAccountFailed"),
      color: "error"
    });
  } finally {
    loggingOutAccountId.value = "";
  }
}

const editingSiteAddress = ref("");
const siteNameDraft = ref("");
const siteNameError = ref("");
const savingSite = ref(false);
const siteCertificateEditor = ref<{
  saveChanges: () => Promise<boolean>;
  hasChanges: boolean;
  busy: boolean;
} | null>(null);
const editingSite = computed(() => sites.value.find((site) => site.address === editingSiteAddress.value));
const siteEditorBusy = computed(() =>
  Boolean(
    savingSite.value || siteCertificateEditor.value?.busy || switchingAccountId.value || loggingOutAccountId.value
  )
);
const hasSiteChanges = computed(() =>
  Boolean(
    editingSite.value?.accounts.some(([, account]) => account.siteName !== siteNameDraft.value.trim()) ||
    siteCertificateEditor.value?.hasChanges
  )
);
const siteEditOpen = computed({
  get: () => Boolean(editingSiteAddress.value),
  set: (open) => {
    if (!open && !savingSite.value) cancelSiteEdit();
  }
});

function editSite(address: string) {
  if (savingSite.value || switchingAccountId.value || loggingOutAccountId.value) return;
  const site = sites.value.find((item) => item.address === address);
  if (!site) return;
  siteNameDraft.value = site.accounts[0]?.[1].siteName || site.name;
  siteNameError.value = "";
  editingSiteAddress.value = address;
}

function cancelSiteEdit() {
  editingSiteAddress.value = "";
  siteNameError.value = "";
}

async function saveSite(event?: KeyboardEvent) {
  if (event?.isComposing || event?.keyCode === 229) return;
  event?.preventDefault();
  if (siteEditorBusy.value || !hasSiteChanges.value) return;
  const site = editingSite.value;
  if (!site) return;
  const name = siteNameDraft.value.trim();
  if (!name) {
    siteNameError.value = t("Login.EmptySiteNameError");
    return;
  }
  if (
    sites.value.some(
      (item) =>
        item.address !== site.address &&
        item.accounts.some(([, account]) => account.siteName.trim().toLowerCase() === name.toLowerCase())
    )
  ) {
    siteNameError.value = t("Login.DuplicateSiteNameError");
    return;
  }
  savingSite.value = true;
  try {
    if (!(await siteCertificateEditor.value?.saveChanges()) || editingSiteAddress.value !== site.address) return;
    // Update only display metadata; replacing account objects would reactivate their API sessions.
    userInfoStore.$patch((state) => {
      for (const [accountId] of site.accounts) {
        if (!state.userMap[accountId]) continue;
        state.userMap[accountId].siteName = name;
        if (state.currentAccountId === accountId && state.currentUser) state.currentUser.siteName = name;
      }
    });
    cancelSiteEdit();
  } finally {
    savingSite.value = false;
  }
}

watch(currentAccountId, cancelSiteEdit);

const accountLabel = (account: UserData) =>
  account.name && account.username ? `${account.name} (${account.username})` : account.name || account.username || "—";

const avatarUrl = computed(() => {
  const value = profile.value?.avatar_url;
  if (!value || avatarFailed.value) return undefined;

  try {
    return new URL(value, currentUser.value?.site || globalThis.location?.origin).toString();
  } catch {
    return undefined;
  }
});

const choiceLabel = (value: string | number | LabeledValue | LabeledValue<number> | undefined) => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return value.label || String(value.value);
  return String(value);
};

const roleLabel = (role: { display_name?: string; name?: string; id: string }) =>
  role.display_name || role.name || role.id;

const formatPhone = (value: UserProfile["phone"]) => {
  if (!value) return "—";
  if (typeof value === "string") return value.trim() || "—";

  const phone = value.phone?.trim();
  if (!phone) return "—";

  const code = value.code?.trim();
  return code ? `${code} ${phone}` : phone;
};

const formatDate = (value?: string | null, fallback = "—") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(toIntlLocale(locale.value), {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
};

const basicRows = computed<DetailRow[]>(() => {
  if (!profile.value) return [];
  const rows: DetailRow[] = [
    { label: t("UserProfile.FullName"), value: profile.value.name || "—" },
    { label: t("UserProfile.Username"), value: profile.value.username || "—" },
    { label: t("UserProfile.Email"), value: profile.value.email || "—" }
  ];

  if (profile.value.phone !== undefined) {
    rows.push({ label: t("UserProfile.Phone"), value: formatPhone(profile.value.phone) });
  }
  if (profile.value.wechat !== undefined) {
    rows.push({ label: t("UserProfile.Wechat"), value: profile.value.wechat || "—" });
  }
  rows.push(
    { label: t("UserProfile.Source"), value: choiceLabel(profile.value.source) },
    { label: t("UserProfile.CurrentOrganization"), value: currentUser.value?.org?.name || "—" }
  );

  return rows;
});

const loginRows = computed<DetailRow[]>(() => {
  if (!isDesktopRuntime()) return [];

  const policy = currentUser.value?.clientLoginPolicy;
  const session = currentUser.value?.clientLoginSession;
  const unknown = t("UserProfile.ClientLoginUnknown");
  const timestamp = (value?: string | null) => formatDate(value, unknown);
  const deadline = session?.effective_expires_at ?? session?.expires_at;
  const effectiveExpiry =
    session && policy ? (deadline ? timestamp(deadline) : t("UserProfile.ClientLoginUnlimited")) : unknown;
  return [
    { label: t("UserProfile.ClientLoginStartedAt"), value: timestamp(session?.authenticated_at) },
    {
      label: t("UserProfile.ClientLoginEffectiveExpiry"),
      hint: session?.expiry_reason === "policy_changed" ? t("UserProfile.ClientLoginPolicyExpiry") : undefined,
      value: effectiveExpiry
    }
  ];
});

const systemRoles = computed(() => (profile.value?.system_roles || []).map(roleLabel));
const organizationRoles = computed(() => (profile.value?.org_roles || []).map(roleLabel));

const accountStatus = computed(() => {
  if (profile.value?.is_valid === false || profile.value?.is_active === false || profile.value?.is_expired === true) {
    return { label: t("UserProfile.Invalid"), color: "error" as const };
  }
  return { label: t("UserProfile.Valid"), color: "success" as const };
});

const mfaStatus = computed(() => ({
  label: profile.value?.mfa_enabled ? t("UserProfile.Enabled") : t("UserProfile.Disabled"),
  color: profile.value?.mfa_enabled ? ("success" as const) : ("neutral" as const)
}));

async function loadProfile() {
  const sequence = ++requestSequence;
  profile.value = null;
  clientLoginReady.value = false;
  loadError.value = "";
  loading.value = false;
  if (!import.meta.client || !loggedIn.value || !canLoadProfile.value) return;

  loading.value = true;

  try {
    const value = await getUserProfile();
    if (sequence !== requestSequence) return;
    profile.value = value;
    for (const account of [currentUser.value, userMap.value[currentAccountId.value]]) {
      if (!account) continue;
      account.name = value.name;
      account.username = value.username;
    }
    avatarFailed.value = false;
  } catch (error) {
    if (sequence !== requestSequence) return;
    profile.value = null;
    loadError.value = error instanceof Error ? error.message : String(error || "");
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function addAccount() {
  useEventBus().emit("login", { accountId: "" });
}

watch(
  [loggedIn, currentAccountId, canLoadProfile],
  ([authenticated, accountId], previous) => {
    // Preserve loaded settings across a lock, but retry an interrupted load after unlocking.
    if (previous?.[0] === authenticated && previous?.[1] === accountId && profile.value && clientLoginReady.value)
      return;
    void loadProfile();
  },
  { immediate: true }
);
</script>

<template>
  <div class="relative min-h-0 flex-1" :aria-busy="pageLoading">
    <div
      v-if="pageLoading"
      role="status"
      :aria-label="t('Loading.Loading')"
      class="absolute inset-0 flex items-center justify-center"
    >
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" aria-hidden="true" />
    </div>
    <div v-show="!pageLoading" class="space-y-8">
      <div v-if="!loggedIn" class="py-8">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-user-round-x"
          :title="t('UserProfile.NoUser')"
          :description="t('UserProfile.NoUserDescription')"
        >
          <template v-if="isDesktopRuntime()" #actions>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              class="hover:text-primary hover:ring-primary focus-visible:text-primary focus-visible:ring-primary"
              :disabled="Boolean(loggingOutAccountId)"
              @click="addAccount"
            >
              {{ t("Login.LoginOtherAccount") }}
            </UButton>
          </template>
        </UAlert>
      </div>

      <template v-else>
        <UAlert
          v-if="loadError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('UserProfile.LoadFailed')"
          :description="loadError"
        >
          <template #actions>
            <UButton size="sm" color="error" variant="outline" @click="loadProfile">
              {{ t("UserProfile.Retry") }}
            </UButton>
          </template>
        </UAlert>

        <SettingsSection v-if="!loading && !loadError && profile" :title="t('UserProfile.CurrentAccount')">
          <SettingsGroup>
            <div class="flex items-center gap-4 px-4 py-4">
              <UAvatar
                :src="avatarUrl"
                :alt="profile.name || profile.username"
                color="primary"
                size="xl"
                class="shrink-0"
                @error="avatarFailed = true"
              />
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <h3 class="min-w-0 max-w-[40%] shrink-0 truncate font-sans text-sm font-medium text-highlighted">
                  {{
                    profile.name && profile.username
                      ? `${profile.name} (${profile.username})`
                      : profile.name || profile.username
                  }}
                </h3>
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <UTooltip
                    v-if="isDesktopRuntime() && activeSite?.name"
                    :text="activeSite.address"
                    :content="{ side: 'top', align: 'center' }"
                  >
                    <UBadge
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      class="min-w-0 max-w-full text-xs font-normal text-muted"
                    >
                      <span class="truncate">{{ activeSite.name }}</span>
                    </UBadge>
                  </UTooltip>
                </div>
              </div>
              <UTooltip v-if="isDesktopRuntime()" :text="t('UserProfile.LogoutAccount')">
                <UButton
                  :label="t('UserProfile.Logout')"
                  :aria-label="t('UserProfile.LogoutAccount')"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  :loading="loggingOutAccountId === currentAccountId"
                  :disabled="!currentAccountId || Boolean(switchingAccountId || loggingOutAccountId)"
                  @click="requestLogout(currentAccountId)"
                />
              </UTooltip>
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection v-if="isDesktopRuntime()" :title="t('UserProfile.SiteManagement')">
          <template #title>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              class="gap-1.5 p-0 text-sm font-semibold text-muted hover:text-highlighted focus-visible:text-highlighted"
              :aria-expanded="sitesExpanded"
              :aria-controls="sitesContentId"
              @click="sitesExpanded = !sitesExpanded"
            >
              {{ t("UserProfile.SiteManagement") }}
              <UTooltip :text="t('UserProfile.SiteAccountCountHint')" :content="{ side: 'top', align: 'center' }">
                <span :aria-label="t('UserProfile.SiteAccountCountHint')">
                  ({{ sites.length }}/{{ Object.keys(userMap).length }})
                </span>
              </UTooltip>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-3.5 transition-transform"
                :class="{ 'rotate-90': sitesExpanded }"
                aria-hidden="true"
              />
            </UButton>
          </template>
          <template #actions>
            <UButton
              :label="t('Login.LoginOtherAccount')"
              color="neutral"
              variant="link"
              size="sm"
              class="p-0 text-muted hover:text-highlighted focus-visible:text-highlighted"
              :disabled="Boolean(switchingAccountId || loggingOutAccountId)"
              @click="addAccount"
            />
          </template>
          <div v-show="sitesExpanded" :id="sitesContentId" class="space-y-3">
            <SettingsGroup v-for="site in sites" :key="site.address" class="group/site min-w-0">
              <div class="flex items-center gap-3 px-4 py-4">
                <UIcon name="i-lucide-globe" class="size-3.5 shrink-0 text-highlighted" aria-hidden="true" />
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <span class="inline-flex min-w-0 text-sm font-medium text-highlighted">
                    <SiteCertificateAddress :site="site.address" icon-tooltip-only />
                  </span>
                  <h3 v-if="site.name" class="min-w-0 max-w-[40%] shrink-0 truncate text-sm font-normal text-muted">
                    {{ site.name }}
                  </h3>
                </div>
                <UButton
                  :label="t('ContextMenu.Edit')"
                  :aria-label="`${t('UserProfile.EditSite')} ${site.name || site.address}`"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  :disabled="Boolean(switchingAccountId || loggingOutAccountId)"
                  @click="editSite(site.address)"
                />
              </div>
              <div class="@container/accounts divide-y divide-[var(--app-border)] pr-4 pl-10.5">
                <div
                  v-for="[accountId, account] in site.accounts"
                  :key="accountId"
                  class="grid min-h-10 grid-cols-[minmax(0,40%)_minmax(0,1fr)] items-center gap-3 py-2 text-muted @min-[28rem]/accounts:grid-cols-[minmax(0,40%)_minmax(0,1fr)_auto]"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <UIcon
                      name="i-lucide-circle-user-round"
                      class="size-3.5 shrink-0 text-highlighted"
                      aria-hidden="true"
                    />
                    <p class="truncate text-sm font-medium text-highlighted" :title="accountLabel(account)">
                      {{ accountLabel(account) }}
                    </p>
                  </div>
                  <div
                    class="flex min-w-0 cursor-default flex-wrap items-center gap-2"
                    @pointerdown.prevent
                    @click.stop
                  >
                    <UTooltip v-if="account.sessionExpired" :text="t('Login.SessionExpired')">
                      <UIcon
                        name="i-lucide-circle-x"
                        class="size-3.5 shrink-0 text-error"
                        :aria-label="t('Login.SessionExpired')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="accountId === currentAccountId && loggedIn"
                      :text="t('UserProfile.CurrentActiveUser')"
                    >
                      <UIcon
                        name="i-lucide-circle-check"
                        class="size-3.5 shrink-0 text-(--theme-accent)"
                        :aria-label="t('UserProfile.CurrentActiveUser')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="!account.sessionExpired && clientLockState?.accountLocks?.[accountId]"
                      :text="t('UserProfile.Locked')"
                    >
                      <UIcon
                        name="i-lucide-lock"
                        class="size-3.5 shrink-0 text-warning"
                        :aria-label="t('UserProfile.Locked')"
                      />
                    </UTooltip>
                  </div>
                  <div
                    class="col-span-2 flex shrink-0 items-center justify-self-end gap-2 @min-[28rem]/accounts:col-span-1"
                  >
                    <UTooltip
                      v-if="accountId !== currentAccountId || !loggedIn"
                      :text="t('UserProfile.SwitchToThisUser')"
                    >
                      <UButton
                        :label="t('UserProfile.Switch')"
                        :aria-label="`${t('UserProfile.Switch')} ${accountLabel(account)}`"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        class="shrink-0"
                        :loading="switchingAccountId === accountId"
                        :disabled="Boolean(switchingAccountId || loggingOutAccountId)"
                        @click="switchSiteAccount(accountId)"
                      />
                    </UTooltip>
                    <UTooltip
                      :text="
                        t(accountId === currentAccountId ? 'UserProfile.LogoutAccount' : 'UserProfile.RemoveAccount')
                      "
                    >
                      <UButton
                        :label="t(accountId === currentAccountId ? 'UserProfile.Logout' : 'UserProfile.Remove')"
                        :aria-label="`${t(accountId === currentAccountId ? 'UserProfile.LogoutAccount' : 'UserProfile.RemoveAccount')} ${accountLabel(account)}`"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        class="shrink-0"
                        :loading="loggingOutAccountId === accountId"
                        :disabled="Boolean(switchingAccountId || loggingOutAccountId)"
                        @click="requestLogout(accountId)"
                      />
                    </UTooltip>
                  </div>
                </div>
              </div>
            </SettingsGroup>
          </div>
        </SettingsSection>

        <template v-if="!loading && !loadError && profile">
          <SettingsSection :title="t('UserProfile.BasicInfo')">
            <SettingsGroup>
              <div
                v-for="row in basicRows"
                :key="row.label"
                class="flex items-start justify-between gap-8 px-4 py-3 text-sm"
              >
                <span class="shrink-0 text-sm font-medium text-highlighted">{{ row.label }}</span>
                <span class="min-w-0 break-all text-right text-muted">{{ row.value }}</span>
              </div>
              <div class="flex items-start justify-between gap-8 px-4 py-3 text-sm">
                <span class="shrink-0 text-sm font-medium text-highlighted">{{ t("UserProfile.SystemRoles") }}</span>
                <div class="flex min-w-0 flex-wrap justify-end gap-1.5">
                  <UBadge
                    v-for="role in systemRoles"
                    :key="role"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="text-muted"
                  >
                    {{ role }}
                  </UBadge>
                  <span v-if="systemRoles.length === 0" class="text-muted">—</span>
                </div>
              </div>
              <div v-if="organizationRoles.length" class="flex items-start justify-between gap-8 px-4 py-3 text-sm">
                <span class="shrink-0 text-sm font-medium text-highlighted">
                  {{ t("UserProfile.OrganizationRoles") }}
                </span>
                <div class="flex min-w-0 flex-wrap justify-end gap-1.5">
                  <UBadge
                    v-for="role in organizationRoles"
                    :key="role"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="text-muted"
                  >
                    {{ role }}
                  </UBadge>
                </div>
              </div>
              <div class="flex items-start justify-between gap-8 px-4 py-3 text-sm">
                <span class="shrink-0 text-sm font-medium text-highlighted">{{ t("UserProfile.ExpiresAt") }}</span>
                <span class="min-w-0 break-all text-right text-muted">
                  {{ formatDate(profile.date_expired) }}
                </span>
              </div>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection :title="t('UserProfile.SecurityStatus')">
            <SettingsGroup>
              <div class="flex items-center justify-between gap-8 px-4 py-3">
                <span class="text-sm font-medium text-highlighted">{{ t("UserProfile.AccountStatus") }}</span>
                <UBadge :color="accountStatus.color" variant="subtle">{{ accountStatus.label }}</UBadge>
              </div>
              <div class="flex items-center justify-between gap-8 px-4 py-3">
                <span class="text-sm font-medium text-highlighted">{{ t("UserProfile.MFA") }}</span>
                <UBadge :color="mfaStatus.color" variant="subtle">{{ mfaStatus.label }}</UBadge>
              </div>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection
            v-if="isDesktopRuntime()"
            :title="t('UserProfile.LoginInfo')"
            :description="t('UserProfile.ClientLoginExpiryHint')"
          >
            <SettingsGroup>
              <div v-for="row in loginRows" :key="row.label" class="px-4 py-3 text-sm">
                <div class="flex flex-wrap items-start justify-between gap-x-8 gap-y-1">
                  <span class="text-sm font-medium text-highlighted">{{ row.label }}</span>
                  <span class="min-w-0 break-words text-right text-muted">{{ row.value }}</span>
                </div>
                <p v-if="row.hint" class="mt-1 max-w-[70%] text-xs text-muted">{{ row.hint }}</p>
              </div>
            </SettingsGroup>
          </SettingsSection>
          <SettingsClientLogin v-if="isDesktopRuntime()" :key="currentAccountId" @ready="clientLoginReady = true" />
        </template>
      </template>
    </div>
    <ModalMessageDialog
      v-if="isDesktopRuntime()"
      v-model:open="siteEditOpen"
      :title="t('UserProfile.EditSite')"
      :description="editingSiteAddress"
      :busy="savingSite"
    >
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('Login.SiteName')" :error="siteNameError || undefined">
            <UInput
              v-model="siteNameDraft"
              :aria-label="t('Login.SiteName')"
              :disabled="Boolean(savingSite || switchingAccountId || loggingOutAccountId)"
              class="w-full"
              @update:model-value="siteNameError = ''"
              @keydown.enter="saveSite($event)"
            />
          </UFormField>
          <SiteCertificateSettings
            :key="editingSiteAddress"
            ref="siteCertificateEditor"
            :site="editingSiteAddress"
            :disabled="savingSite"
            checkbox
            show-certificate-link
            deferred
          />
        </div>
      </template>
      <template #footer>
        <UButton :loading="savingSite" :disabled="siteEditorBusy || !hasSiteChanges" @click="saveSite()">
          {{ t("Common.Save") }}
        </UButton>
      </template>
    </ModalMessageDialog>
    <ModalMessageDialog
      v-if="isDesktopRuntime()"
      v-model:open="logoutOpen"
      :title="t(removingAccount ? 'UserProfile.RemoveAccount' : 'UserProfile.LogoutAccount')"
      :busy="Boolean(loggingOutAccountId)"
    >
      <template #body>
        <div v-if="logoutAccountData" class="space-y-4 text-sm">
          <div class="space-y-1">
            <p class="break-words text-highlighted">{{ accountLabel(logoutAccountData) }}</p>
            <p class="break-all text-muted">{{ logoutSite?.address || logoutAccountData.site }}</p>
          </div>
          <p class="text-muted">
            {{
              t(
                removingAccount
                  ? logoutSite?.accounts.length === 1
                    ? "UserProfile.RemoveLastAccountDescription"
                    : "UserProfile.RemoveAccountDescription"
                  : logoutSite?.accounts.length === 1
                    ? "UserProfile.LogoutLastAccountDescription"
                    : "UserProfile.LogoutAccountDescription"
              )
            }}
          </p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" :label="t('Common.Cancel')" @click="logoutOpen = false" />
        <UButton
          color="error"
          :label="t(removingAccount ? 'UserProfile.Remove' : 'UserProfile.Logout')"
          @click="logoutAccount"
        />
      </template>
    </ModalMessageDialog>
  </div>
</template>
