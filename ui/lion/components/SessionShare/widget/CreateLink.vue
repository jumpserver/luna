<script setup lang="ts">
import type { Composer } from "vue-i18n";
import type { SuggestionUser } from "@/lion/api";
import { useDebounceFn } from "@vueuse/core";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createShareURL, getSuggestionUsers } from "@/lion/api";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";
import { withBaseUrl } from "@/lion/utils/base";
import { writeClipboardText } from "@/utils/clipboard";

export type TranslateFunction = Composer["t"];

const props = defineProps<{
  session: string;
  disabledCreateLink: boolean;
  endpointUrl?: string;
  tokenId?: string;
  ticket?: string;
}>();

const getMinuteLabel = (item: number, t: TranslateFunction): string => {
  const minuteLabel = item > 1 ? t("Minutes") : t("Minute");
  return `${item} ${minuteLabel}`;
};

interface ExpiredOption {
  label: string;
  value: number;
  checked: boolean;
}

interface ActionPermOption {
  label: string;
  value: string;
  checked: boolean;
}

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const shareInfo = ref({
  shareCode: "",
  sessionId: props.session,
  shareId: "",
  shareURL: ""
});
const PAGE_SIZE = 10;
const userOptions = ref<SuggestionUser[]>([]);
const knownUsers = ref<Record<string, SuggestionUser>>({});
const selectedUserIds = ref<string[]>([]);
const searchTerm = ref("");
const currentQuery = ref("");
const currentPage = ref(0);
const hasMore = ref(true);
const searchLoading = ref(false);
const createLoading = ref(false);
const showLinkResult = ref(false);
let searchGeneration = 0;

