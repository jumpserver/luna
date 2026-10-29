<script setup lang="ts">
import type { LabeledValue, UserData, UserProfile } from "~/types";
import { getUserProfile } from "~/composables/useApiRequest";
import { useSiteAccountSwitch } from "~/composables/useSiteAccountSwitch";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { formatClientLoginDuration, formatClientLoginTimestamp } from "~/utils/clientLoginPolicy";

interface DetailRow {
  label: string;
  value: string;
  highlighted?: boolean;
  hint?: string;
}

const { t, locale } = useI18n();
const userInfoStore = useUserInfoStore();
const { switchAccount: switchSiteAccount } = useSiteAccountSwitch();
const { loggedIn, currentAccountId, currentUser, userMap } = storeToRefs(userInfoStore);

const profile = ref<UserProfile | null>(null);
const profileAccountId = ref("");
const loading = ref(false);
const switchingAccount = ref(false);
const loadError = ref("");
const avatarFailed = ref(false);
let requestSequence = 0;

const accounts = computed(() => Object.entries(userMap.value) as [string, UserData][]);

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

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(toIntlLocale(locale.value), {
    dateStyle: "medium",
    timeStyle: "short"
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

  return rows;
});

const accountRows = computed<DetailRow[]>(() => [
  { label: t("UserProfile.Source"), value: choiceLabel(profile.value?.source) },
  { label: t("UserProfile.CurrentSite"), value: currentUser.value?.siteName || currentUser.value?.site || "—" },
  { label: t("UserProfile.CurrentOrganization"), value: currentUser.value?.org?.name || "—" }
]);

const loginRows = computed<DetailRow[]>(() => [
  { label: t("UserProfile.LastLogin"), value: formatDate(profile.value?.last_login) },
  { label: t("UserProfile.JoinedAt"), value: formatDate(profile.value?.date_joined) },
  { label: t("UserProfile.ExpiresAt"), value: formatDate(profile.value?.date_expired) }
]);

const clientLoginRows = computed<DetailRow[]>(() => {
  const policy = currentUser.value?.clientLoginPolicy;
  const session = currentUser.value?.clientLoginSession;
  const unknown = t("UserProfile.ClientLoginUnknown");
  const timestamp = (value?: string | null) => formatClientLoginTimestamp(value, locale.value) || unknown;
  const duration = (minutes?: number) => {
    if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return unknown;
    return minutes === 0
      ? t("UserProfile.ClientLoginUnlimited")
      : formatClientLoginDuration(minutes * 60, locale.value);
  };
  const absoluteDeadline = session?.expires_at ? Date.parse(session.expires_at) : NaN;
  const idleDeadline = session?.idle_expires_at ? Date.parse(session.idle_expires_at) : NaN;
  const hasAbsoluteDeadline = Boolean(policy && policy.max_session_time > 0 && Number.isFinite(absoluteDeadline));
  const hasIdleDeadline = Boolean(policy && policy.max_idle_time > 0 && Number.isFinite(idleDeadline));
  const idleExpiresFirst = hasIdleDeadline && (!hasAbsoluteDeadline || idleDeadline < absoluteDeadline);
  let effectiveExpiry = unknown;
  if (session && policy) {
    if (policy.max_session_time === 0 && policy.max_idle_time === 0) {
      effectiveExpiry = t("UserProfile.ClientLoginUnlimited");
    } else if (
      (policy.max_session_time === 0 || hasAbsoluteDeadline) &&
      (policy.max_idle_time === 0 || hasIdleDeadline)
    ) {
      effectiveExpiry = timestamp(idleExpiresFirst ? session.idle_expires_at : session.expires_at);
    }
  }
  return [
    { label: t("UserProfile.ClientLoginStartedAt"), value: timestamp(session?.authenticated_at), highlighted: true },
    {
      label: t("UserProfile.ClientLoginEffectiveExpiry"),
      hint: idleExpiresFirst ? t("UserProfile.ClientLoginIdleExpiry") : undefined,
      value: effectiveExpiry,
      highlighted: true
    },
    {
      label: t("UserProfile.ClientLoginReauthOnExit"),
      value: policy ? t(policy.reauth_on_exit ? "UserProfile.Enabled" : "UserProfile.Disabled") : unknown
    },
    { label: t("UserProfile.ClientLoginMaxLifetime"), value: duration(policy?.max_session_time) },
    {
      label: t("UserProfile.ClientLoginIdleTimeout"),
      value: policy?.max_idle_time === 0 ? t("UserProfile.Disabled") : duration(policy?.max_idle_time)
    }
  ];
});

