<script setup lang="ts">
import { confirmLeaveCurrentSiteSessions, useSiteAccountSwitch } from "~/composables/useSiteAccountSwitch";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { disabled = false, selectedAccountId = "" } = defineProps<{ disabled?: boolean; selectedAccountId?: string }>();
const emit = defineEmits<{ select: []; switched: [] }>();
const { t } = useI18n();
const toast = useToast();
const user = useUserInfoStore();
const { currentAccountId, loggedIn, userMap } = storeToRefs(user);
const { switchAccount, switchingAccountId } = useSiteAccountSwitch();
const { recentSites, setRecentSites } = useSettingManager();
const accounts = computed(() => Object.entries(userMap.value));
const selectedId = computed(() => selectedAccountId || currentAccountId.value);
const removingId = ref("");
const removingAccount = computed(() => userMap.value[removingId.value]);
const deleting = ref(false);
const deleteOpen = computed({
  get: () => Boolean(removingAccount.value),
  set: (open) => {
    if (!open && !deleting.value) removingId.value = "";
  }
});

const selectAccount = async (accountId: string) => {
  emit("select");
  if (await switchAccount(accountId)) emit("switched");
};

const deleteAccount = async () => {
  const accountId = removingId.value;
  const account = removingAccount.value;
  if (!account || deleting.value) return;
  deleting.value = true;
  try {
    if (accountId === currentAccountId.value && !(await confirmLeaveCurrentSiteSessions("logout"))) return;
    await user.deleteUserData(accountId);
    if (!Object.values(userMap.value).some((saved) => saved.site === account.site)) {
      setRecentSites(recentSites.value.filter((site) => site.replace(/\/+$/, "") !== account.site.replace(/\/+$/, "")));
    }
    removingId.value = "";
  } catch {
    toast.add({ title: t("Login.DeleteSiteFailed"), color: "error" });
  } finally {
    deleting.value = false;
  }
};

onMounted(async () => {
  if (!isDesktopRuntime()) return;
  const savedAccounts = Object.entries(userMap.value);
  try {
    // Read local token availability without exposing tokens or changing the active API session.
    const authenticated = new Set(await desktopInvoke<string[]>("list_authenticated_accounts"));
    for (const [id, account] of savedAccounts) {
      if (userMap.value[id] !== account || authenticated.has(id)) continue;
      const savedReason = account.sessionExpiredReason !== "unknown" ? account.sessionExpiredReason : undefined;
      user.markSessionExpired(id, savedReason || (account.clientLoginPolicy?.reauth_on_exit ? "app_exit" : undefined));
    }
  } catch {
    // A bridge failure does not establish that an account has expired; switching still validates it.
  }
});
</script>

<template>
  <div
    v-if="isDesktopRuntime() && accounts.length"
    class="min-h-0 max-h-64 space-y-0.5 overflow-y-auto overscroll-contain"
  >
    <div v-for="[accountId, account] in accounts" :key="accountId" class="flex items-center gap-0.5">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="min-w-0 flex-1 justify-start py-1 text-left"
        :title="account.site"
        :aria-current="accountId === selectedId ? 'true' : undefined"
        :loading="switchingAccountId === accountId"
        :disabled="disabled || Boolean(switchingAccountId) || deleting"
        @click="selectAccount(accountId)"
      >
        <UIcon name="i-lucide-globe" class="size-4 shrink-0 text-muted" />
        <span class="min-w-0 flex-1">
          <span class="block truncate">{{ account.siteName || account.site }}</span>
          <span class="flex min-w-0 items-center gap-1.5 text-xs font-normal text-muted">
            <span
              v-if="account.sessionExpired || (accountId === currentAccountId && !loggedIn)"
              class="shrink-0"
              :class="{ 'text-warning': account.sessionExpired }"
            >
              {{ t(account.sessionExpired ? "Login.SessionExpired" : "Common.LoginFirst") }}
            </span>
            <span class="truncate">{{ account.name || account.site }}</span>
          </span>
        </span>
        <UBadge v-if="accountId === selectedId" color="neutral" variant="soft" size="sm">
          {{ t("UserProfile.Current") }}
        </UBadge>
      </UButton>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('Login.DeleteSite', { name: account.siteName || account.site })"
        :title="t('Login.DeleteSite', { name: account.siteName || account.site })"
        :disabled="disabled || Boolean(switchingAccountId) || deleting"
        @click="removingId = accountId"
      />
    </div>
  </div>

  <UModal
    v-model:open="deleteOpen"
    :title="t('Login.DeleteSite', { name: removingAccount?.siteName || removingAccount?.site || '' })"
    :description="t('Login.DeleteSiteDescription')"
    :dismissible="!deleting"
  >
    <template #body>
      <div data-profile-nested-popover class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" :disabled="deleting" @click="deleteOpen = false">
          {{ t("Common.Cancel") }}
        </UButton>
        <UButton color="error" :loading="deleting" @click="deleteAccount">{{ t("Common.Delete") }}</UButton>
      </div>
    </template>
  </UModal>
</template>
