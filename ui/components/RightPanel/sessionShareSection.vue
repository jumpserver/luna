<script setup lang="ts">
import type { SuggestionUser } from "@/lion/api";
import { useKokoSessionAdapter } from "#koko";
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

const userSelectItems = computed(() => {
  const seen = new Set<string>();
  const items: Array<{ label: string; value: string }> = [];
  const push = (id: string, label?: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    items.push({ label: label || id, value: id });
  };

  for (const id of selectedUserIds.value) {
    const user = selectedUsers.value[id] || userOptions.value.find((item) => item.id === id);
    push(id, user?.username);
  }
  for (const user of userOptions.value || []) push(user.id, user.username);
  return items;
});

function cacheSelectedUsers(ids: string[]) {
  for (const id of ids) {
    if (selectedUsers.value[id]) continue;
    const user = userOptions.value.find((item) => item.id === id);
    if (user) selectedUsers.value[id] = user;
  }
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
    cacheSelectedUsers(selectedUserIds.value);
  }
);

watch(selectedUserIds, (ids) => cacheSelectedUsers(ids));

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

watch(searchQuery, (query) => {
  if (!shareModalOpen.value) return;
  debouncedSearch(query);
});

const selectedShareUsers = computed<SuggestionUser[]>(() =>
  selectedUserIds.value
    .map((id) => selectedUsers.value[id] || userOptions.value.find((item) => item.id === id))
    .filter((item): item is SuggestionUser => Boolean(item))
);

function openShareModal() {
  showLinkResult.value = Boolean(shareInfo.value.shareCode);
  shareModalOpen.value = true;
}

function handleShareUserOpen(open: boolean) {
  if (open) void runSearch(searchQuery.value);
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
            <UInputMenu
              v-model="selectedUserIds"
              v-model:search-term="searchQuery"
              multiple
              ignore-filter
              open-on-focus
              value-key="value"
              label-key="label"
              icon="i-lucide-search"
              size="md"
              class="w-full"
              :items="userSelectItems"
              :loading="searchLoading"
              :placeholder="selectedUserIds.length ? '' : t('RightPanel.GetShareUser')"
              :ui="{
                base: 'w-full min-h-9 items-center',
                tagsInput: 'min-w-0 flex-1'
              }"
              @update:open="handleShareUserOpen"
            >
              <template #content-bottom>
                <div v-if="hasMoreUsers" class="border-t border-default p-1.5">
                  <UButton
                    block
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :loading="searchLoading"
                    :label="t('RightPanel.LoadMoreUsers')"
                    @click.stop="runSearch(searchQuery, true)"
                  />
                </div>
              </template>
            </UInputMenu>
          </UFormField>

          <UFormField :label="t('RightPanel.ExpiredTime')">
            <USelect
              v-model="shareLinkRequest.expiredTime"
              :items="expiredOptions"
              value-key="value"
              label-key="label"
              size="md"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('RightPanel.ActionPerm')">
            <UTabs
              v-model="shareLinkRequest.actionPerm"
              :items="actionPermOptions"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="pill"
              size="md"
              :content="false"
              class="w-full"
              :ui="{ root: 'w-full', list: 'w-full', trigger: 'w-full justify-center' }"
            />
          </UFormField>
        </div>

        <div v-else class="space-y-4">
          <UFormField :label="t('RightPanel.ShareLink')">
            <UInput readonly :model-value="shareInfo.shareURL" icon="i-lucide-link" />
          </UFormField>

          <UCard>
            <div class="py-2 text-center">
              <p class="text-sm text-muted">
                {{ t("RightPanel.VerifyCode") }}
              </p>
              <p class="mt-1 font-ui-mono text-2xl tracking-widest text-highlighted">
                {{ shareInfo.shareCode }}
              </p>
            </div>
          </UCard>
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
