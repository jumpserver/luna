<script setup lang="ts">
import { apiRequest, getUserProfile } from "~/composables/useApiRequest";
import { desktopOpener } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { formatClientLoginDuration, formatClientLoginTimestamp } from "~/utils/clientLoginPolicy";

interface DetailRow {
  label: string;
  value: string;
  highlighted?: boolean;
  hint?: string;
}

const { t, locale } = useI18n();
const toast = useToast();
const { loggedIn, currentAccountId, currentUser } = storeToRefs(useUserInfoStore());
const { isMacOS } = usePlatform();
const lockShortcut = computed(() => (isMacOS.value ? "⌘L" : "Ctrl+L"));
const openingCredentials = ref(false);

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
    if (!loggedIn.value || !isDesktopRuntime()) return;
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
  const duration = (minutes?: number) => {
    if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return unknown;
    return minutes === 0
      ? t("UserProfile.ClientLoginUnlimited")
      : formatClientLoginDuration(minutes * 60, locale.value);
  };
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
    },
    {
      label: t("UserProfile.ClientLoginReauthOnExit"),
      value: policy ? t(policy.reauth_on_exit ? "UserProfile.Enabled" : "UserProfile.Disabled") : unknown
    },
    { label: t("UserProfile.ClientLoginMaxLifetime"), value: duration(policy?.max_session_time) },
    {
      label: t("UserProfile.ClientLoginIdleLock"),
      value: policy?.idle_lock_time === 0 ? t("UserProfile.Disabled") : duration(policy?.idle_lock_time)
    }
  ];
});
</script>

<template>
  <div v-if="isDesktopRuntime() && loggedIn" class="space-y-8">
    <SettingsSection
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

    <SettingsSection :title="t('UserProfile.ClientLoginIdleLock')">
      <UAlert color="neutral" variant="soft" icon="i-lucide-lock-keyhole">
        <template #description>
          <div class="space-y-2 text-xs leading-relaxed">
            <p>{{ t("UserProfile.ClientLoginActivityLimits") }}</p>
            <p>{{ t("UserProfile.ClientLoginActivityScope") }}</p>
            <p>{{ t("UserProfile.ClientLockShortcut", { shortcut: lockShortcut }) }}</p>
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-external-link"
              :loading="openingCredentials"
              @click="openClientCredentials"
            >
              {{ t("ClientLock.ManagePassword") }}
            </UButton>
          </div>
        </template>
      </UAlert>
    </SettingsSection>
  </div>
</template>