const normalizeUsers = (users: SuggestionUser[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  const seen = new Set<string>();

  return users.filter((user) => {
    if (!user?.id || seen.has(user.id)) return false;
    seen.add(user.id);
    if (!normalizedQuery) return true;
    return [user.name, user.username].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  });
};

const searchUsers = async (value: string, loadMore = false) => {
  if (searchLoading.value && loadMore) return;

  const query = value.trim();
  const page = loadMore && query === currentQuery.value ? currentPage.value + 1 : 1;
  const generation = loadMore ? searchGeneration : ++searchGeneration;

  if (!loadMore) {
    currentQuery.value = query;
    currentPage.value = 0;
    userOptions.value = [];
    hasMore.value = true;
  }

  searchLoading.value = true;
  try {
    const response = await getSuggestionUsers(query, page, PAGE_SIZE);
    if (generation !== searchGeneration || query !== currentQuery.value) return;

    const paginated = !Array.isArray(response);
    const pageUsers = normalizeUsers(paginated ? response.results || [] : response, query);
    const merged = loadMore ? [...userOptions.value, ...pageUsers] : pageUsers;
    userOptions.value = normalizeUsers(merged, "");
    knownUsers.value = {
      ...knownUsers.value,
      ...Object.fromEntries(pageUsers.map((user) => [user.id, user]))
    };
    currentPage.value = page;
    hasMore.value = paginated ? Boolean(response.next) : false;
  } catch (error) {
    if (generation !== searchGeneration) return;
    console.error("Search users error:", error);
    addErrorToast({ title: t("NoUserFound") });
  } finally {
    if (generation === searchGeneration) searchLoading.value = false;
  }
};

const debounceSearch = useDebounceFn((query: string) => searchUsers(query), 300);

watch(searchTerm, (query) => debounceSearch(query));

watch(
  () => shareInfo.value.shareCode,
  (nv) => {
    showLinkResult.value = Boolean(nv);
  }
);

const mappedUserOptions = computed(() => {
  const selectedUsers = selectedUserIds.value
    .map((id) => knownUsers.value[id])
    .filter((user): user is SuggestionUser => Boolean(user));
  return normalizeUsers([...selectedUsers, ...userOptions.value], "").map((item) => ({
    label: item.username,
    description: item.name,
    value: item.id
  }));
});

const createSingleSelectHandler = <T, K extends keyof T>(
  options: T[],
  valueKey: K,
  checkedKey: keyof T,
  onSelect?: (value: T[K]) => void
) => {
  return (selectedValue: T[K]) => {
    options.forEach((item) => {
      (item as any)[checkedKey] = item[valueKey] === selectedValue;
    });
    onSelect?.(selectedValue);
  };
};

const shareLinkRequest = reactive({
  expiredTime: 10,
  actionPerm: "writable"
});

const expiredOptions = reactive<ExpiredOption[]>([
  { label: getMinuteLabel(1, t), value: 1, checked: false },
  { label: getMinuteLabel(5, t), value: 5, checked: false },
  { label: getMinuteLabel(10, t), value: 10, checked: true },
  { label: getMinuteLabel(20, t), value: 20, checked: false },
  { label: getMinuteLabel(60, t), value: 60, checked: false }
]);

const actionsPermOptions = reactive<ActionPermOption[]>([
  { label: t("Writable"), value: "writable", checked: true },
  { label: t("ReadOnly"), value: "readonly", checked: false }
]);

const handleChangeExpired = createSingleSelectHandler(expiredOptions, "value", "checked", (value) => {
  shareLinkRequest.expiredTime = value;
});
const handleChangeActionPerm = createSingleSelectHandler(actionsPermOptions, "value", "checked", (value) => {
  shareLinkRequest.actionPerm = value;
});

const generateShareURL = (shareId: string, shareCode: string) => {
  const encodedShareCode = encodeURIComponent(shareCode);
  return withBaseUrl(`/lion/share/${shareId}?type=lion&code=${encodedShareCode}`, props.endpointUrl);
};

const handleCreateLink = async () => {
  if (!shareInfo.value.sessionId) {
    addErrorToast({ title: t("FailedCreateConnection") });
    return;
  }

  const users = selectedUserIds.value.map((id) => {
    const user = knownUsers.value[id];
    return user || { id, name: id, username: id };
  });

  createLoading.value = true;
  try {
    let ticket = props.ticket || "";
    try {
      ticket =
        (await createLionConnectTicket(props.endpointUrl || window.location.origin, props.tokenId || "")) || ticket;
    } catch (error) {
      if (!ticket) throw error;
    }
    const response = await createShareURL(
      {
        session_id: props.session,
        expired_time: shareLinkRequest.expiredTime,
        users,
        action_perm: shareLinkRequest.actionPerm
      },
      props.endpointUrl,
      {
        ticket,
        token: props.tokenId
      }
    );

    if (response.success === false || !response.id || !response.verify_code) {
      throw new Error(response.message || t("CreateLinkFailed"));
    }
    shareInfo.value.shareId = response.id;
    shareInfo.value.shareCode = response.verify_code;
    shareInfo.value.shareURL = generateShareURL(response.id, response.verify_code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    addErrorToast({ title: message ? `${t("CreateLinkFailed")}: ${message}` : t("CreateLinkFailed") });
  } finally {
    createLoading.value = false;
  }
};

const handleCopyShareURL = () => {
  const url = shareInfo.value.shareURL;
  const shareCode = shareInfo.value.shareCode;
  if (!url || !shareCode) {
    addErrorToast({ title: t("NoLink") });
    return;
  }
  const text = `${t("LinkAddr")}: ${url}\n${t("VerifyCode")}: ${shareCode}`;
  writeClipboardText(text)
    .then(() => toast.add({ title: t("CopyShareURLSuccess"), color: "info" }))
    .catch((error) => {
      console.error("copy share url failed", error);
      addErrorToast({ title: t("NoPermission") });
    });
};

const handleBack = () => {
  showLinkResult.value = false;
  shareInfo.value.shareCode = "";
  shareInfo.value.shareId = "";
  shareInfo.value.shareURL = "";
  shareLinkRequest.expiredTime = 10;
  shareLinkRequest.actionPerm = "writable";
  expiredOptions.forEach((item) => (item.checked = item.value === 10));
  actionsPermOptions.forEach((item) => (item.checked = item.value === "writable"));
  selectedUserIds.value = [];
};
</script>

<template>
  <div v-if="!showLinkResult" class="space-y-4">
    <div>
      <div class="mb-2 text-xs-plus">
        {{ t("ExpiredTime") }}
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="item in expiredOptions"
          :key="item.value"
          :color="item.checked ? 'primary' : 'neutral'"
          :variant="item.checked ? 'soft' : 'outline'"
          class="justify-center"
          @click="handleChangeExpired(item.value)"
        >
          {{ item.label }}
        </UButton>
      </div>
    </div>

    <UDivider />

    <div>
      <div class="mb-2 text-xs-plus">
        {{ t("ActionPerm") }}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          v-for="item in actionsPermOptions"
          :key="item.value"
          :color="item.checked ? 'primary' : 'neutral'"
          :variant="item.checked ? 'soft' : 'outline'"
          class="justify-center"
          @click="handleChangeActionPerm(item.value)"
        >
          {{ item.label }}
        </UButton>
      </div>
    </div>

    <UDivider />

    <div>
      <div class="mb-2 text-xs-plus">
        {{ t("ShareUser") }}
      </div>
      <USelectMenu
        v-model="selectedUserIds"
        v-model:search-term="searchTerm"
        multiple
        :items="mappedUserOptions"
        value-key="value"
        label-key="label"
        ignore-filter
        :search-input="{ placeholder: t('GetShareUser') }"
        :loading="searchLoading"
        :placeholder="t('GetShareUser')"
        class="w-full"
        @focus="userOptions.length || searchLoading ? undefined : searchUsers(searchTerm)"
        @update:open="(open) => open && !userOptions.length && !searchLoading && searchUsers(searchTerm)"
      >
        <template #content-bottom>
          <div v-if="hasMore" class="border-t border-default p-1.5">
            <UButton
              block
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="searchLoading"
              @click.stop="searchUsers(currentQuery, true)"
            >
              {{ t("LoadMore") }}
            </UButton>
          </div>
        </template>
      </USelectMenu>
    </div>

    <UDivider />

    <UButton block :disabled="disabledCreateLink" :loading="createLoading" @click="handleCreateLink">
      {{ t("CreateLink") }}
    </UButton>
  </div>

  <div v-else class="space-y-4">
    <UInput :model-value="shareInfo.shareURL" readonly placeholder="Link">
      <template #leading>
        <UIcon name="i-lucide-link" class="size-3.5" />
      </template>
    </UInput>

    <UCard>
      <div class="flex flex-col items-center gap-2 py-4 text-center">
        <span>{{ t("VerifyCode") }}</span>
        <span class="text-2xl tracking-widest">{{ shareInfo.shareCode }}</span>
      </div>
    </UCard>

    <div class="grid grid-cols-2 gap-2">
      <UButton icon="i-lucide-copy" color="success" variant="soft" block @click="handleCopyShareURL">
        {{ t("CopyLink") }}
      </UButton>
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" block @click="handleBack">
        {{ t("Back") }}
      </UButton>
    </div>
  </div>
</template>