const clientLoginAccount = computed(() => {
  const username = profileAccountId.value === currentAccountId.value ? profile.value?.username : "";
  const name = currentUser.value?.name || "—";
  return username && username !== name ? `${name} (${username})` : name;
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
  if (!import.meta.client || !loggedIn.value) {
    profile.value = null;
    loadError.value = "";
    return;
  }

  const sequence = ++requestSequence;
  const accountId = currentAccountId.value;
  loading.value = true;
  loadError.value = "";

  try {
    const value = await getUserProfile();
    if (sequence !== requestSequence) return;
    profile.value = value;
    profileAccountId.value = accountId;
    avatarFailed.value = false;
  } catch (error) {
    if (sequence !== requestSequence) return;
    profile.value = null;
    loadError.value = error instanceof Error ? error.message : String(error || "");
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

async function switchAccount(accountId: string) {
  if (accountId === currentAccountId.value || switchingAccount.value) return;
  switchingAccount.value = true;
  try {
    if (await switchSiteAccount(accountId)) await loadProfile();
  } finally {
    switchingAccount.value = false;
  }
}

function addAccount() {
  useEventBus().emit("login", undefined);
}

watch(
  [loggedIn, currentAccountId],
  () => {
    if (!switchingAccount.value) void loadProfile();
  },
  { immediate: true }
);
</script>

<template>
  <div class="space-y-8">
    <div v-if="!loggedIn" class="py-8">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-user-round-x"
        :title="t('UserProfile.NoUser')"
        :description="t('UserProfile.NoUserDescription')"
      >
        <template v-if="isDesktopRuntime()" #actions>
          <UButton size="sm" color="neutral" variant="outline" @click="addAccount">
            {{ t("Login.AddAccount") }}
          </UButton>
        </template>
      </UAlert>
    </div>

    <template v-else>
      <div v-if="loading" class="space-y-6">
        <div class="flex items-center gap-3">
          <USkeleton class="size-12 rounded-full" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-3 w-56" />
          </div>
        </div>
        <div v-for="index in 6" :key="index" class="flex items-center justify-between gap-6">
          <USkeleton class="h-3 w-28" />
          <USkeleton class="h-3 w-48" />
        </div>
      </div>

      <UAlert
        v-else-if="loadError"
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

      <template v-else-if="profile">
        <SettingsGroup :divided="false">
          <div class="flex items-center gap-4 px-4 py-3">
            <UAvatar
              :src="avatarUrl"
              :alt="profile.name || profile.username"
              color="primary"
              size="xl"
              class="shrink-0"
              @error="avatarFailed = true"
            />
            <div class="min-w-0">
              <h2 class="truncate font-sans text-sm font-medium text-highlighted">
                {{ profile.name || profile.username }}
              </h2>
              <p class="truncate font-sans text-xs text-muted">{{ profile.username }} · {{ currentUser?.site }}</p>
            </div>
          </div>
        </SettingsGroup>

        <SettingsSection :title="t('UserProfile.BasicInfo')">
          <SettingsGroup>
            <div
              v-for="row in basicRows"
              :key="row.label"
              class="flex items-start justify-between gap-8 px-4 py-3 text-sm"
            >
              <span class="shrink-0 text-muted">{{ row.label }}</span>
              <span class="min-w-0 break-all text-right text-highlighted">{{ row.value }}</span>
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection :title="t('UserProfile.AccountAndRoles')">
          <SettingsGroup>
            <div
              v-for="row in accountRows"
              :key="row.label"
              class="flex items-start justify-between gap-8 px-4 py-3 text-sm"
            >
              <span class="shrink-0 text-muted">{{ row.label }}</span>
              <span class="min-w-0 break-all text-right text-highlighted">{{ row.value }}</span>
            </div>
            <div class="flex items-start justify-between gap-8 px-4 py-3 text-sm">
              <span class="shrink-0 text-muted">{{ t("UserProfile.SystemRoles") }}</span>
              <div class="flex min-w-0 flex-wrap justify-end gap-1.5">
                <UBadge v-for="role in systemRoles" :key="role" color="neutral" variant="subtle" size="sm">
                  {{ role }}
                </UBadge>
                <span v-if="systemRoles.length === 0" class="text-highlighted">—</span>
              </div>
            </div>
            <div v-if="organizationRoles.length" class="flex items-start justify-between gap-8 px-4 py-3 text-sm">
              <span class="shrink-0 text-muted">{{ t("UserProfile.OrganizationRoles") }}</span>
              <div class="flex min-w-0 flex-wrap justify-end gap-1.5">
                <UBadge v-for="role in organizationRoles" :key="role" color="neutral" variant="subtle" size="sm">
                  {{ role }}
                </UBadge>
              </div>
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection :title="t('UserProfile.SecurityStatus')">
          <SettingsGroup>
            <div class="flex items-center justify-between gap-8 px-4 py-3">
              <span class="text-sm text-muted">{{ t("UserProfile.AccountStatus") }}</span>
              <UBadge :color="accountStatus.color" variant="subtle">{{ accountStatus.label }}</UBadge>
            </div>
            <div class="flex items-center justify-between gap-8 px-4 py-3">
              <span class="text-sm text-muted">{{ t("UserProfile.MFA") }}</span>
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted">{{ choiceLabel(profile.mfa_level) }}</span>
                <UBadge :color="mfaStatus.color" variant="subtle">{{ mfaStatus.label }}</UBadge>
              </div>
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection :title="t('UserProfile.LoginInfo')">
          <SettingsGroup>
            <div
              v-for="row in loginRows"
              :key="row.label"
              class="flex items-start justify-between gap-8 px-4 py-3 text-sm"
            >
              <span class="shrink-0 text-muted">{{ row.label }}</span>
              <span class="min-w-0 text-right text-highlighted">{{ row.value }}</span>
            </div>
          </SettingsGroup>
        </SettingsSection>
      </template>

      <SettingsSection
        v-if="isDesktopRuntime()"
        :title="t('UserProfile.SiteAccounts')"
        :description="t('UserProfile.SiteAccountsDescription')"
      >
        <template #actions>
          <UButton
            :label="t('Login.AddAccount')"
            icon="i-lucide-user-round-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addAccount"
          />
        </template>

        <SettingsGroup>
          <div v-for="[accountId, account] in accounts" :key="accountId" class="flex items-center gap-3 px-4 py-3">
            <UAvatar :alt="account.name" color="neutral" size="sm" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ account.name }}</p>
              <p class="truncate text-xs text-muted">{{ account.siteName || account.site }} · {{ account.site }}</p>
            </div>
            <UBadge v-if="accountId === currentAccountId" color="primary" variant="subtle" size="sm">
              {{ t("UserProfile.Current") }}
            </UBadge>
            <UButton
              v-else
              :label="t('UserProfile.Switch')"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="switchingAccount"
              @click="switchAccount(accountId)"
            />
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        v-if="isDesktopRuntime()"
        :title="t('UserProfile.ClientLoginInfo')"
        :description="t('UserProfile.ClientLoginInfoDescription')"
      >
        <SettingsGroup>
          <div class="space-y-1 px-4 py-3 text-sm">
            <p class="break-all text-highlighted">
              <span class="text-muted">{{ t("UserProfile.CurrentSite") }} ·</span>
              {{ currentUser?.siteName || currentUser?.site }}
              <span v-if="currentUser?.siteName" class="text-muted">({{ currentUser?.site }})</span>
            </p>
            <p class="break-words text-highlighted">
              <span class="text-muted">{{ t("UserProfile.ClientLoginCurrentUser") }} ·</span>
              {{ clientLoginAccount }}
            </p>
          </div>
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
        <p class="text-xs leading-relaxed text-muted">{{ t("UserProfile.ClientLoginExpiryHint") }}</p>
      </SettingsSection>
    </template>
  </div>
</template>
