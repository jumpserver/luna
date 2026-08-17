<script setup lang="ts">
import type { SuggestionUser } from "@/lion/api";
import { useKokoSessionAdapter } from "@jumpserver/koko";
import { getLionWorkspaceSession } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";

const props = defineProps<{
  disabled?: boolean;
}>();

const { t } = useI18n();
const { activePaneId, activeTab } = useWorkspaceTabs();
const kokoAdapter = useKokoSessionAdapter();
const activeSessionId = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value)?.id || tab?.id || "";
});
const lionAdapter = computed(() => getLionWorkspaceSession(activeSessionId.value)?.share || null);
const onlineUsers = computed(() => lionAdapter.value?.onlineUsers.value || kokoAdapter.onlineUsers.value);
const shareInfo = computed(() => lionAdapter.value?.shareInfo.value || kokoAdapter.shareInfo.value);
const userOptions = computed<SuggestionUser[]>(
  () => (lionAdapter.value?.userOptions.value || kokoAdapter.userOptions.value) as SuggestionUser[]
);
const hasMoreUsers = computed(() => Boolean(lionAdapter.value?.hasMoreUsers.value));
const adapterKey = computed(() => `${lionAdapter.value ? "lion" : "koko"}:${activeSessionId.value}`);

const shareModalOpen = ref(false);
const searchLoading = ref(false);
const showLinkResult = ref(false);
const searchQuery = ref("");
const selectedUserIds = ref<string[]>([]);
const selectedUsers = ref<Record<string, SuggestionUser>>({});

const shareLinkRequest = reactive({
  expiredTime: 10,
  actionPerm: "writable" as "writable" | "readonly"
});

const expiredOptions = [
  { label: t("RightPanel.ExpiredMinutes", { count: 1 }), value: 1 },
  { label: t("RightPanel.ExpiredMinutes", { count: 5 }), value: 5 },
  { label: t("RightPanel.ExpiredMinutes", { count: 10 }), value: 10 },
  { label: t("RightPanel.ExpiredMinutes", { count: 20 }), value: 20 },
  { label: t("RightPanel.ExpiredHour", { count: 1 }), value: 60 }
];

const actionPermOptions: Array<{ label: string; value: "writable" | "readonly" }> = [
  { label: t("RightPanel.Writable"), value: "writable" },
  { label: t("RightPanel.ReadOnly"), value: "readonly" }
];

const userSelectItems = computed(() =>
  (userOptions.value || []).map((item) => ({
    label: item.username,
    value: item.id
  }))
);

function toggleShareUser(userId: string) {
  if (selectedUserIds.value.includes(userId)) {
    selectedUserIds.value = selectedUserIds.value.filter((id) => id !== userId);
    delete selectedUsers.value[userId];
    return;
  }

  const user = userOptions.value.find((item) => item.id === userId);
  if (user) selectedUsers.value[userId] = user;
  selectedUserIds.value = [...selectedUserIds.value, userId];
}

watch(
  () => shareInfo.value.sessionId,
  () => {
    selectedUserIds.value = [];
    selectedUsers.value = {};
    searchQuery.value = "";
    searchLoading.value = false;
    showLinkResult.value = Boolean(shareInfo.value.shareCode);
  }
);

watch(adapterKey, () => {
  shareModalOpen.value = false;
  showLinkResult.value = Boolean(shareInfo.value.shareCode);
  selectedUserIds.value = [];
  selectedUsers.value = {};
  searchQuery.value = "";
  searchLoading.value = false;
});

watch(
  () => shareInfo.value.shareCode,
  (code) => {
    if (code) showLinkResult.value = true;
  }
);

watch(
  () => userOptions.value,
  (options) => {
    if (options?.length) searchLoading.value = false;
    for (const user of options || []) {
      if (selectedUserIds.value.includes(user.id)) selectedUsers.value[user.id] = user;
    }
  }
);

async function runSearch(query: string, loadMore = false) {
  searchLoading.value = true;
  const lion = lionAdapter.value;
  if (!lion) {
    kokoAdapter.searchUsers(query);
    return;
  }
  await lion.searchUsers(query, loadMore);
  searchLoading.value = false;
}

const debouncedSearch = useDebounceFn((query: string) => void runSearch(query), 300);

const selectedShareUsers = computed<SuggestionUser[]>(() =>
  selectedUserIds.value
    .map((id) => selectedUsers.value[id] || userOptions.value.find((item) => item.id === id))
    .filter((item): item is SuggestionUser => Boolean(item))
);

function openShareModal() {
  showLinkResult.value = Boolean(shareInfo.value.shareCode);
  shareModalOpen.value = true;
}

function handleCreateLink() {
  const request = {
    expiredTime: shareLinkRequest.expiredTime,
    actionPerm: shareLinkRequest.actionPerm,
    users: selectedShareUsers.value
  };
  if (lionAdapter.value) void lionAdapter.value.createShareLink(request);
  else kokoAdapter.createShareLink(request);
}

function handleRemoveShareUser(userId: string) {
  const user = onlineUsers.value.find((item) => item.user_id === userId && !item.primary);
  if (!user) return;
  if (lionAdapter.value) void lionAdapter.value.removeShareUser(user);
  else kokoAdapter.removeShareUser(user as any);
}

function handleBack() {
  if (lionAdapter.value) lionAdapter.value.resetShareState();
  else kokoAdapter.resetShareState();
  showLinkResult.value = false;
  selectedUserIds.value = [];
  selectedUsers.value = {};
  searchQuery.value = "";
}

function handleCopyShareURL() {
  if (lionAdapter.value) void lionAdapter.value.copyShareURL();
  else kokoAdapter.copyShareURL();
}
</script>

<template>
  <section>
    <div class="mb-2 flex items-center gap-2">
      <div class="flex min-w-0 items-center gap-2 text-[12px] font-medium text-gray-800 dark:text-gray-100">
        <span>{{ t("RightPanel.OnlineUsers") }}</span>
        <UBadge color="success" variant="subtle" size="xs">
          {{ onlineUsers.length }}
        </UBadge>
      </div>

      <UTooltip :text="props.disabled ? t('RightPanel.ShareDisabled') : t('RightPanel.Share')">
        <UButton
          class="ml-auto shrink-0"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-share-2"
          :label="t('RightPanel.Share')"
          :disabled="props.disabled"
          @click="openShareModal"
        />
      </UTooltip>
    </div>

    <div v-if="onlineUsers.length" class="space-y-1.5">
      <div
        v-for="user in onlineUsers"
        :key="user.user_id"
        class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-2 text-[11px] dark:border-white/10"
      >
        <div class="min-w-0">
          <div class="truncate font-medium text-gray-800 dark:text-gray-100">
            {{ user.user }}
          </div>
          <div class="truncate text-[10px] text-gray-500 dark:text-gray-400">
            {{ user.remote_addr || "-" }}
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <UBadge v-if="user.primary" size="xs" color="success" variant="subtle">
            {{ t("RightPanel.PrimaryUser") }}
          </UBadge>
          <UBadge v-else size="xs" color="info" variant="subtle">
            {{ user.writable ? t("RightPanel.Writable") : t("RightPanel.ReadOnly") }}
          </UBadge>
          <UButton
            v-if="!user.primary"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="t('RightPanel.RemoveShareUser')"
            @click="handleRemoveShareUser(user.user_id)"
          />
        </div>
      </div>
    </div>
    <p v-else class="text-[11px] text-gray-500 dark:text-gray-400">
      {{ t("RightPanel.NoOnlineUsers") }}
    </p>

    <UModal
      v-model:open="shareModalOpen"
      :title="showLinkResult ? t('RightPanel.ShareLink') : t('RightPanel.Share')"
      :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div v-if="!showLinkResult" class="space-y-4">
          <UFormField :label="t('RightPanel.ShareUser')">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              :placeholder="t('RightPanel.GetShareUser')"
              :loading="searchLoading"
              @update:model-value="debouncedSearch"
              @focus="debouncedSearch('')"
            />

            <div v-if="selectedUserIds.length" class="mt-2 flex flex-wrap gap-1.5">
              <UBadge
                v-for="userId in selectedUserIds"
                :key="userId"
                size="sm"
                color="primary"
                variant="subtle"
                class="cursor-pointer"
                @click="toggleShareUser(userId)"
              >
                {{
                  selectedUsers[userId]?.username ||
                  userSelectItems.find((item) => item.value === userId)?.label ||
                  userId
                }}
                <UIcon name="i-lucide-x" class="ml-1 size-3" />
              </UBadge>
            </div>

            <div
              v-if="userSelectItems.length"
              class="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1.5 dark:border-white/10"
            >
              <button
                v-for="item in userSelectItems"
                :key="item.value"
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/8"
                :class="selectedUserIds.includes(item.value) ? 'bg-primary/8 text-primary' : ''"
                @click="toggleShareUser(item.value)"
              >
                <UIcon
                  :name="selectedUserIds.includes(item.value) ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                  class="size-4 shrink-0"
                />
                <span class="truncate">{{ item.label }}</span>
              </button>
              <UButton
                v-if="hasMoreUsers"
                block
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="searchLoading"
                :label="t('RightPanel.LoadMoreUsers')"
                @click="runSearch(searchQuery, true)"
              />
            </div>
          </UFormField>

          <div>
            <div class="mb-2 text-sm text-gray-600 dark:text-gray-300">
              {{ t("RightPanel.ExpiredTime") }}
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="item in expiredOptions"
                :key="item.value"
                size="sm"
                :color="shareLinkRequest.expiredTime === item.value ? 'primary' : 'neutral'"
                :variant="shareLinkRequest.expiredTime === item.value ? 'soft' : 'outline'"
                @click="shareLinkRequest.expiredTime = item.value"
              >
                {{ item.label }}
              </UButton>
            </div>
          </div>

          <div>
            <div class="mb-2 text-sm text-gray-600 dark:text-gray-300">
              {{ t("RightPanel.ActionPerm") }}
            </div>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                v-for="item in actionPermOptions"
                :key="item.value"
                size="sm"
                block
                :color="shareLinkRequest.actionPerm === item.value ? 'primary' : 'neutral'"
                :variant="shareLinkRequest.actionPerm === item.value ? 'soft' : 'outline'"
                @click="shareLinkRequest.actionPerm = item.value"
              >
                {{ item.label }}
              </UButton>
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <UInput readonly :model-value="shareInfo.shareURL" icon="i-lucide-link" />

          <div class="rounded-lg border border-gray-200 px-4 py-4 text-center dark:border-white/10">
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ t("RightPanel.VerifyCode") }}
            </div>
            <div class="mt-1 font-ui-mono text-2xl tracking-widest text-gray-900 dark:text-white">
              {{ shareInfo.shareCode }}
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <template v-if="!showLinkResult">
          <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="shareModalOpen = false" />
          <UButton color="primary" icon="i-lucide-link" :label="t('RightPanel.CreateLink')" @click="handleCreateLink" />
        </template>
        <template v-else>
          <UButton color="neutral" variant="ghost" :label="t('RightPanel.Back')" @click="handleBack" />
          <UButton color="success" icon="i-lucide-copy" :label="t('RightPanel.CopyLink')" @click="handleCopyShareURL" />
        </template>
      </template>
    </UModal>
  </section>
</template>
